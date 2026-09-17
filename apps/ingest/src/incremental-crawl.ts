import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AdoptionProvider,
  ProviderContext,
  SourceAnimalRef,
} from "@posvoji/provider-sdk";
import { Animal } from "@posvoji/schema";
import type { ProviderPolicy } from "@posvoji/schema";
import { stripCacheDerivedFields } from "./cache-images";
import { excludedPathFor, isAllowedListingUrl, guardProviderRequests } from "./crawl-guard";
import { datasetDir } from "./paths";

// Every admitted crawl verifies every detail. The provider schedule limits
// frequency; previous records are used only for failure recovery.

// Which generation of the parsers produced the records we are holding.
//
// **Bump this by hand whenever a provider parser changes what it derives.**
// This marker records which parser produced a fully successful provider crawl.
// Failed details retain their previous values and leave the marker unchanged.
//
// It is a per-provider marker rather than a per-animal one because Animal is a
// strictObject in packages/schema and this is not dataset content: it is state
// about how the dataset was produced. It lives in the sidecar below, next to
// the image-cache and share-card manifests, for the same reason those do.
// Losing the file is safe in the expensive direction: an unreadable or missing
// state means "generation unknown", which forces the full crawl.
//
// v1 = the parsers as of the run this file was added.
// v2 = Ljubljana's broad Ostali category no longer implies rabbit.
export const CRAWL_GENERATION = 2;

// Sidecar next to animals.json. Not a schema change, and not something the
// site reads.
export const crawlStatePath = join(datasetDir, "crawl-state.json");

export interface ProviderCrawlState {
  generation: number;
  // The policy fields whose effect a record carries rather than re-deriving.
  // images decides an image's rights, descriptions decides whether
  // shortDescription ships at all and attribution is copied verbatim: all
  // three are read at normalize time, so a reused record carries the policy as
  // it stood when it was last fetched. allowedFields is applied on every run,
  // but it strips, and what it stripped is gone from the record we hold: a
  // widened list only reaches an animal that is crawled again. A change to any
  // of them forces the full crawl that makes the new policy real.
  policy: string;
  refreshedAt: string;
}

export interface CrawlState {
  providers: Record<string, ProviderCrawlState>;
}

export function policyFingerprint(policy: ProviderPolicy): string {
  return [
    policy.images,
    policy.descriptions,
    policy.attribution,
    [...(policy.allowedFields ?? [])].sort().join(","),
  ].join(" | ");
}

export function readCrawlState(path: string = crawlStatePath): CrawlState {
  if (!existsSync(path)) return { providers: {} };
  let why: string;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const providers =
      parsed && typeof parsed === "object"
        ? (parsed as { providers?: unknown }).providers
        : undefined;
    if (providers && typeof providers === "object") {
      return { providers: providers as Record<string, ProviderCrawlState> };
    }
    why = "no providers object";
  } catch (error) {
    why = String(error);
  }
  console.warn(
    `crawl state at ${path} is unreadable (${why}). Every provider gets a ` +
      `full detail crawl this run and the file is rewritten.`,
  );
  return { providers: {} };
}

// Records that a provider's whole listing was re-fetched under the current
// generation and the current policy. Only providers that actually did that are
// touched, so a provider whose crawl failed keeps its old entry and is tried
// again next run.
export function advanceCrawlState(
  state: CrawlState,
  refreshed: readonly ProviderPolicy[],
  at: string,
): CrawlState {
  const providers = { ...state.providers };
  for (const policy of refreshed) {
    providers[policy.providerId] = {
      generation: CRAWL_GENERATION,
      policy: policyFingerprint(policy),
      refreshedAt: at,
    };
  }
  return { providers };
}

// Diagnostic reason for a full refresh; all admitted crawls verify details
// even when neither the parser generation nor the policy changed.
export function forceFullRefresh(
  state: CrawlState,
  policy: ProviderPolicy,
  refreshAll: boolean,
): string | undefined {
  if (refreshAll) return "--refresh-all";
  const before = state.providers[policy.providerId];
  if (!before) return "no recorded crawl generation";
  if (before.generation !== CRAWL_GENERATION) {
    return `parser generation ${before.generation} -> ${CRAWL_GENERATION}`;
  }
  if (before.policy !== policyFingerprint(policy)) {
    return "policy.yaml changed what a record carries";
  }
  return undefined;
}

// What ties a ref from the list page to a record we already hold. Both halves
// are exact: a ref whose id or whose url has moved is fetched rather than
// reused, because the id a provider derives and the page it links to are both
// inputs to the record we would be republishing.
export function refKey(ref: {
  sourceAnimalId?: string | undefined;
  sourceUrl: string;
}): string {
  return `${ref.sourceAnimalId ?? ""}\n${ref.sourceUrl}`;
}

