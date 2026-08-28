import type { Animal, ChangeEntry, ChangeSet } from "@posvoji/schema";

// fetchedAt and lastSeenAt change on every run, so they can't count as a
// change.
//
// Both sides have to come out of the schema for this to compare data rather
// than key order: JSON.stringify follows insertion order, the file's order is
// the schema's, and an animal that just went through the image cache carries
// cachedUrl and its derived fields appended at the end. Feed this parsed
// animals only.
export function stableView(animal: Animal): string {
  const { source, ...rest } = animal;
  const { fetchedAt: _f, lastSeenAt: _l, ...stableSource } = source;
  return JSON.stringify({ ...rest, source: stableSource });
}

export function toChangeEntry(animal: Animal): ChangeEntry {
  return {
    id: animal.id,
    providerId: animal.source.providerId,
    sourceUrl: animal.source.sourceUrl,
    species: animal.species,
    name: animal.name,
  };
}

export function buildChangeSet(options: {
  generatedAt: string;
  previous: readonly Animal[];
  current: readonly Animal[];
}): ChangeSet {
  const previousById = new Map(options.previous.map((a) => [a.id, a] as const));
  const currentIds = new Set(options.current.map((a) => a.id));

  return {
    generatedAt: options.generatedAt,
    added: options.current
      .filter((a) => !previousById.has(a.id))
      .map(toChangeEntry),
    updated: options.current
      .filter((a) => {
        const before = previousById.get(a.id);
        return before !== undefined && stableView(before) !== stableView(a);
      })
      .map(toChangeEntry),
    removed: options.previous
      .filter((a) => !currentIds.has(a.id))
      .map(toChangeEntry),
  };
}
