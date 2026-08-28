import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ChangeSet, Dataset } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { cacheImages, hotlinkedCachePermittedImages } from "./cache-images";
import { cacheLogos, logoTargets } from "./cache-logos";
import { buildChangeSet } from "./changes";
import { flagList, flagValue, hasFlag } from "./cli";
import { guardExcludedPaths, type CrawlClient } from "./crawl-guard";
import { exitCodeForRun } from "./exit-codes";
import { loadPolicies, type LoadedPolicy } from "./policies";
import { normalizeAnimalOrigin } from "./normalize-origin";
import {
  applyOverrides,
  buildOverrideReport,
  fetchPortalOverrides,
} from "./portal-overrides";
import { providers } from "./registry";
import {
  carryFirstSeenAt,
  guardMassRemoval,
  readPreviousDataset,
  retainableAnimals,
} from "./run-guards";
import { writeShareCards } from "./share-cards";
import { datasetDir, overrideReportPath } from "./paths";
import { writeFileAtomic } from "./write-atomic";

const USER_AGENT = "PosvojiBot/0.1 (+https://posvoji.si/bot; bot@posvoji.si)";

const argv = process.argv.slice(2);

// A targeted export refreshes one provider while preserving every other
// provider's last validated records. This is useful when onboarding a new
// remote-image provider without re-crawling hundreds of unrelated animals.
const requestedProviderId = flagValue(argv, "--provider");
// A shelter really can rehome most of its animals at once, so the removal
// guard below has an escape hatch. Repeatable, and comma-separated lists work.
const acceptRemovals = new Set(flagList(argv, "--accept-removals"));
// Only for a previous dataset that is unreadable and not worth restoring.
const discardPrevious = hasFlag(argv, "--discard-previous");

const datasetPath = join(datasetDir, "animals.json");

function loadValidPolicies(): LoadedPolicy[] {
  const { policies, errors } = loadPolicies();
  if (errors.length > 0) {
    for (const { dir, message } of errors) {
      console.error(`invalid  ${dir}: ${message}`);
    }
    throw new Error("refusing to crawl with invalid provider policies");
  }
  return policies;
}

// Each policy targets a different shelter site, so crawling them concurrently
// is no less polite than crawling them one at a time: PoliteClient already
// serializes requests per host with its own delay between them. Running the
// providers themselves in parallel just removes the artificial wait for an
// unrelated host to finish first.
async function crawlProvider(
  client: CrawlClient,
  policy: LoadedPolicy["policy"],
): Promise<Animal[]> {
  const provider = providers.find((p) => p.id === policy.providerId);
  if (!provider) {
    throw new Error(
      `policy ${policy.providerId} is enabled but no provider is registered`,
    );
  }
  // ProviderContext types client as the concrete PoliteClient, so the guard
  // is handed over as one. It forwards everything it does not refuse.
  const guarded = guardExcludedPaths(client, policy) as unknown as PoliteClient;
  const ctx = { client: guarded, policy };
  const refs = await provider.discover(ctx);
  console.log(`${provider.id}: discovered ${refs.length} animals`);
  const animals: Animal[] = [];
  for (const ref of refs) {
    const raw = await provider.fetch(ctx, ref);
    animals.push(Animal.parse(await provider.normalize(ctx, raw)));
  }
  return animals;
}

interface CrawlOutcome {
  animals: Animal[];
  // Providers whose crawl completed. Everybody else's records come from the
  // previous dataset.
  crawled: Set<string>;
  failed: string[];
}

// One shelter's site being down, or its robots.txt refusing us, must not throw
// away every other shelter's finished crawl. A failed provider keeps its
// previous animals and the run exits 2 so the scheduler notices without
// reading that as a reason to skip the deploy.
async function crawl(
  client: CrawlClient,
  policies: LoadedPolicy[],
): Promise<CrawlOutcome> {
  const enabled = policies.filter(({ policy }) => policy.enabled);
  const settled = await Promise.allSettled(
    enabled.map(({ policy }) => crawlProvider(client, policy)),
  );

  const animals: Animal[] = [];
  const crawled = new Set<string>();
  const failed: string[] = [];
  for (const [index, result] of settled.entries()) {
    const providerId = enabled[index]!.policy.providerId;
    if (result.status === "fulfilled") {
      crawled.add(providerId);
      animals.push(...result.value);
      continue;
    }
    failed.push(providerId);
    const reason =
      result.reason instanceof Error
        ? (result.reason.stack ?? result.reason.message)
        : String(result.reason);
    console.error(`crawl ${providerId} FAILED: ${reason}`);
  }
  return { animals, crawled, failed };
}

const previous = readPreviousDataset(datasetPath, { discardPrevious });

const policies = loadValidPolicies();
const policyById = new Map(
  policies.map(({ policy }) => [policy.providerId, policy] as const),
);

