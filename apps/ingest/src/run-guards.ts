import { existsSync, readFileSync } from "node:fs";
import { Dataset } from "@posvoji/schema";
import type { Animal, ProviderPolicy } from "@posvoji/schema";

// A provider with fewer animals than this is too small for a share to mean
// anything: a shelter with two dogs can rehome both in a week.
const GUARD_MIN_BEFORE = 3;
// More than this share of a provider's animals disappearing in one run is
// markup drift until an operator says otherwise.
const GUARD_MAX_LOSS = 0.8;

export interface PreviousDatasetOptions {
  // Proceed as if there were no previous dataset. Loud on purpose: it resets
  // firstSeenAt and reports every animal as added.
  discardPrevious?: boolean;
}

function discard(
  path: string,
  why: string,
  options: PreviousDatasetOptions,
): undefined {
  if (!options.discardPrevious) {
    throw new Error(
      `the previous dataset at ${path} could not be read: ${why}. ` +
        `Restore it from the last good run, or re-run with --discard-previous ` +
        `to start from nothing: every animal is then reported as added and ` +
        `every firstSeenAt is reset to today.`,
    );
  }
  console.warn(`WARNING: discarding the previous dataset at ${path}: ${why}`);
  console.warn(
    "WARNING: --discard-previous is set, so this run has nothing to compare " +
      "against: every animal counts as added, firstSeenAt is reset and the " +
      "removal guard has no baseline.",
  );
  return undefined;
}