export function indexPrevious(
  previous: readonly Animal[],
  providerId: string,
): Map<string, Animal> {
  const byRef = new Map<string, Animal>();
  for (const animal of previous) {
    if (animal.source.providerId !== providerId) continue;
    byRef.set(refKey(animal.source), animal);
  }
  return byRef;
}

// Set on an image by the ingest image cache, never by a provider: a parser
// emits { sourceUrl, rights } and nothing else. A reused record comes from the
// previous dataset with a run's worth of caching already grafted on, so it is
// taken off again here and cacheImages grafts it back from the manifest as it
// stands now. Reusing them as they are would republish a cachedUrl whose file
// the deletion sweep had just removed (a source photo that 404s), or one whose
// provider no longer has caching rights, and hotlinkedCachePermittedImages
// would see a cachedUrl and report nothing.

// The previous record, republished. firstSeenAt and fetchedAt are kept as they
// are: we did see this animal on the list page, which is what lastSeenAt
// records, but we did not read its detail page, and fetchedAt is what the next
// run measures staleness from. Parsed like a freshly normalized animal so a
// reused record clears the same gate.
export function reuseAnimal(previous: Animal, seenAt: string): Animal {
  return Animal.parse({
    ...previous,
    source: { ...previous.source, lastSeenAt: seenAt },
    images: previous.images.map(stripCacheDerivedFields),
  });
}

export interface ProviderCrawlResult {
  // Actual discovery time, including a successfully empty shelter listing.
  checkedAt: string;
  animals: Animal[];
  listed: number;
  fetched: number;
  reused: number;
  // Refs whose detail page could not be turned into a record this run. The
  // previous record was carried forward for each of them where there was one,
  // and the ref was dropped where there was not, so the rest of the provider
  // still ships. Empty on a clean crawl.
  failedRefs: SourceAnimalRef[];
  // Listed refs under a path policy.yaml excludes. Never fetched, never
  // reused, never published, and not a failure: the list page names them,
  // the policy says no, and the policy wins quietly.
  excluded: number;
  // Every listed animal was fetched, so all of this provider's records were
  // produced by the current parsers under the current policy.
  fullRefresh: boolean;
}

export interface IncrementalCrawlOptions {
  // The whole previous dataset. Filtered to this provider here, so a caller
  // does not have to.
  previous: readonly Animal[];
  // Diagnostic label only; every admitted crawl fetches all details.
  forcedBecause?: string;
  // Injected in tests. Taken once per provider, after discovery, so every
  // animal in one crawl records the same lastSeenAt.
  now?: () => Date;
}

// The listing, split into the refs this run may crawl and the ones under a
// path policy.yaml excludes (private-owner listings live behind those paths).
// Splitting here rather than skipping inside the loop keeps the exclusion out
// of the run's accounting: an excluded ref is not fetched, not reused, not
// published, and not a failure. A shelter's list page linking into an excluded
// section is the adapter's business, not a degraded run.
function partitionExcluded(
  refs: readonly SourceAnimalRef[],
  policy: ProviderPolicy,
): { crawlable: SourceAnimalRef[]; excluded: SourceAnimalRef[] } {
  const crawlable: SourceAnimalRef[] = [];
  const excluded: SourceAnimalRef[] = [];
  for (const ref of refs) {
    const under = excludedPathFor(ref.sourceUrl, policy.crawl.excludePaths);
    if (under === undefined) {
      if (!isAllowedListingUrl(ref.sourceUrl, policy)) {
        throw new Error(`${policy.providerId}: discovered URL is outside crawl.allowPaths; refusing to fetch or reuse it`);
      }
      crawlable.push(ref);
      continue;
    }
    excluded.push(ref);
    console.warn(
      `${policy.providerId}: ${ref.sourceUrl} is under "${under}", which ` +
        `policy.yaml excludes from the crawl; not fetched, not reused, not ` +
        `published`,
    );
  }
  return { crawlable, excluded };
}

