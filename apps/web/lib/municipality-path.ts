import { slugify } from "@/lib/animal-path";

/**
 * One address per municipality, under the found-animal page it answers for.
 *
 * Slovenian only. The English mirror of the lookup stays the interactive page:
 * the coverage table, the shelter contacts and the law the answer cites are
 * all Slovenian, and a second set of 212 pages would be 212 more addresses
 * saying the same thing to nobody who searches in English.
 *
 * Pure string work, deliberately apart from lib/municipality-share.ts, which
 * opens node:fs to look for a shelter's map plate. The finder is a client
 * component and needs the path helper; following a named export out of a
 * module that touches fs drags fs into the browser chunk. lib/shelter-path.ts
 * is split from lib/shelter-share.ts for the same reason.
 */
export const FOUND_ANIMAL_MUNICIPALITY_PREFIX = "/najdena-zival";

export function municipalitySlug(name: string): string {
  return slugify(name);
}

export function municipalityPath(name: string): string {
  return `${FOUND_ANIMAL_MUNICIPALITY_PREFIX}/${municipalitySlug(name)}`;
}

// One index per entries array, built on first lookup. The 212 pages each ask
// twice, once for the metadata and once for the page, and a scan that
// slugified every name on every ask spent about ninety thousand slugify calls
// answering four hundred questions about a set that never changes.
const indexes = new WeakMap<object, Map<string, unknown>>();

/** The entry a path segment written by municipalityPath names. All 212
 *  registry names slugify apart from each other, so the first match is the
 *  only match; municipality-path.test.ts holds that. */
export function findMunicipalityBySlug<Entry extends { name: string }>(
  entries: readonly Entry[],
  slug: string,
): Entry | undefined {
  let index = indexes.get(entries);
  if (!index) {
    index = new Map<string, unknown>();
    // First wins, so the index answers what a scan answered.
    for (const entry of entries) {
      const key = municipalitySlug(entry.name);
      if (!index.has(key)) index.set(key, entry);
    }
    indexes.set(entries, index);
  }
  return index.get(slug) as Entry | undefined;
}
