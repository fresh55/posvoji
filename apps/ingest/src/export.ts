import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { PoliteClient } from "@posvoji/provider-sdk";
import { ChangeSet, Dataset } from "@posvoji/schema";
import type { Animal, ProviderPolicy } from "@posvoji/schema";
import { applyAllowedFields } from "./allowed-fields";
import { cacheImages, hotlinkedCachePermittedImages } from "./cache-images";
import { cacheLogos, logoTargets } from "./cache-logos";
import { buildChangeSet } from "./changes";
import { flagList, flagValue, hasFlag } from "./cli";
import {
  assertBootstrapCrawlIsComplete,
  captureCrawledSnapshot,
  readPreviousCrawledDataset,
} from "./crawled-snapshot";
import { guardProviderRequests, type CrawlClient } from "./crawl-guard";
import { exitCodeForRun } from "./exit-codes";
import {
  advanceCrawlState,
  crawlProviderIncrementally,
  crawlStatePath,
  forceFullRefresh,
  readCrawlState,
  type CrawlState,
  type ProviderCrawlResult,
} from "./incremental-crawl";
import {
  crawlablePolicies,
  isManualPolicy,
  loadPolicies,
  manualPolicies,
  type LoadedPolicy,
} from "./policies";
import { normalizeAnimalOrigin } from "./normalize-origin";
import {
  applyOverrides,
  buildOverrideReport,
  fetchPortalListings,
  fetchPortalOverrides,
  portalIntegrationEnabled,
  type ListingsReport,
  type PortalListingsPayload,
} from "./portal-overrides";
import { buildListingAnimals } from "./portal-listings";
import { providers } from "./registry";
import { loadShelters } from "./shelters";
import {
  carryFirstSeenAt,
  guardMassRemoval,
  guardUniqueAnimalIds,
  readPreviousDataset,
  retainableAnimals,
} from "./run-guards";
import { writeShareCards } from "./share-cards";
import {
  crawledDatasetPath,
  datasetDir,
  datasetPath,
  overrideReportPath,
} from "./paths";
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
// Re-reads every listed animal's detail page instead of only the ones the
// incremental schedule says are due. For a parser change that has to reach
// every record at once; CRAWL_GENERATION in incremental-crawl.ts is the
// version of this that does not need anybody to remember the flag.
const refreshAll = hasFlag(argv, "--refresh-all");

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
  previousAnimals: readonly Animal[],
  state: CrawlState,
): Promise<ProviderCrawlResult> {
  const provider = providers.find((p) => p.id === policy.providerId);
  if (!provider) {
    throw new Error(
      `policy ${policy.providerId} is enabled but no provider is registered`,
    );
  }
  // ProviderContext types client as the concrete PoliteClient, so the guard
  // is handed over as one. It forwards everything it does not refuse.
  const guarded = guardProviderRequests(
    client,
    policy,
  ) as unknown as PoliteClient;
  const ctx = { client: guarded, policy };
  // The list page still decides who is listed, and every listed animal ends up
  // in the result. What this skips is the detail page of an animal we already
  // hold and read recently enough.
  return crawlProviderIncrementally(provider, ctx, {
    previous: previousAnimals,
    forcedBecause: forceFullRefresh(state, policy, refreshAll),
  });
}

interface CrawlOutcome {
  animals: Animal[];
  // Providers whose crawl completed. Everybody else's records come from the
  // previous dataset.
  crawled: Set<string>;
  failed: string[];
  // Providers that re-fetched every listed animal, so every record they just
  // produced came from the current parsers under the current policy. Only
  // these advance the crawl state.
  fullyRefreshed: ProviderPolicy[];
  // Detail pages read, and detail pages the run did not have to read, over
  // every provider that finished.
  fetched: number;
  reused: number;
}

