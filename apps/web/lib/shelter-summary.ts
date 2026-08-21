import { Species, type Animal } from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { ageLabel, monthsInShelter } from "@/lib/labels";

/** What the location picker's card can say about one shelter beyond its name
 *  and its filtered count: who lives there, and who has waited longest. */
export type ShelterSummary = {
  /** Species the shelter actually has, with the count of each. A species with
   *  nothing there is left out rather than shown as a zero. */
  species: { species: Species; count: number }[];
  /** The animal that has been in this shelter longest, already worded in the
   *  reader's language. Absent when no animal there carries an intake date. */
  longestWaiting?: { name: string; duration: string };
};

// The order the site says species in everywhere else: the tabs, the result
// count, the dialog's fact chips. Reads straight off the schema enum, the
// same way lib/filters.ts does, so a species added there shows up here
// instead of silently vanishing from the pick card.
const SPECIES_ORDER: Species[] = Species.options;

// The same three statuses the animal card's long-stay mark skips (see
// longStayLabel in labels.ts): an adopted animal's stay is history, and a
// reserved or held one is not waiting for the visitor's decision.
function isWaiting(animal: Animal): boolean {
  return (
    animal.status !== "adopted" &&
    animal.status !== "hold" &&
    animal.status !== "reserved"
  );
}

/** Per-shelter summaries, keyed by the same shelter id the filter options and
 *  the count map use (animal.shelter.id).
 *
 *  Measured against every animal handed in, never against the active filters:
 *  the card answers "who is this shelter", not "what matches my filter", and
 *  the count pill next to the shelter's name already carries the filtered
 *  number. A breakdown that moved with the species tab would say a shelter has
 *  no cats while the visitor is looking at dogs.
 *
 *  The wait is worded here rather than in the component because the wording
 *  needs a locale and a reference date, and both live where the dataset does.
 *  No LONG_STAY_MONTHS threshold: this is the longest wait in the house, which
 *  is a fact whether or not it has crossed the mark the animal card draws. */
export function summarizeShelters(
  animals: Animal[],
  locale: Locale,
  now: Date,
): Map<string, ShelterSummary> {
  const counts = new Map<string, Map<Species, number>>();
  const longest = new Map<string, { name: string; months: number }>();

  for (const animal of animals) {
    const id = animal.shelter.id;
    const perSpecies = counts.get(id) ?? new Map<Species, number>();
    perSpecies.set(animal.species, (perSpecies.get(animal.species) ?? 0) + 1);
    counts.set(id, perSpecies);

    if (!animal.intakeDate || !isWaiting(animal)) continue;
    const months = monthsInShelter(animal.intakeDate, now);
    if (months === undefined) continue;
    const current = longest.get(id);
    if (current && current.months >= months) continue;
    longest.set(id, {
      name: animal.name ?? translate(locale, "unnamed"),
      months,
    });
  }

  const summaries = new Map<string, ShelterSummary>();
  for (const [id, perSpecies] of counts) {
    const waited = longest.get(id);
    summaries.set(id, {
      species: SPECIES_ORDER.flatMap((species) => {
        const count = perSpecies.get(species) ?? 0;
        return count > 0 ? [{ species, count }] : [];
      }),
      longestWaiting: waited
        ? { name: waited.name, duration: ageLabel(waited.months, locale) }
        : undefined,
    });
  }
  return summaries;
}