// An adapter owns exactly the provider and source reference being crawled.
// Animal.parse checks the public shape, but it cannot know that relationship:
// without this guard a faulty adapter can emit another shelter's providerId
// and receive that shelter's policy and portal overrides downstream.
function assertNormalizedIdentity(
  animal: Animal,
  policy: ProviderPolicy,
  ref: SourceAnimalRef,
): void {
  const mismatches: string[] = [];
  if (animal.source.providerId !== policy.providerId) {
    mismatches.push(
      `source.providerId ${JSON.stringify(animal.source.providerId)} does not ` +
        `match policy providerId ${JSON.stringify(policy.providerId)}`,
    );
  }
  if (animal.shelter.id !== policy.providerId) {
    mismatches.push(
      `shelter.id ${JSON.stringify(animal.shelter.id)} does not match policy ` +
        `providerId ${JSON.stringify(policy.providerId)}`,
    );
  }
  if (animal.source.sourceAnimalId !== ref.sourceAnimalId) {
    mismatches.push(
      `source.sourceAnimalId ${JSON.stringify(animal.source.sourceAnimalId)} ` +
        `does not match discovered id ${JSON.stringify(ref.sourceAnimalId)}`,
    );
  }
  if (animal.source.sourceUrl !== ref.sourceUrl) {
    mismatches.push(
      `source.sourceUrl ${JSON.stringify(animal.source.sourceUrl)} does not ` +
        `match discovered URL ${JSON.stringify(ref.sourceUrl)}`,
    );
  }
  if (mismatches.length > 0) {
    throw new Error(
      `${policy.providerId}: normalized animal ${JSON.stringify(animal.id)} ` +
        `has mismatched identity: ${mismatches.join("; ")}`,
    );
  }
}

export async function crawlProviderIncrementally(
  provider: AdoptionProvider,
  ctx: ProviderContext,
  options: IncrementalCrawlOptions,
): Promise<ProviderCrawlResult> {
  const providerId = ctx.policy.providerId;
  const held = indexPrevious(options.previous, providerId);
  const contextFor = (discoveredUrl?: string): ProviderContext => ({
    ...ctx,
    client: guardProviderRequests(ctx.client, ctx.policy, discoveredUrl) as ProviderContext["client"],
  });
  const discoveryContext = contextFor();
  const listed = await provider.discover(discoveryContext);
  console.log(`${providerId}: discovered ${listed.length} animals`);
  const { crawlable: refs, excluded } = partitionExcluded(listed, ctx.policy);

  const now = options.now ? options.now() : new Date();
  const seenAt = now.toISOString();

  const animals: Animal[] = [];
  const failedRefs: SourceAnimalRef[] = [];
  const failures: string[] = [];
  let fetched = 0;
  let reused = 0;
  for (const ref of refs) {
    const previous = held.get(refKey(ref));
    // One listing the shelter left behind, whose page 404s on every run, used
    // to reject the whole provider: every finished refresh was thrown away,
    // export carried the entire previous dataset forward and the run exited 2
    // again the next time, indefinitely. The failure is per animal, so it is
    // contained per animal.
    try {
      const detailContext = ctx.policy.crawl.discoveredUrls === "exact"
        ? contextFor(ref.sourceUrl)
        : discoveryContext;
      const raw = await provider.fetch(detailContext, ref);
      const animal = Animal.parse(await provider.normalize(detailContext, raw));
      assertNormalizedIdentity(animal, ctx.policy, ref);
      animals.push(animal);
      fetched++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${providerId}: ${ref.sourceUrl} FAILED: ${message}`);
      failedRefs.push(ref);
      failures.push(message);
      // A ref we have never held is dropped: there is nothing to carry
      // forward, and the listing comes back next run.
      if (previous) {
        animals.push(reuseAnimal(previous, seenAt));
        reused++;
      }
    }
  }

  // A site that answers nothing is not a listing with one bad page in it. Its
  // provider fails the way it did before, so export carries the whole previous
  // dataset forward rather than shipping a listing we could not read.
  if (fetched === 0 && failedRefs.length > 0) {
    throw new Error(
      `${providerId}: all ${failedRefs.length} detail fetch(es) this run ` +
        `attempted failed, so the provider is treated as failed rather than ` +
        `partially stale: ${failures.join("; ")}`,
    );
  }

  const because = options.forcedBecause
    ? ` (full refresh: ${options.forcedBecause})`
    : "";
  console.log(
    `${providerId}: ${listed.length} listed, ${fetched} fetched, ` +
      `${reused} reused, ${failedRefs.length} failed, ${excluded.length} ` +
      `excluded${because}`,
  );

  return {
    animals,
    listed: listed.length,
    fetched,
    reused,
    failedRefs,
    excluded: excluded.length,
    // Every crawlable ref was fetched, so every record this provider produced
    // came from the current parsers. A failed ref is not a fetched one, so
    // this is already false whenever any ref failed; said outright because
    // the crawl state and the bootstrap check both hang off it.
    fullRefresh: failedRefs.length === 0 && fetched === refs.length,
    checkedAt: seenAt,
  };
}
