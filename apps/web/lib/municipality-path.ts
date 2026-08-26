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
  return `${FOUND_ANIMAL_MUNICIPALITY_PREFIX}/${slugify(name)}`;
}

/** The entry a path segment written by municipalityPath names. All 212
 *  registry names slugify apart from each other, so the first match is the
 *  only match; municipality-path.test.ts holds that. */
export function findMunicipalityBySlug<Entry extends { name: string }>(
  entries: readonly Entry[],
  slug: string,
): Entry | undefined {
  return entries.find((entry) => slugify(entry.name) === slug);
}