if (requestedProviderId) {
  const target = policyById.get(requestedProviderId);
  if (!target) {
    throw new Error(`unknown provider: ${requestedProviderId}`);
  }
  // A disabled provider used to pass this check, crawl nothing and take its
  // animals down with it.
  if (!target.enabled) {
    throw new Error(
      `provider ${requestedProviderId} is disabled in its policy.yaml, so a ` +
        `targeted run would crawl nothing and drop every animal it has`,
    );
  }
  if (target.permission.status !== "granted") {
    throw new Error(
      `provider ${requestedProviderId} has permission.status ` +
        `"${target.permission.status}", not "granted"`,
    );
  }
}
const crawlPolicies = requestedProviderId
  ? policies.filter(({ policy }) => policy.providerId === requestedProviderId)
  : policies;
const client = new PoliteClient({ userAgent: USER_AGENT });

// Fetched before the crawl, not after it. A bad token or a payload that no
// longer matches the contract throws, and a run that is going to fail on that
// should fail in the first second rather than after a crawl of many minutes.
// The request is milliseconds, so there is nothing to gain by overlapping it.
const portalPayload = await fetchPortalOverrides();

const { animals: crawled, crawled: crawledProviderIds, failed } = await crawl(
  client,
  crawlPolicies,
);

// A re-crawled animal is not a new one, so keep the date we first saw it.
// Matched by id first and by the page it came from second, so a provider that
// changes how it derives ids does not reset every date it has.
const refreshed = carryFirstSeenAt(previous?.animals ?? [], crawled);

// Everything this run did not re-crawl: the other shelters on a targeted run,
// and any provider whose crawl failed above. Their records come back from the
// previous dataset rather than being dropped, but only while their policy
// still lets us publish them, so a shelter that switched off or withdrew its
// permission leaves the dataset even on a run that never crawled it.
const carried = (previous?.animals ?? []).filter(
  (animal) => !crawledProviderIds.has(animal.source.providerId),
);
const { animals: preserved, dropped } = retainableAnimals(carried, policyById);
for (const drop of dropped) {
  console.warn(
    `dropped ${drop.count} carried-over animal(s) of ${drop.providerId}: ${drop.reason}`,
  );
}

// Preserved animals go through the same normalization as freshly crawled
// ones, so a bad value already in the previous dataset is cleaned up even
// by a targeted run that does not re-crawl its provider.
const seeded = [...preserved, ...refreshed].map(normalizeAnimalOrigin);

// The portal keys every override by the shelter slug of the account that
// recorded it and ships that slug as providerId; this pipeline matches an
// override to an animal on source.providerId. That join is the only thing
// stopping one shelter from correcting another shelter's animal, and it holds
// only while an animal's shelter id and its provider id are the same string.
// Nothing else in the schema enforces it, so it is checked here on every run.
const misattributed = seeded.filter(
  (a) => a.shelter.id !== a.source.providerId,
);
if (misattributed.length > 0) {
  const named = misattributed
    .map(
      (a) =>
        `${a.id} (shelter ${a.shelter.id}, provider ${a.source.providerId})`,
    )
    .join(", ");
  throw new Error(
    `shelter id and providerId disagree, which would break override authorization: ${named}`,
  );
}

// The policy backstop for what each shelter granted. It runs here, over the
// crawled and the carried-over records alike, for three reasons:
//
// - after normalization, so it sees the field set that would actually ship
//   rather than one a later step still edits;
// - before image caching, so a photo from a provider that did not list
//   images is never requested, let alone written to disk;
// - before the portal overrides, because those are not crawled content. A
//   shelter typing a correction into our own portal is stating the fact
//   itself, which is a stronger grant than the crawl permission this list
//   records; the same is already true of descriptions, where an override
//   sets shortDescription whatever the policy's descriptions grant says.
const restricted = applyAllowedFields(seeded, policyById);
for (const { providerId, field, count } of restricted.stripped) {
  console.warn(
    `allowedFields: ${providerId}: field ${field} is not in allowedFields, ` +
      `stripped from ${count} animal(s)`,
  );
}

// Shelter corrections from the portal are merged in after the crawl (and
// after firstSeenAt is carried over) so a re-crawl can never silently
// clobber them, and before image caching and the change-set diff so an
// overridden field — including a status change — shows up in changes.json
// as an update and ships in the written dataset.
const overrideResult = portalPayload
  ? applyOverrides(restricted.animals, portalPayload)
  : null;
const overridden = overrideResult?.animals ?? restricted.animals;
if (overrideResult) {
  const moved = overrideResult.conflicts.filter((c) => c.kind === "moved");
  console.log(
    `portal: ${overrideResult.applied.length} overrides applied, ` +
      `${overrideResult.unmatched.length} unmatched, ` +
      `${moved.length} conflicting with the crawl`,
  );
  // The correction goes on winning. This is the only place a moved source
  // shows up in a run, so it is named per animal rather than counted.
  for (const conflict of moved) {
    console.warn(
      `portal: ${conflict.providerId}/${conflict.animalId} ${conflict.field}: ` +
        `crawl moved from ${JSON.stringify(conflict.baseline)} to ` +
        `${JSON.stringify(conflict.crawled)}, still showing ` +
        `${JSON.stringify(conflict.override)}`,
    );
  }
}