// One shelter's site being down, or its robots.txt refusing us, must not throw
// away every other shelter's finished crawl. A failed provider keeps its
// previous animals and the run exits 2 so the scheduler notices without
// reading that as a reason to skip the deploy.
async function crawl(
  client: CrawlClient,
  policies: LoadedPolicy[],
  previousAnimals: readonly Animal[],
  state: CrawlState,
): Promise<CrawlOutcome> {
  // A manual provider has no site to read and no adapter in registry.ts: its
  // animals are written into our own portal and arrive on the listings feed
  // instead. Skipping it here is what keeps crawlProvider from throwing
  // "enabled but no provider is registered" for it on every run. Everything
  // after the crawl treats its listings exactly like these animals.
  const enabled = crawlablePolicies(policies);
  const settled = await Promise.allSettled(
    enabled.map(({ policy }) =>
      crawlProvider(client, policy, previousAnimals, state),
    ),
  );

  const animals: Animal[] = [];
  const crawled = new Set<string>();
  const failed: string[] = [];
  const fullyRefreshed: ProviderPolicy[] = [];
  let fetched = 0;
  let reused = 0;
  for (const [index, result] of settled.entries()) {
    const policy = enabled[index]!.policy;
    const providerId = policy.providerId;
    if (result.status === "fulfilled") {
      crawled.add(providerId);
      animals.push(...result.value.animals);
      fetched += result.value.fetched;
      reused += result.value.reused;
      if (result.value.fullRefresh) fullyRefreshed.push(policy);
      continue;
    }
    failed.push(providerId);
    const reason =
      result.reason instanceof Error
        ? (result.reason.stack ?? result.reason.message)
        : String(result.reason);
    console.error(`crawl ${providerId} FAILED: ${reason}`);
  }
  return { animals, crawled, failed, fullyRefreshed, fetched, reused };
}

// Two previous datasets, and which one a step reads is the whole point of the
// split. animals.json is what the last run published, corrections merged in;
// animals.crawled.json is what its crawl produced, before any of them.
//
// Everything below that means "what did the crawl say last time" reads the
// crawled one: the reuse input, firstSeenAt, the carried-over records, the
// removal guard. Only the change set reads the published one, and deliberately
// so: it answers "what changed on the site", and a correction that is still
// standing is not a change. See crawled-snapshot.ts for the feedback loop this
// closes.
//
// The two files are also checked against each other there: they carry one
// run's generatedAt, so a pair that disagrees is a run that stopped between
// the two writes and neither file can be trusted as last run's other half.
const previousPublished = readPreviousDataset(datasetPath, { discardPrevious });
const { dataset: previousCrawled, bootstrapping: bootstrappingSnapshot } =
  readPreviousCrawledDataset(crawledDatasetPath, {
    discardPrevious,
    portalEnabled: portalIntegrationEnabled(),
    refreshAll,
    targetedProviderId: requestedProviderId,
    published: previousPublished,
    publishedPath: datasetPath,
  });
// Which generation of the parsers, and which policy, produced the records we
// are about to reuse. A missing or unreadable file forces a full crawl, which
// is the safe direction.
const crawlState = readCrawlState();

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

// The manual shelters' animals, fetched here for the same reason and from the
// same portal. It does not abort the run when it fails, though, and that is
// the one way it differs from the overrides above: a manual shelter has no
// listing of its animals anywhere but here, so a portal outage has to leave
// its records where they are rather than empty its page. A throw is turned
// into the same carry-forward a failed crawl gets, below.
let listingsPayload: PortalListingsPayload | null = null;
let listingsFetchFailed = false;
try {
  listingsPayload = await fetchPortalListings();
} catch (error) {
  listingsFetchFailed = true;
  const reason =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`portal listings FAILED: ${reason}`);
}

const {
  animals: crawled,
  crawled: crawledProviderIds,
  failed,
  fullyRefreshed,
  fetched: detailsFetched,
  reused: detailsReused,
} = await crawl(
  client,
  crawlPolicies,
  previousCrawled?.animals ?? [],
  crawlState,
);
console.log(
  `detail pages: ${detailsFetched} fetched, ${detailsReused} reused`,
);

// The manual providers this run is responsible for: enabled, ingestion:
// manual, and inside the --provider filter when there is one. crawlPolicies
// is already narrowed to the target, so a targeted run over a manual shelter
// builds only its listings and carries everybody else forward, the same as a
// targeted crawl does.
const manualProviderIds = manualPolicies(crawlPolicies).map(
  ({ policy }) => policy.providerId,
);

// The feed is the whole listing of every manual shelter, so a payload that
// arrived answers for all of them at once, including a shelter that now has
// nothing: its animals leave the dataset the same way a crawled shelter's do
// when they leave its list page, and guardMassRemoval below still stands
// between an emptied feed and a deletion.
const listingsResult = listingsPayload
  ? buildListingAnimals(
      listingsPayload,
      policyById,
      loadShelters(),
      new Date().toISOString(),
      { providerIds: new Set(manualProviderIds) },
    )
  : null;
