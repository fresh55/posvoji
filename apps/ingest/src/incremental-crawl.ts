import { createHash } from "node:crypto";
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
import { excludedPathFor } from "./crawl-guard";
import { datasetDir } from "./paths";

// The crawl used to fetch every animal's detail page on every run: 500 pages
// twice a day, at polite pacing, for a set of pages that almost never change.
// The list page is what says who is still listed, and removals are detected
// from it, so a detail page only has to be re-read often enough to catch an
// edit the shelter made to a listing it kept. This module decides, per animal,
// whether that re-read is due.
//
// A skipped animal is still present: its previous record is republished, so it
// ships, it is not a removal, and it counts as present for the removal guard.

// The refresh window. Three days is the compromise: shorter re-reads more
// pages for edits that are rare, longer lets a fact a shelter corrected on its
// own page (a name, an age, a "posvojen" note in the text) sit stale for
// longer. Status changes do not wait for it, because a listing that is gone
// disappears from the list page and is removed the same run, and an animal
// whose status is already not "available" is re-read on every run below.
export const REFRESH_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60_000;

// Which generation of the parsers produced the records we are holding.
//
// **Bump this by hand whenever a provider parser changes what it derives.**
// Reused records keep the parse they were written with, so without a bump a
// parser fix would only reach the animals that happen to fall due, and the
// rest would keep the old value until they rotated through the window (or
// forever, for a field the old parser never set). A bump forces one full
// detail crawl of every provider on the next run, after which the incremental
// schedule resumes.
//
// It is a per-provider marker rather than a per-animal one because Animal is a
// strictObject in packages/schema and this is not dataset content: it is state
// about how the dataset was produced. It lives in the sidecar below, next to
// the image-cache and share-card manifests, for the same reason those do.
// Losing the file is safe in the expensive direction: an unreadable or missing
// state means "generation unknown", which forces the full crawl.
//
// v1 = the parsers as of the run this file was added.
export const CRAWL_GENERATION = 1;

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

// Why this provider must re-fetch every animal this run, or undefined when the
// incremental schedule applies.
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

// The animal's own phase inside the refresh window, in milliseconds.
//
// Without it every animal would fall due at the same moment: they were all
// last fetched by the same full crawl, so they would all go stale together and
// one run in six would fetch everything. 52 bits of a sha256 over the animal
// id spreads them uniformly instead, and it is deterministic, so an animal
// keeps its slot across runs, hosts and Node versions. 13 hex digits stay
// inside Number.MAX_SAFE_INTEGER.
export function refreshOffsetMs(id: string, windowMs: number): number {
  const digest = createHash("sha256").update(id).digest("hex").slice(0, 13);
  return Number.parseInt(digest, 16) % windowMs;
}

export type RefreshReason = "new" | "forced" | "status" | "stale" | "fresh";

export interface RefreshDecision {
  fetch: boolean;
  reason: RefreshReason;
}

export interface RefreshOptions {
  // The record this run's list page matched, or undefined for an animal we
  // have never held.
  previous: Animal | undefined;
  now: number;
  forceAll?: boolean;
  windowDays?: number;
}

// The whole per-animal decision, pure so it can be exercised without a crawl.
//
// The window is measured from source.fetchedAt, which is the last time we
// actually read the detail page. lastSeenAt moves on every run and says
// nothing about how stale the parse is.
export function decideRefresh(options: RefreshOptions): RefreshDecision {
  const previous = options.previous;
  if (previous === undefined) return { fetch: true, reason: "new" };
  if (options.forceAll) return { fetch: true, reason: "forced" };

  // Reserved, on hold and unknown are the states that move: an available
  // animal that stops being available usually leaves the list page entirely,
  // but these stay on it while the shelter edits the page. They are ~4% of the
  // dataset, so re-reading them every run costs little.
  if (previous.status !== "available") return { fetch: true, reason: "status" };

  const windowMs = (options.windowDays ?? REFRESH_WINDOW_DAYS) * DAY_MS;
  const fetchedAt = Date.parse(previous.source.fetchedAt);
  // An unreadable date, or one from the future (a host with a bad clock),
  // cannot be reasoned about. Re-fetching writes a usable one.
  if (Number.isNaN(fetchedAt) || fetchedAt > options.now) {
    return { fetch: true, reason: "stale" };
  }

  // Each animal's window boundaries sit at its own offset, so an animal falls
  // due once per window and the due moments are spread evenly across the whole
  // window rather than bunched at one run. Missing a run does not skip a turn:
  // the boundary stays crossed until the animal is fetched.
  const offset = refreshOffsetMs(previous.id, windowMs);
  const cycle = (at: number): number => Math.floor((at - offset) / windowMs);
  return cycle(options.now) > cycle(fetchedAt)
    ? { fetch: true, reason: "stale" }
    : { fetch: false, reason: "fresh" };
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
  // The reason every animal is being fetched, from forceFullRefresh.
  forcedBecause?: string;
  windowDays?: number;
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
  const listed = await provider.discover(ctx);
  console.log(`${providerId}: discovered ${listed.length} animals`);
  const { crawlable: refs, excluded } = partitionExcluded(listed, ctx.policy);

  const now = options.now ? options.now() : new Date();
  const seenAt = now.toISOString();
  const nowMs = now.getTime();

  const animals: Animal[] = [];
  const failedRefs: SourceAnimalRef[] = [];
  const failures: string[] = [];
  let fetched = 0;
  let reused = 0;
  for (const ref of refs) {
    const previous = held.get(refKey(ref));
    const decision = decideRefresh({
      previous,
      now: nowMs,
      forceAll: options.forcedBecause !== undefined,
      windowDays: options.windowDays,
    });
    if (!decision.fetch && previous) {
      animals.push(reuseAnimal(previous, seenAt));
      reused++;
      continue;
    }
    // One listing the shelter left behind, whose page 404s on every run, used
    // to reject the whole provider: every finished refresh was thrown away,
    // export carried the entire previous dataset forward and the run exited 2
    // again the next time, indefinitely. The failure is per animal, so it is
    // contained per animal.
    try {
      const raw = await provider.fetch(ctx, ref);
      const animal = Animal.parse(await provider.normalize(ctx, raw));
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