// The last check before anything destructive. A parser whose selectors stopped
// matching returns an empty list without an error, and every step below this
// line reads that as "the shelter emptied": the photos, the cards and the
// records go, and firstSeenAt is reset for whatever comes back.
guardMassRemoval(previous?.animals ?? [], overridden, {
  accepted: acceptRemovals,
  crawledProviderIds,
});

// Cache permitted photos before the dataset is written so cachedUrl ships
// with it; the same sync deletes copies that fell out of the dataset.
const imagePolicies = new Map(
  policies.map(({ policy }) => [policy.providerId, policy.images] as const),
);
mkdirSync(datasetDir, { recursive: true });
// A targeted run caches the provider it just crawled, otherwise enabling a
// cache-permitted shelter would leave its photos hotlinked until somebody ran
// a full export. Preserved providers stay in scope for the deletion sweep but
// out of scope for requests, so their cached files and URLs are neither
// deleted nor needlessly rechecked.
const { animals, fetched, reused, deleted, derived } = await cacheImages(
  overridden,
  client,
  imagePolicies,
  requestedProviderId ? { refreshProviderIds: crawledProviderIds } : {},
);
console.log(
  `images: ${fetched} fetched, ${reused} revalidated, ${deleted} deleted`,
);
console.log(
  `image variants: ${derived.thumbs} thumbs, ${derived.rungs} rungs, ` +
    `${derived.blurs} placeholders, ${derived.avifs} avif derived`,
);

// cachedUrl is set by cacheImages above, so this catches whatever it could
// not cache: a source that 404s, exceeds the size cap or fails to decode.
const hotlinked = hotlinkedCachePermittedImages(animals);
if (hotlinked.length > 0) {
  const detail =
    hotlinked.length <= 5
      ? hotlinked.map((h) => h.sourceUrl).join(", ")
      : [...new Set(hotlinked.map((h) => h.providerId))].join(", ");
  console.warn(
    `images: ${hotlinked.length} cache-permitted image(s) left hotlinked (${detail})`,
  );
}

// Shelter logos are keyed by provider, not by animal, so the sync runs over
// every permitted shelter even on a targeted run: revalidation keeps that
// free, and passing a subset would read as "the rest revoked their logo" and
// delete their files.
const logos = await cacheLogos(
  logoTargets(policies.map(({ policy }) => policy)),
  client,
);
console.log(
  `logos: ${logos.fetched} fetched, ${logos.reused} reused, ${logos.deleted} deleted`,
);
// Discovery is a ranked guess. Naming what it picked lets a maintainer pin the
// url into policy.yaml, after which the guess is never made again.
for (const [providerId, url] of Object.entries(logos.discovered)) {
  console.log(`logos: ${providerId} discovered ${url} (pin it in policy.yaml)`);
}

const generatedAt = new Date().toISOString();

// Share cards are drawn from the cached photos, so they come after the image
// sync and read the dataset's own build time: an age on a card and the same
// age on the page are measured from one clock. A targeted run needs no
// special case, since an unchanged animal keeps its fingerprint and its card.
const cards = await writeShareCards(animals, {
  reference: new Date(generatedAt),
});
console.log(
  `share cards: ${cards.written} drawn, ${cards.reused} reused, ${cards.deleted} deleted`,
);

// Parsed once, then used for both the diff and the file. The two used to
// disagree on key order alone: the file carries the schema's order, an animal
// that just went through the image cache carries cachedUrl and its derived
// fields appended, and JSON.stringify follows insertion order, so every cached
// animal showed up as updated on every run.
const dataset: Dataset = Dataset.parse({ generatedAt, animals });
const changes = buildChangeSet({
  generatedAt,
  previous: previous?.animals ?? [],
  current: dataset.animals,
});

writeFileAtomic(datasetPath, JSON.stringify(dataset, null, 2));
writeFileAtomic(
  join(datasetDir, "changes.json"),
  JSON.stringify(ChangeSet.parse(changes), null, 2),
);
// Written on every run, including runs with no portal configured, so the
// file never goes stale and an empty report cannot be mistaken for "the
// shelters have corrected nothing".
writeFileAtomic(
  overrideReportPath,
  JSON.stringify(
    buildOverrideReport(generatedAt, portalPayload, overrideResult),
    null,
    2,
  ),
);

console.log(
  `exported ${dataset.animals.length} animals ` +
    `(+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}) to ${datasetDir}`,
);

// See exit-codes.ts for what the codes mean. In short: a run that got this
// far wrote a dataset, so it exits 0 or 2, never 1. The scheduled crawl
// deploys on both and refuses on anything else.
if (failed.length > 0) {
  console.error(
    `crawl failed for ${failed.length} provider(s): ${failed.join(", ")}. ` +
      `Their previous records were carried forward and the dataset was ` +
      `written, but this run is not a clean one.`,
  );
}
process.exitCode = exitCodeForRun(failed.length);
