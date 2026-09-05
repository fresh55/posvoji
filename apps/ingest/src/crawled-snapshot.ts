import { existsSync, readFileSync } from "node:fs";
import type { Animal, Dataset } from "@posvoji/schema";
import type { OverrideReport } from "./portal-report";
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
  // overrides.json, the audit trail export.ts writes on every run. It is the
  // only evidence on disk of whether a correction has ever been merged into
  // animals.json, and the portal-off fallback below needs it before it can
  // call that file the crawl's own answer.
  overrideReportPath: string;
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

// Which of two dataset stamps is the later one. Both come out of
// Dataset.parse, so they are ISO strings and Date.parse orders them whatever
// their formatting; a string that does not parse leaves nothing to say beyond
// whether the two are the same, and undefined means "different, in an order
// this cannot name".
function compareGenerations(
  left: string,
  right: string,
): number | undefined {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return left === right ? 0 : undefined;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

// One run writes animals.crawled.json and animals.json from the same clock
// reading, the snapshot first. A run that dies between the two writes leaves
// this run's snapshot beside the previous published file, and the order is
// chosen so that this is the recoverable direction: the snapshot is the crawl
// as it ran, complete, so every "what did the crawl say last time" question
// below is answered correctly. The reuse input, firstSeenAt, the carried
// records and the removal guard all read it and are right. Only changes.json
// has a baseline one generation old, and it answers "what changed on the site"
// against a file that is one run behind, so it reports last run's changes once
// more. That is a warning, not an abort.
//
// The other direction is not recoverable in the same way, and with this write
// order it cannot come from a crash at all: a published file newer than the
// snapshot means somebody put an old snapshot back beside a newer publication.
// The snapshot is then not what the last crawl said, and everything above
// would carry stale records forward as the crawl's own answer. That throws.
//
// The remaining cases:
//
//   - snapshot present, animals.json missing or discarded: allowed. The
//     snapshot is still crawl truth; only the change set loses its baseline
//     and reports every animal as added for one run.
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

  const order = compareGenerations(
    options.published.generatedAt,
    crawled.generatedAt,
  );
  if (order === 0) return;

  if (order === -1) {
    console.warn(
      `WARNING: ${path} is from ${crawled.generatedAt} and ` +
        `${options.publishedPath} from ${options.published.generatedAt}, so ` +
        `the last run stopped between the two dataset writes. The snapshot is ` +
        `written first and is the whole crawl, so everything that reads it is ` +
        `last run's crawl and this run continues on it. Only changes.json has ` +
        `a baseline one generation old: it reports the previous run's changes ` +
        `once more.`,
    );
    return;
  }

  throw new Error(
    `the two previous datasets are from different runs, and the published one ` +
      `is the newer: ${options.publishedPath} was generated at ` +
      `${options.published.generatedAt} and ${path} at ${crawled.generatedAt}. ` +
      `One run writes the snapshot first and the published dataset second, so ` +
      `a crash cannot produce this; an older snapshot restored beside a newer ` +
      `publication can. ${path} is then not what the last crawl said, and ` +
      `every record carried forward from it would be stale. Nothing was read ` +
      `and nothing was written. Delete ${path} and bootstrap it again: with ` +
      `the portal integration off the next run re-derives it from ` +
      `${options.publishedPath}, and with the portal on it takes one full ` +
      `clean run, \`pnpm dataset:export --refresh-all\` over every provider.`,
  );
}

// What overrides.json says about corrections having reached animals.json. It
// is written on every run, portal configured or not, so its absence is itself
// an answer: the last run predates the report.
type OverrideEvidence =
  // No report on disk. The run that wrote animals.json ran before the report
  // existed, which is before the portal integration existed too.
  | { kind: "no-report" }
  // A report that says the portal was not configured and applied nothing.
  | { kind: "clean" }
  // A report that says otherwise, or one that cannot be read. Both fail
  // closed: an unreadable report proves nothing, and the cost of guessing
  // wrong is a correction written into the snapshot as crawl truth.
  | { kind: "contaminated"; why: string };

function readOverrideEvidence(path: string): OverrideEvidence {
  if (!existsSync(path)) return { kind: "no-report" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return {
      kind: "contaminated",
      why: `the override report at ${path} is not valid JSON (${error})`,
    };
  }

  const report = parsed as Partial<OverrideReport>;
  if (
    report === null ||
    typeof report !== "object" ||
    typeof report.enabled !== "boolean" ||
    !Array.isArray(report.applied)
  ) {
    return {
      kind: "contaminated",
      why:
        `the override report at ${path} does not have the shape of one ` +
        `(an enabled flag and an applied list)`,
    };
  }

  if (report.enabled) {
    return {
      kind: "contaminated",
      why:
        `the override report at ${path} says the portal integration was ` +
        `configured on the last run`,
    };
  }
  if (report.applied.length > 0) {
    return {
      kind: "contaminated",
      why:
        `the override report at ${path} records ` +
        `${report.applied.length} applied override(s)`,
    };
  }
  return { kind: "clean" };
}

