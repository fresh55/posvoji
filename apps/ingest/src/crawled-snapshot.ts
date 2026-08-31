import { existsSync } from "node:fs";
import type { Animal, Dataset } from "@posvoji/schema";
import { readPreviousDataset, type PreviousDatasetOptions } from "./run-guards";

// The run writes two datasets. animals.json is what the site reads: the crawl
// with the portal's shelter corrections merged in. animals.crawled.json is the
// same run's records as the crawl produced them, before a single override was
// merged.
//
// The split exists because the pipeline reads its own output back. Records the
// incremental crawl did not re-read are republished from the previous file, so
// while that file was the merged one, a correction came back in as if the
// shelter's own site had said it: a cleared override did not revert until the
// animal happened to fall due for a re-crawl, portal-merge.ts read its own
// correction as the crawl catching up, and "what the crawl says" stopped
// meaning anything. This module owns the two ends of the fix: taking the
// snapshot, and reading last run's back.

// The crawl's own answer, copied out of the pipeline.
//
// applyOverrides returns a new array but re-parses only the animals it
// changed, so every other element is the object the caller passed in;
// cacheImages builds new animals rather than decorating these, and the share
// cards only read. So nothing today would write an override value or a
// cachedUrl into this array. That is a property of three modules that have no
// reason to preserve it, and the guarantee this file makes is worth more than
// the copy costs: one structuredClone of a few megabytes, once per run. After
// this call the snapshot is unreachable from everything downstream, whatever
// those modules do later.
export function captureCrawledSnapshot(animals: readonly Animal[]): Animal[] {
  return structuredClone(animals as Animal[]);
}

export interface PreviousCrawledOptions extends PreviousDatasetOptions {
  // Whether the portal integration is configured for this run, from
  // portalIntegrationEnabled(). It decides how strict the bootstrap below is.
  portalEnabled: boolean;
  // Whether this run re-reads every listed animal's detail page. It is what
  // makes a bootstrap run produce a snapshot the crawl actually wrote.
  refreshAll: boolean;
  // The --provider argument, when the run targets a single provider. A
  // targeted run crawls one provider and carries every other one over from
  // the previous dataset, so it can never write a snapshot that is only crawl
  // truth. Known before the crawl starts, so it is refused before it.
  targetedProviderId?: string | undefined;
  // animals.json as it has already been read, and where it was read from. The
  // fallback for the one run between shipping this and having a snapshot, and
  // the other half of the generation pair checked below.
  published: Dataset | undefined;
  publishedPath: string;
}

export interface PreviousCrawledResult {
  // Last run's crawl, or undefined when there is nothing to inherit.
  dataset: Dataset | undefined;
  // True only for the strict bootstrap: no snapshot on disk, the portal
  // integration on, and animals.json standing in for one. The run that sets
  // this has to prove after the crawl that every enabled provider was crawled
  // and fully refreshed, because anything it carries forward instead comes
  // from the merged file and would be written into the new snapshot as crawl
  // truth. assertBootstrapCrawlIsComplete below is that proof.
  //
  // The portal-off fallback leaves it false on purpose: with the integration
  // off no override has ever been merged, so the merged file and the crawl
  // are the same records and a carried-over one contaminates nothing.
  bootstrapping: boolean;
}

// One run writes animals.json and animals.crawled.json from the same clock
// reading, one after the other. A run that dies between the two writes leaves
// a new merged dataset beside the previous snapshot, and every "what did the
// crawl say last time" question below would then be answered by a run that is
// one generation behind: the reuse input, firstSeenAt, the carried records and
// the removal guard. Nothing about the older file looks wrong on its own, so
// the pair is checked rather than the files.
//
// The asymmetric cases are not symmetrical in what they cost:
//
//   - snapshot present, animals.json missing or discarded: recoverable and
//     allowed. The snapshot is still crawl truth, so everything that reads it
//     is correct; only the change set loses its baseline and reports every
//     animal as added for one run.
//   - snapshot missing, animals.json present: the bootstrap below, which is
//     recoverable by definition. That is the case this module exists to make
//     safe.
//   - both missing: the first run ever.
function assertGenerationPair(
  path: string,
  crawled: Dataset,
  options: PreviousCrawledOptions,
): void {
  if (options.published === undefined) {
    console.warn(
      `WARNING: ${path} is here but ${options.publishedPath} is not, so this ` +
        `run has last run's crawl and no published baseline. The crawl side ` +
        `is unaffected; changes.json reports every animal as added once.`,
    );
    return;
  }
  if (options.published.generatedAt === crawled.generatedAt) return;

  throw new Error(
    `the two previous datasets are from different runs: ` +
      `${options.publishedPath} was generated at ` +
      `${options.published.generatedAt} and ${path} at ${crawled.generatedAt}. ` +
      `One run writes both, so a pair that disagrees is a run that stopped ` +
      `between the two writes, and the older of them is not what the last ` +
      `crawl said. Nothing was read and nothing was written. Delete ${path} ` +
      `and bootstrap it again: with the portal integration off the next run ` +
      `re-derives it from ${options.publishedPath}, and with the portal on it ` +
      `takes one full clean run, \`pnpm dataset:export --refresh-all\` over ` +
      `every provider.`,
  );
}