// A missing file is the first run and is fine. A file that is there but
// unreadable is not: it used to be swallowed, which reset firstSeenAt for
// every animal and left the truncated file in place to fail the same way
// forever.
export function readPreviousDataset(
  path: string,
  options: PreviousDatasetOptions = {},
): Dataset | undefined {
  if (!existsSync(path)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return discard(path, `it is not valid JSON (${error})`, options);
  }

  const result = Dataset.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "dataset"}: ${issue.message}`)
      .join("; ");
    return discard(path, `it does not match the Dataset schema (${issues})`, options);
  }
  return result.data;
}

// The fallback key for matching an animal across runs. sourceUrl is the page
// the shelter publishes the animal on: stable for these sites even when a
// provider changes how it derives ids, which is the case this exists for.
function sourceKey(animal: Animal): string {
  return `${animal.source.providerId}\n${animal.source.sourceUrl}`;
}

// A re-crawled animal is not a new one, so it keeps the date we first saw it.
// Matching on id alone was enough until a provider changed its id derivation
// (a slug replaced by the site's own numeric post id, say): every id missed,
// every firstSeenAt reset to today, and every animal on the site looked like
// it arrived this morning. The providerId and sourceUrl pair survives that,
// so it is tried second.
//
// Two previous animals sharing one sourceUrl is a parser fault, not something
// to resolve here: the last one wins and the id match, which is exact, is
// still tried first.
export function carryFirstSeenAt(
  previous: readonly Animal[],
  current: readonly Animal[],
): Animal[] {
  const byId = new Map(previous.map((a) => [a.id, a] as const));
  const bySource = new Map(previous.map((a) => [sourceKey(a), a] as const));

  return current.map((animal) => {
    const before = byId.get(animal.id) ?? bySource.get(sourceKey(animal));
    if (!before) return animal;
    if (before.source.firstSeenAt === animal.source.firstSeenAt) return animal;
    return {
      ...animal,
      source: { ...animal.source, firstSeenAt: before.source.firstSeenAt },
    };
  });
}

// IDs key routes, change entries, portal overrides and share-card manifests.
// Every one of those consumers uses a Map or object and would silently keep
// one of two records with the same id, so fail before any merge or media sweep
// can turn a parser collision into a partially written export.
export function guardUniqueAnimalIds(animals: readonly Animal[]): void {
  const firstById = new Map<string, Animal>();
  const duplicateIds = new Set<string>();

  for (const animal of animals) {
    if (firstById.has(animal.id)) duplicateIds.add(animal.id);
    else firstById.set(animal.id, animal);
  }

  if (duplicateIds.size === 0) return;
  const ids = [...duplicateIds].sort();
  const shown = ids.slice(0, 10).map((id) => JSON.stringify(id)).join(", ");
  const more = ids.length > 10 ? ` and ${ids.length - 10} more` : "";
  throw new Error(
    `duplicate animal id${ids.length === 1 ? "" : "s"}: ${shown}${more}. ` +
      `Refusing to merge overrides, sweep media or write the dataset.`,
  );
}

export function countByProvider(
  animals: readonly Animal[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const animal of animals) {
    const id = animal.source.providerId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export interface MassRemoval {
  providerId: string;
  before: number;
  after: number;
}

export interface MassRemovalOptions {
  // Provider ids an operator has cleared for a legitimate mass removal.
  accepted?: ReadonlySet<string>;
  // Providers this run actually re-crawled. Everybody else's animals came
  // back from the previous dataset unchanged, or were dropped on purpose by
  // a policy check, so there is nothing here to protect them from. Left
  // unset, every provider in the previous dataset is checked.
  crawledProviderIds?: ReadonlySet<string>;
}

export function findMassRemovals(
  previous: readonly Animal[],
  current: readonly Animal[],
  options: MassRemovalOptions = {},
): MassRemoval[] {
  const before = countByProvider(previous);
  const after = countByProvider(current);
  const crawled = options.crawledProviderIds;

  const removals: MassRemoval[] = [];
  for (const [providerId, had] of before) {
    if (crawled && !crawled.has(providerId)) continue;
    if (had < GUARD_MIN_BEFORE) continue;
    const has = after.get(providerId) ?? 0;
    if (has === 0 || had - has > had * GUARD_MAX_LOSS) {
      removals.push({ providerId, before: had, after: has });
    }
  }
  return removals;
}

// The last thing that runs before the media sweeps and the dataset write. A
// parser whose selectors stopped matching returns an empty list, and
// everything downstream reads that as "the shelter emptied": photos, cards
// and records go, firstSeenAt is reset, and the run exits 0.
export function guardMassRemoval(
  previous: readonly Animal[],
  current: readonly Animal[],
  options: MassRemovalOptions = {},
): void {
  const accepted = options.accepted ?? new Set<string>();
  const removals = findMassRemovals(previous, current, options);
  const waived = removals.filter((r) => accepted.has(r.providerId));
  const blocking = removals.filter((r) => !accepted.has(r.providerId));

  const before = countByProvider(previous);
  const crawled = options.crawledProviderIds;
  const checked = [...before.keys()].filter(
    (id) => !crawled || crawled.has(id),
  ).length;

  for (const removal of waived) {
    console.warn(
      `removal guard: ${removal.providerId} ${removal.before} -> ` +
        `${removal.after} animals, accepted by --accept-removals`,
    );
  }

  if (blocking.length === 0) {
    console.log(
      `removal guard: ${checked} provider(s) checked, ` +
        `${before.size - checked} carried forward, ${waived.length} accepted, ` +
        `nothing blocked`,
    );
    return;
  }

  const named = blocking
    .map((r) => `${r.providerId} ${r.before} -> ${r.after}`)
    .join(", ");
  throw new Error(
    `removal guard: ${named}. A provider losing this many animals in one run ` +
      `is markup drift until proven otherwise, so nothing was deleted and ` +
      `nothing was written. Check the shelter's site, then re-run with ` +
      `--accept-removals ${blocking.map((r) => r.providerId).join(",")} if the ` +
      `removal is real.`,
  );
}

export interface DroppedAnimals {
  providerId: string;
  count: number;
  reason: string;
}

export interface RetainResult {
  animals: Animal[];
  dropped: DroppedAnimals[];
}

// Animals carried over from the previous dataset are published again, so they
// are held to the policy as it stands now, not as it stood when they were
// crawled. A shelter that switched off, or whose permission was withdrawn,
// leaves the dataset on the next run whether or not that run crawled it.
export function retainableAnimals(
  animals: readonly Animal[],
  policies: ReadonlyMap<string, ProviderPolicy>,
): RetainResult {
  const kept: Animal[] = [];
  const dropped = new Map<string, DroppedAnimals>();

  for (const animal of animals) {
    const providerId = animal.source.providerId;
    const policy = policies.get(providerId);
    const reason =
      policy === undefined
        ? "no policy.yaml"
        : !policy.enabled
          ? "provider is disabled"
          : policy.permission.status !== "granted"
            ? `permission.status is "${policy.permission.status}"`
            : undefined;
    if (reason === undefined) {
      kept.push(animal);
      continue;
    }
    const entry = dropped.get(providerId) ?? { providerId, count: 0, reason };
    entry.count++;
    dropped.set(providerId, entry);
  }

  return { animals: kept, dropped: [...dropped.values()] };
}