if (listingsResult) {
  for (const providerId of manualProviderIds) crawledProviderIds.add(providerId);
  console.log(
    `portal listings: ${listingsResult.animals.length} listed, ` +
      `${listingsResult.skipped.length} skipped`,
  );
  for (const skip of listingsResult.skipped) {
    console.warn(
      `portal listings: skipped ${skip.providerId}/${skip.listingId}: ${skip.reason}`,
    );
  }
} else if (listingsFetchFailed) {
  // Exactly what a failed crawl does: the provider is not in crawledProviderIds,
  // so its previous animals are carried forward below, and it is in failed, so
  // the run exits 2 and the scheduler sees a run that was not clean.
  failed.push(...manualProviderIds);
} else if (manualProviderIds.length > 0) {
  console.log(
    `portal listings: no feed this run, ${manualProviderIds.length} manual ` +
      `provider(s) carried forward: ${manualProviderIds.join(", ")}`,
  );
}

// The second half of the bootstrap check, and the first point at which it can
// be made: whether every enabled provider finished and refreshed in full is a
// fact about the crawl that just returned. It runs here, before firstSeenAt is
// carried, before a photo is fetched and before any file is written, so a
// bootstrap run that would have to carry a provider over from the merged
// dataset stops with nothing on disk to undo. See crawled-snapshot.ts.
//
// Manual providers are left out of the enabled set it checks. "Fully
// refreshed" is a fact about a detail crawl and they have none: the listings
// feed is every listing the shelter has, every run, so nothing of theirs is
// ever carried over from the merged dataset. A feed that did not arrive is
// the case that would carry them over, and that already puts them in failed,
// which this check refuses.
if (bootstrappingSnapshot) {
  assertBootstrapCrawlIsComplete({
    failed,
    fullyRefreshedProviderIds: fullyRefreshed.map((p) => p.providerId),
    enabledProviderIds: crawlablePolicies(policies).map(
      ({ policy }) => policy.providerId,
    ),
  });
  console.log(
    `bootstrap: every enabled provider crawled and fully refreshed, so ` +
      `${crawledDatasetPath} is the crawl's own answer`,
  );
}

// This run's origin for animal records: what the crawl returned, plus what the
// manual shelters wrote into the portal. The listings join here, before a
// single guard has run, because a manual listing is a crawled animal whose
// crawler is the portal: from this line down nothing distinguishes them, so
// they take the same firstSeenAt carry, the same uniqueness and removal
// guards, the same allowedFields backstop, the same image cache, and they land
// in animals.crawled.json like everything else. See docs/MANUAL-LISTINGS.md.
const produced = [...crawled, ...(listingsResult?.animals ?? [])];

// A re-crawled animal is not a new one, so keep the date we first saw it.
// Matched by id first and by the page it came from second, so a provider that
// changes how it derives ids does not reset every date it has. The manual
// shelters are named because that second match cannot work for them: every one
// of their listings links to the same shelter page, so the page identifies the
// shelter and not the animal. Their ids never change, so the first match is
// all they need.
const refreshed = carryFirstSeenAt(previousCrawled?.animals ?? [], produced, {
  sharedSourceUrlProviderIds: new Set(
    policies
      .filter(({ policy }) => isManualPolicy(policy))
      .map(({ policy }) => policy.providerId),
  ),
});

