import type { Animal } from "@posvoji/schema";
import { ageInMonths } from "./filters";
import { cityAt, distanceKm, type LatLon } from "./geo";
import type { Locale } from "./i18n";

export const ANIMAL_SORTS = [
  "longest-in-shelter",
  "newest-arrivals",
  "youngest",
  "oldest",
  "name",
  // Last, because it is the one order that is not always on offer: it needs a
  // point to measure from, and only the location picker's nearby control can
  // grant one. At the end of the list its arrival moves nothing above it.
  "nearest",
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
  nearest: "najblizje",
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

/** The order a list can actually be put in. Nearest needs a point to measure
 *  from, so a shared link carrying ?razvrsti=najblizje to somebody who has
 *  granted nothing falls back to the default rather than to an order nothing
 *  can compute.
 *
 *  The URL is left exactly as it arrived, which is the same tolerance parseSort
 *  gives an unknown slug and the same thing serializeSort does with a sort
 *  nobody re-picked: the visitor can still grant an origin on this page, and
 *  when they do the link they followed starts working. Rewriting it would throw
 *  the shared address away on their behalf. */
export function effectiveSort(
  sort: AnimalSort,
  origin: LatLon | undefined,
): AnimalSort {
  if (sort === "nearest" && !origin) return DEFAULT_ANIMAL_SORT;
  return sort;
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
// never filters on it, on purpose: it stays in the results rather than
// being hidden), so the one place left to say "this one is not like the
// others" is where it lands. 0 for available keeps it stable against every
// comparator below: two available animals, or two animals both off the
// market, still resolve by whichever order was actually chosen.
function statusWeight(animal: Animal): 0 | 1 {
  return animal.status === "available" ? 0 : 1;
}

// One distance per town, not one per comparison. Sorting five hundred animals
// asks the comparator a few thousand questions and the towns behind them number
// a few dozen, so the haversine runs once for each town and the comparator does
// two map reads. A town the gazetteer does not carry is remembered as undefined
// rather than looked up again, and compareOptionalNumber then puts it after
// everything that could be placed.
function kmByCity(
  animals: Animal[],
  origin: LatLon,
): Map<string, number | undefined> {
  const km = new Map<string, number | undefined>();
  for (const { shelter } of animals) {
    if (km.has(shelter.city)) continue;
    const at = cityAt(shelter.city);
    km.set(shelter.city, at ? distanceKm(origin, at) : undefined);
  }
  return km;
}

export function sortAnimals(
  animals: Animal[],
  sort: AnimalSort = DEFAULT_ANIMAL_SORT,
  locale: Locale = "sl",
  now: Date = new Date(),
  /** Where "nearest" measures from. Client-only, because only the visitor's
   *  browser or their own typing can supply it, so every server render simply
   *  leaves it out and effectiveSort below falls back for them. */
  origin?: LatLon,
): Animal[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  // Read once, so the order the comparator switches on and the order the
  // distances were prepared for cannot disagree.
  const order = effectiveSort(sort, origin);
  const km =
    order === "nearest" && origin ? kmByCity(animals, origin) : undefined;

  return [...animals].sort((left, right) => {
    const statusDiff = statusWeight(left) - statusWeight(right);
    if (statusDiff !== 0) return statusDiff;

    let compared: number;
    switch (order) {
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
      case "nearest":
        // Distance to the shelter's town, which is as close as this data gets;
        // see formatKm in lib/geo.ts on why it is never directions. Two animals
        // at the same shelter, or at two shelters in one town, tie here and
        // fall through to the id below, the same tie-break every other order in
        // this file ends on.
        compared = compareOptionalNumber(
          km?.get(left.shelter.city),
          km?.get(right.shelter.city),
          1,
        );
        break;
    }

    return compared || left.id.localeCompare(right.id);
  });
}