// Last run's crawled snapshot, with the bootstrap rules for the runs that do
// not have one yet.
//
// A snapshot that is there is read like any other previous dataset: a
// truncated one still stops the run unless --discard-previous is set. It is
// then checked against animals.json as a generation pair, above.
//
// A snapshot that is missing is either the first run ever, which is fine, or
// the first run after this file shipped, which is the case worth being careful
// about. animals.json is then the only record of the last crawl, and whether
// it can stand in for one depends on whether corrections have ever been merged
// into it:
//
//   - portal off: no override has ever reached that file, so it is the last
//     crawl, and it is used with a log line saying so.
//   - portal on, one full non-targeted run with --refresh-all: every listed
//     animal of every enabled provider is re-read from the shelter, so the
//     snapshot this run writes comes from the crawl. This is the bootstrap the
//     aborts below ask for, and it is only half checkable here: whether every
//     provider actually finished and actually refreshed is known after the
//     crawl, by assertBootstrapCrawlIsComplete.
//   - portal on, anything else: refused. Reusing the merged file for the
//     providers this run does not re-read is the bug this split fixes, and
//     doing it on the one run that has no snapshot would seed the new file
//     with corrections. The throw exits 1, which is EXIT_BLOCKED in
//     exit-codes.ts: nothing written, nothing shipped.
export function readPreviousCrawledDataset(
  path: string,
  options: PreviousCrawledOptions,
): PreviousCrawledResult {
  if (existsSync(path)) {
    const crawled = readPreviousDataset(path, options);
    // Unreadable and discarded on the operator's say-so. There is no pair
    // left to check and nothing to bootstrap from either: --discard-previous
    // already says every animal counts as added.
    if (crawled === undefined) {
      return { dataset: undefined, bootstrapping: false };
    }
    assertGenerationPair(path, crawled, options);
    return { dataset: crawled, bootstrapping: false };
  }

  // No previous run to inherit from at all.
  if (options.published === undefined) {
    return { dataset: undefined, bootstrapping: false };
  }

  if (!options.portalEnabled) {
    console.log(
      `no crawled snapshot at ${path} yet. The portal integration is off, so ` +
        `no override has ever been merged into ${options.publishedPath} and ` +
        `it is the last crawl; this run reads it and writes the snapshot.`,
    );
    return { dataset: options.published, bootstrapping: false };
  }

  // Refused here rather than after the crawl, because --provider is a flag on
  // this run and no outcome of the crawl can make it acceptable.
  if (options.targetedProviderId) {
    throw new Error(
      `no crawled snapshot at ${path}, the portal integration is enabled, and ` +
        `this run targets --provider ${options.targetedProviderId}. Every ` +
        `other provider's records would be carried over from ` +
        `${options.publishedPath}, corrections included, and written into the ` +
        `new snapshot as if the crawl had said them. Bootstrap it with one ` +
        `full run over every provider first: ` +
        `\`pnpm dataset:export --refresh-all\`, then run the targeted export.`,
    );
  }

  if (options.refreshAll) {
    console.warn(
      `WARNING: no crawled snapshot at ${path}, bootstrapping one with ` +
        `--refresh-all. Every listed animal is re-read from its shelter, so ` +
        `the snapshot this run writes is the crawl's own answer. This run has ` +
        `to be a clean one: if any enabled provider fails or does not refresh ` +
        `in full, it aborts after the crawl and before anything is written, ` +
        `because a provider carried over from ${options.publishedPath} brings ` +
        `its corrections with it.`,
    );
    return { dataset: options.published, bootstrapping: true };
  }

  throw new Error(
    `no crawled snapshot at ${path}, and the portal integration is enabled. ` +
      `Reusing ${options.publishedPath} here would seed the snapshot with the ` +
      `corrections merged into it, which is exactly what the two files exist ` +
      `to keep apart. Bootstrap it with one full run: ` +
      `\`pnpm dataset:export --refresh-all\`.`,
  );
}

export interface BootstrapCrawlOutcome {
  // Providers whose crawl threw. On an ordinary run these carry their previous
  // records forward and the run exits 2; on a bootstrap run there is nothing
  // safe to carry.
  failed: readonly string[];
  // Providers that re-read every listed animal, so every record they produced
  // came from the crawl rather than from the previous dataset.
  fullyRefreshedProviderIds: readonly string[];
  // Every provider whose policy.yaml has it enabled, which is exactly the set
  // crawl() runs over on a non-targeted run.
  enabledProviderIds: readonly string[];
}

// The other half of the bootstrap check, run after the crawl and before the
// first dataset write. The read-time rules can only see the flags; whether the
// crawl actually produced a full answer for every enabled provider is known
// here.
//
// A bootstrap run has no degraded outcome. Exit 2 means "a provider failed and
// its previous records were carried forward", and on this run those records
// come from the merged dataset: carrying them forward is the contamination the
// split exists to prevent, and it would be written into the new snapshot as
// crawl truth and believed by every run after it. So this throws instead, and
// the run exits 1, EXIT_BLOCKED in exit-codes.ts: nothing written, nothing
// deployed.
export function assertBootstrapCrawlIsComplete(
  outcome: BootstrapCrawlOutcome,
): void {
  const failed = [...outcome.failed];
  const refreshed = new Set(outcome.fullyRefreshedProviderIds);
  const notRefreshed = outcome.enabledProviderIds.filter(
    (id) => !refreshed.has(id) && !failed.includes(id),
  );
  if (failed.length === 0 && notRefreshed.length === 0) return;

  const reasons: string[] = [];
  if (failed.length > 0) {
    reasons.push(`the crawl failed for ${failed.join(", ")}`);
  }
  if (notRefreshed.length > 0) {
    reasons.push(
      `${notRefreshed.join(", ")} did not re-read every listed animal`,
    );
  }

  throw new Error(
    `this run is bootstrapping the crawled snapshot, and ${reasons.join("; ")}. ` +
      `Those providers' records would come from the merged dataset, ` +
      `corrections included, and be written into the snapshot as the crawl's ` +
      `own answer. Nothing was written. Re-run ` +
      `\`pnpm dataset:export --refresh-all\` over every provider once they ` +
      `are all reachable.`,
  );
}