// Everything this run has no fresh answer for: the other shelters on a
// targeted run, any provider whose crawl failed above, and every manual
// provider when the listings feed did not arrive. Their records come back from
// the previous dataset rather than being dropped, but only while their policy
// still lets us publish them, so a shelter that switched off or withdrew its
// permission leaves the dataset even on a run that never crawled it.
const carried = (previousCrawled?.animals ?? []).filter(
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

guardUniqueAnimalIds(seeded);

// The portal keys every override by the shelter slug of the account that
// recorded it and ships that slug as providerId; this pipeline matches an
// override to an animal on source.providerId. That join is the only thing
// stopping one shelter from correcting another shelter's animal, and it holds
// only while an animal's shelter id and its provider id are the same string.
// Nothing else in the schema enforces it, so it is checked here on every run.
// A manual listing is built with both read off the same providerId, and its
// sourceUrl is the shelter page that slug routes to, so the check covers the
// listings feed for free.
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

// The crawl's own answer for this run, taken here because this is the last
// point at which nothing has been merged into it, and copied out so no later
// phase can reach it. Written at the end as animals.crawled.json, and read
// back by the next run as previousCrawled. The manual shelters' listings are
// in it: the portal is their crawler, and what it said is exactly what this
// file is for.
const crawledSnapshot = captureCrawledSnapshot(restricted.animals);

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
// Against the crawled snapshot, because this guard is about the crawl: a
// shelter emptying out is a fact about its site, not about our corrections.
// The current side stays the merged list, which is the same length and the
// same providers as crawledSnapshot: applyOverrides edits fields, never adds
// or drops an animal.
// A manual shelter is counted like any other, because it is in
// crawledProviderIds exactly when the listings feed answered for it. Archiving
// is that shelter's delete, so a feed that suddenly names three of its
// nineteen animals is the same event as a parser that stopped matching, and it
// stops here until an operator passes --accept-removals. A feed that did not
// arrive at all leaves the provider out of crawledProviderIds, so the guard
// does not read a portal outage as a removal.
guardMassRemoval(previousCrawled?.animals ?? [], overridden, {
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

// The same run's crawl, stamped with the same generatedAt even though it was
// captured several phases earlier: the two files describe one run, and a
// second clock reading would only invite somebody to compare them. It goes
// through the same schema, so a snapshot that could not be published is not
// written either.
//
// It carries no cachedUrl and none of the derived image fields for anything
// this run crawled, because cacheImages runs after the capture; a record
// carried over from a file that had them keeps them until its provider is
// crawled again. Either way their state here says nothing: reuseAnimal in
// incremental-crawl.ts strips exactly those fields off a reused record before
// republishing it, and cacheImages grafts them back from the manifest as it
// stands now. The snapshot is only ever read as crawl input.
const crawledDataset: Dataset = Dataset.parse({
  generatedAt,
  animals: crawledSnapshot,
});

// The published dataset against the last published one. This is the only
// comparison in the run that uses the merged files on both sides, so a
// correction that has been standing for weeks stays out of changes.json
// instead of being reported again on every run.
const changes = buildChangeSet({
  generatedAt,
  previous: previousPublished?.animals ?? [],
  current: dataset.animals,
});

writeFileAtomic(datasetPath, JSON.stringify(dataset, null, 2));
writeFileAtomic(crawledDatasetPath, JSON.stringify(crawledDataset, null, 2));
writeFileAtomic(
  join(datasetDir, "changes.json"),
  JSON.stringify(ChangeSet.parse(changes), null, 2),
);
// Written on every run, including runs with no portal configured, so the
// file never goes stale and an empty report cannot be mistaken for "the
// shelters have corrected nothing".
const listingsReport: ListingsReport = {
  enabled: listingsPayload !== null,
  failed: listingsFetchFailed,
  ...(listingsPayload ? { portalGeneratedAt: listingsPayload.generatedAt } : {}),
  applied: listingsResult?.applied ?? [],
  skipped: listingsResult?.skipped ?? [],
};
writeFileAtomic(
  overrideReportPath,
  JSON.stringify(
    buildOverrideReport(
      generatedAt,
      portalPayload,
      overrideResult,
      listingsReport,
    ),
    null,
    2,
  ),
);
// Written with the dataset rather than at the end of the crawl: it says which
// providers' records on disk were produced by the current parsers, so it may
// only advance once those records are the ones on disk. A provider that failed,
// or that only refreshed the animals that were due, keeps its old entry. A
// manual provider never gets one: it has no parser generation and no detail
// pages to schedule, so nothing in incremental-crawl.ts ever asks about it.
writeFileAtomic(
  crawlStatePath,
  JSON.stringify(
    advanceCrawlState(crawlState, fullyRefreshed, generatedAt),
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
// failed holds providers whose crawl threw and, when the listings feed did
// not come back, every enabled manual provider: the same outcome by the same
// route, so one list and one exit code cover both.
if (failed.length > 0) {
  console.error(
    `no fresh records for ${failed.length} provider(s): ${failed.join(", ")}. ` +
      `Their previous records were carried forward and the dataset was ` +
      `written, but this run is not a clean one.`,
  );
}
process.exitCode = exitCodeForRun(failed.length);
