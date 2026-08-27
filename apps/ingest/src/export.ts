import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PoliteClient } from "@posvoji/provider-sdk";
import { Animal, ChangeEntry, ChangeSet, Dataset } from "@posvoji/schema";
import { cacheImages, hotlinkedCachePermittedImages } from "./cache-images";
import { cacheLogos, logoTargets } from "./cache-logos";
import { loadPolicies, type LoadedPolicy } from "./policies";
import { normalizeAnimalOrigin } from "./normalize-origin";
import {
  applyOverrides,
  buildOverrideReport,
  fetchPortalOverrides,
} from "./portal-overrides";
import { providers } from "./registry";
import { writeShareCards } from "./share-cards";
import { datasetDir, overrideReportPath } from "./paths";

const USER_AGENT = "PosvojiBot/0.1 (+https://posvoji.si/bot; bot@posvoji.si)";

// A targeted export refreshes one provider while preserving every other
// provider's last validated records. This is useful when onboarding a new
// remote-image provider without re-crawling hundreds of unrelated animals.
const providerFlag = process.argv.indexOf("--provider");
const requestedProviderId =
  providerFlag === -1 ? undefined : process.argv[providerFlag + 1];
if (providerFlag !== -1 && !requestedProviderId) {
  throw new Error("--provider requires a provider id");
}

function readPreviousDataset(): Dataset | undefined {
  const path = join(datasetDir, "animals.json");
  if (!existsSync(path)) return undefined;
  const result = Dataset.safeParse(JSON.parse(readFileSync(path, "utf8")));
  return result.success ? result.data : undefined;
}

// fetchedAt and lastSeenAt change on every run, so they can't count as a change.
function stableView(animal: Animal): string {
  const { source, ...rest } = animal;
  const { fetchedAt: _f, lastSeenAt: _l, ...stableSource } = source;
  return JSON.stringify({ ...rest, source: stableSource });
}

function toChangeEntry(animal: Animal): ChangeEntry {
  return {
    id: animal.id,
    providerId: animal.source.providerId,
    sourceUrl: animal.source.sourceUrl,
    species: animal.species,
    name: animal.name,
  };
}

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
  client: PoliteClient,
  policy: LoadedPolicy["policy"],
): Promise<Animal[]> {
  const provider = providers.find((p) => p.id === policy.providerId);
  if (!provider) {
    throw new Error(
      `policy ${policy.providerId} is enabled but no provider is registered`,
    );
  }
  const ctx = { client, policy };
  const refs = await provider.discover(ctx);
  console.log(`${provider.id}: discovered ${refs.length} animals`);
  const animals: Animal[] = [];
  for (const ref of refs) {
    const raw = await provider.fetch(ctx, ref);
    animals.push(Animal.parse(await provider.normalize(ctx, raw)));
  }
  return animals;
}

async function crawl(
  client: PoliteClient,
  policies: LoadedPolicy[],
): Promise<Animal[]> {
  const results = await Promise.all(
    policies
      .filter(({ policy }) => policy.enabled)
      .map(({ policy }) => crawlProvider(client, policy)),
  );
  return results.flat();
}

const previous = readPreviousDataset();
const previousById = new Map(
  (previous?.animals ?? []).map((a) => [a.id, a] as const),
);

const policies = loadValidPolicies();
const crawlPolicies = requestedProviderId
  ? policies.filter(({ policy }) => policy.providerId === requestedProviderId)
  : policies;
if (requestedProviderId && crawlPolicies.length === 0) {
  throw new Error(`unknown provider: ${requestedProviderId}`);
}
const client = new PoliteClient({ userAgent: USER_AGENT });

// Fetched before the crawl, not after it. A bad token or a payload that no
// longer matches the contract throws, and a run that is going to fail on that
// should fail in the first second rather than after a crawl of many minutes.
// The request is milliseconds, so there is nothing to gain by overlapping it.
const portalPayload = await fetchPortalOverrides();

const crawled = await crawl(client, crawlPolicies);

// A re-crawled animal is not a new one, so keep the date we first saw it.
const refreshed = crawled.map((animal) => {
  const before = previousById.get(animal.id);
  if (!before) return animal;
  return {
    ...animal,
    source: { ...animal.source, firstSeenAt: before.source.firstSeenAt },
  };
});

const refreshedProviderIds = new Set(
  crawlPolicies.map(({ policy }) => policy.providerId),
);
const preserved = requestedProviderId
  ? (previous?.animals ?? []).filter(
      (animal) => !refreshedProviderIds.has(animal.source.providerId),
    )
  : [];
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

// Shelter corrections from the portal are merged in after the crawl (and
// after firstSeenAt is carried over) so a re-crawl can never silently
// clobber them, and before image caching and the change-set diff so an
// overridden field — including a status change — shows up in changes.json
// as an update and ships in the written dataset.
const overrideResult = portalPayload
  ? applyOverrides(seeded, portalPayload)
  : null;
const overridden = overrideResult?.animals ?? seeded;
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
const { animals, fetched, reused, deleted } = await cacheImages(
  overridden,
  client,
  imagePolicies,
  requestedProviderId ? { refreshProviderIds: refreshedProviderIds } : {},
);
console.log(
  `images: ${fetched} fetched, ${reused} revalidated, ${deleted} deleted`,
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

const currentIds = new Set(animals.map((a) => a.id));
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

const changes: ChangeSet = {
  generatedAt,
  added: animals.filter((a) => !previousById.has(a.id)).map(toChangeEntry),
  updated: animals
    .filter((a) => {
      const before = previousById.get(a.id);
      return before !== undefined && stableView(before) !== stableView(a);
    })
    .map(toChangeEntry),
  removed: (previous?.animals ?? [])
    .filter((a) => !currentIds.has(a.id))
    .map(toChangeEntry),
};

const dataset: Dataset = { generatedAt, animals };

writeFileSync(
  join(datasetDir, "animals.json"),
  JSON.stringify(Dataset.parse(dataset), null, 2),
);
writeFileSync(
  join(datasetDir, "changes.json"),
  JSON.stringify(ChangeSet.parse(changes), null, 2),
);
// Written on every run, including runs with no portal configured, so the
// file never goes stale and an empty report cannot be mistaken for "the
// shelters have corrected nothing".
writeFileSync(
  overrideReportPath,
  JSON.stringify(
    buildOverrideReport(generatedAt, portalPayload, overrideResult),
    null,
    2,
  ),
);

console.log(
  `exported ${animals.length} animals ` +
    `(+${changes.added.length} ~${changes.updated.length} -${changes.removed.length}) to ${datasetDir}`,
);