// The rules for standing animals.json in for a snapshot that is not there,
// for every case where it carries corrections or might. reason says why it
// cannot simply be read, and goes into all three messages.
//
// Refusing a targeted run happens here rather than after the crawl, because
// --provider is a flag on this run and no outcome of the crawl can make it
// acceptable. Both throws exit 1, which is EXIT_BLOCKED in exit-codes.ts:
// nothing written, nothing shipped.
function bootstrapFromPublished(
  path: string,
  options: PreviousCrawledOptions,
  reason: string,
): PreviousCrawledResult {
  if (options.targetedProviderId) {
    throw new Error(
      `no crawled snapshot at ${path}, ${reason}, and this run targets ` +
        `--provider ${options.targetedProviderId}. Every other provider's ` +
        `records would be carried over from ${options.publishedPath}, ` +
        `corrections included, and written into the new snapshot as if the ` +
        `crawl had said them. Bootstrap it with one full run over every ` +
        `provider first: \`pnpm dataset:export --refresh-all\`, then run the ` +
        `targeted export.`,
    );
  }

  if (options.refreshAll) {
    console.warn(
      `WARNING: no crawled snapshot at ${path} and ${reason}, so this run ` +
        `bootstraps one with --refresh-all. Every listed animal is re-read ` +
        `from its shelter, so the snapshot this run writes is the crawl's own ` +
        `answer. This run has to be a clean one: if any enabled provider ` +
        `fails or does not refresh in full, it aborts after the crawl and ` +
        `before anything is written, because a provider carried over from ` +
        `${options.publishedPath} brings its corrections with it.`,
    );
    return { dataset: options.published, bootstrapping: true };
  }

  throw new Error(
    `no crawled snapshot at ${path}, and ${reason}. Reusing ` +
      `${options.publishedPath} here would seed the snapshot with the ` +
      `corrections merged into it, which is exactly what the two files exist ` +
      `to keep apart. Bootstrap it with one full run: ` +
      `\`pnpm dataset:export --refresh-all\`.`,
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
// into it. The portal being off today does not answer that: it may have been
// on for the runs that wrote the file, and a correction merged then is still
// in it. overrides.json is the evidence, so:
//
//   - portal off and no override report: the last run predates the report, so
//     it predates the portal, so no override has ever reached animals.json.
//     It is the last crawl, and it is used with a log line saying so.
//   - portal off and a report showing no configured portal and no applied
//     override: the same, and now on evidence.
//   - portal off but a report showing the portal configured or an override
//     applied: animals.json carries corrections and is treated exactly like
//     the portal-on case below. A targeted run would otherwise write another
//     shelter's correction into the new snapshot as crawl truth, and clearing
//     that override later would not revert the value until its provider was
//     fully re-crawled.
//   - portal on, one full non-targeted run with --refresh-all: every listed
//     animal of every enabled provider is re-read from the shelter, so the
//     snapshot this run writes comes from the crawl. This is the bootstrap the
//     aborts ask for, and it is only half checkable here: whether every
//     provider actually finished and actually refreshed is known after the
//     crawl, by assertBootstrapCrawlIsComplete.
//   - portal on, anything else: refused. Reusing the merged file for the
//     providers this run does not re-read is the bug this split fixes, and
//     doing it on the one run that has no snapshot would seed the new file
//     with corrections.
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
    const evidence = readOverrideEvidence(options.overrideReportPath);
    if (evidence.kind === "contaminated") {
      return bootstrapFromPublished(
        path,
        options,
        `the portal integration is off now, but ${evidence.why}, so ` +
          `corrections were merged into ${options.publishedPath} by an ` +
          `earlier run`,
      );
    }
    const because =
      evidence.kind === "no-report"
        ? `there is no override report at ${options.overrideReportPath}, so ` +
          `the last run predates it and no override has ever been merged into ` +
          `${options.publishedPath}`
        : `${options.overrideReportPath} records no configured portal and no ` +
          `applied override, so no correction has been merged into ` +
          `${options.publishedPath}`;
    console.log(
      `no crawled snapshot at ${path} yet. The portal integration is off and ` +
        `${because}; it is the last crawl, and this run reads it and writes ` +
        `the snapshot.`,
    );
    return { dataset: options.published, bootstrapping: false };
  }

  return bootstrapFromPublished(
    path,
    options,
    "the portal integration is enabled",
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
