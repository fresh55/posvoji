import type { Animal } from "@posvoji/schema";
import { ageInMonths } from "./filters";
import type { Locale } from "./i18n";

export const ANIMAL_SORTS = [
  "longest-in-shelter",
  "newest-arrivals",
  "youngest",
  "oldest",
  "name",
] as const;

export type AnimalSort = (typeof ANIMAL_SORTS)[number];

export const DEFAULT_ANIMAL_SORT: AnimalSort = "longest-in-shelter";

// URL codec for the sort order, in the same Slovenian ASCII style as
// lib/filters.ts's slugs: ?razvrsti=novi
//
// Kept here rather than folded into Filters/serializeFilters: sort decides
// the order of the list already matched by the filters, not which animals
// are in it, and Filters is a plain data shape passed into applyFilters,
// pruneHiddenFilters and a dozen count functions that have nothing to do with
// ordering. Adding a sort field there would mean every one of those call
// sites and every existing serializeFilters/parseFilters test carries a sort
// argument it never uses. A sibling codec that the same query-writing code
// path calls alongside the filter one gets the single-writer property FIX 2
// needs without widening Filters' shape.
export const SORT_PARAM = "razvrsti";

const SORT_SLUGS: Record<AnimalSort, string> = {
  // The default is never written to the URL, but it still gets a slug so a
  // link carrying it explicitly (someone bookmarked it before this changed,
  // or copied one from another visitor) still parses back to it.
  "longest-in-shelter": "cakajoci",
  "newest-arrivals": "novi",
  youngest: "najmlajsi",
  oldest: "najstarejsi",
  name: "ime",
};

/** "" for the default, so a plain reset keeps the URL clean like empty filters do. */
export function serializeSort(sort: AnimalSort): string {
  if (sort === DEFAULT_ANIMAL_SORT) return "";
  return `${SORT_PARAM}=${SORT_SLUGS[sort]}`;
}

// Unknown or missing slugs fall back to the default silently, the same
// tolerance parseFilters gives a stale shared link.
export function parseSort(search: string): AnimalSort {
  const slug = new URLSearchParams(search).get(SORT_PARAM);
  if (!slug) return DEFAULT_ANIMAL_SORT;
  const entry = (Object.entries(SORT_SLUGS) as [AnimalSort, string][]).find(
    ([, candidateSlug]) => candidateSlug === slug,
  );
  return entry?.[0] ?? DEFAULT_ANIMAL_SORT;
}

// Unknown values always follow known ones. In particular, firstSeenAt is not a
// substitute for intakeDate: it says when Posvoji.si found the listing, not
// when the animal entered the shelter.
function compareOptional(
  left: string | undefined,
  right: string | undefined,
  direction: 1 | -1,
  collator?: Intl.Collator,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return (
    direction *
    (collator ? collator.compare(left, right) : left.localeCompare(right))
  );
}

function compareOptionalNumber(
  left: number | undefined,
  right: number | undefined,
  direction: 1 | -1,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return direction * (left - right);
}

// Available first, everything else after: a "hold" or "unknown" animal reads
// like any other card in a list that never touches status (lib/filters.ts
// never filters on it, on purpose — it stays in the results rather than
// being hidden), so the one place left to say "this one is not like the
// others" is where it lands. 0 for available keeps it stable against every
// comparator below: two available animals, or two animals both off the
// market, still resolve by whichever order was actually chosen.
function statusWeight(animal: Animal): 0 | 1 {
  return animal.status === "available" ? 0 : 1;
}

export function sortAnimals(
  animals: Animal[],
  sort: AnimalSort = DEFAULT_ANIMAL_SORT,
  locale: Locale = "sl",
  now: Date = new Date(),
): Animal[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });

  return [...animals].sort((left, right) => {
    const statusDiff = statusWeight(left) - statusWeight(right);
    if (statusDiff !== 0) return statusDiff;

    let compared: number;
    switch (sort) {
      case "longest-in-shelter":
        // ISO dates sort chronologically as strings; oldest means longest.
        compared = compareOptional(left.intakeDate, right.intakeDate, 1);
        break;
      case "newest-arrivals":
        compared = compareOptional(left.intakeDate, right.intakeDate, -1);
        break;
      case "youngest":
        compared = compareOptionalNumber(
          ageInMonths(left, now),
          ageInMonths(right, now),
          1,
        );
        break;
      case "oldest":
        compared = compareOptionalNumber(
          ageInMonths(left, now),
          ageInMonths(right, now),
          -1,
        );
        break;
      case "name":
        compared = compareOptional(left.name, right.name, 1, collator);
        break;
    }

    return compared || left.id.localeCompare(right.id);
  });
}
