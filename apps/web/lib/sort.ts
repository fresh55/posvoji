import type { Animal } from "@posvoji/schema";
import type { Locale } from "./i18n";

export const ANIMAL_SORTS = [
  "longest-in-shelter",
  "newest-arrivals",
  "name",
] as const;

export type AnimalSort = (typeof ANIMAL_SORTS)[number];

export const DEFAULT_ANIMAL_SORT: AnimalSort = "longest-in-shelter";

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

export function sortAnimals(
  animals: Animal[],
  sort: AnimalSort = DEFAULT_ANIMAL_SORT,
  locale: Locale = "sl",
): Animal[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });

  return [...animals].sort((left, right) => {
    let compared: number;
    switch (sort) {
      case "longest-in-shelter":
        // ISO dates sort chronologically as strings; oldest means longest.
        compared = compareOptional(left.intakeDate, right.intakeDate, 1);
        break;
      case "newest-arrivals":
        compared = compareOptional(left.intakeDate, right.intakeDate, -1);
        break;
      case "name":
        compared = compareOptional(left.name, right.name, 1, collator);
        break;
    }

    return compared || left.id.localeCompare(right.id);
  });
}
