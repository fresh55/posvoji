import type { Species } from "@posvoji/schema";
import type { AnimalFields, ClientAnimal } from "@/lib/animal";
import type { Locale } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { ageLabel, monthsInShelter } from "@/lib/labels";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { SPECIES_ORDER } from "@/lib/species";

/** One waiting animal's face for the pick card's mini fan: the photo it is
 *  already shown with elsewhere, and its name for the alt text. */
export type ShelterFace = { src: string; name: string };

// A fan past three stops reading as a fan and starts reading as a strip, and
// the pick card has no room for a strip.
const MAX_FACES = 3;

/** What the location picker's card can say about one shelter beyond its name
 *  and its filtered count: who lives there, and who has waited longest. */
export type ShelterSummary = {
  /** Species the shelter actually has, with the count of each. A species with
   *  nothing there is left out rather than shown as a zero. */
  species: { species: Species; count: number }[];
  /** The animal that has been in this shelter longest, already worded in the
   *  reader's language. Absent when no animal there carries an intake date. */
  longestWaiting?: { name: string; duration: string };
  /** Up to three waiting animals with a photo, longest wait first. The first
   *  entry is the same animal longestWaiting names whenever that animal has a
   *  photo at all; a shelter where nobody has one gets no faces, same as a
   *  shelter with no wait to report gets no longestWaiting. */
  faces?: ShelterFace[];
  /** The shelter's own mark, when the ingest logo fetch found one. Not set by
   *  summarizeShelters itself, which only sees animals: the caller that has
   *  the logo manifest in hand (see AnimalGrid) folds it in by shelter id
   *  after this map is built. */
  logo?: ShelterLogo;
};

// The order the site says species in everywhere else: the tabs, the result
// count, the dialog's fact chips. Read off lib/species.ts, the same way
// lib/filters.ts does, so a species added to the schema shows up here instead
// of silently vanishing from the pick card.

// The same three statuses the animal card's long-stay mark skips (see
// longStayMonths in labels.ts): an adopted animal's stay is history, and a
// reserved or held one is not waiting for the visitor's decision.
function isWaiting(animal: AnimalFields): boolean {
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
  animals: ClientAnimal[],
  locale: Locale,
  now: Date,
): Map<string, ShelterSummary> {
  const counts = new Map<string, Map<Species, number>>();
  const longest = new Map<string, { name: string; months: number }>();
  // Every waiting animal with a photo, unsorted until a shelter's summary is
  // built below. months is undefined for an animal with no usable intake
  // date, which the sort keeps after the animals it can actually rank.
  const faceCandidates = new Map<
    string,
    { name: string; months: number | undefined; src: string }[]
  >();

  for (const animal of animals) {
    const id = animal.shelter.id;
    const perSpecies = counts.get(id) ?? new Map<Species, number>();
    perSpecies.set(animal.species, (perSpecies.get(animal.species) ?? 0) + 1);
    counts.set(id, perSpecies);

    if (!isWaiting(animal)) continue;
    const name = animal.name ?? translate(locale, "unnamed");
    const months = animal.intakeDate
      ? monthsInShelter(animal.intakeDate, now)
      : undefined;

    if (months !== undefined) {
      const current = longest.get(id);
      if (!current || current.months < months) {
        longest.set(id, { name, months });
      }
    }

    // The same photos the grid and the dialog already show: the projection
    // handed in has dropped the ones the shelter granted no display right to,
    // so a shelter with rights on nothing gets no faces, exactly as it gets no
    // photos anywhere else on the site.
    const photo = animal.images[0];
    if (photo) {
      const candidates = faceCandidates.get(id) ?? [];
      candidates.push({ name, months, src: photo.src });
      faceCandidates.set(id, candidates);
    }
  }

  const summaries = new Map<string, ShelterSummary>();
  for (const [id, perSpecies] of counts) {
    const waited = longest.get(id);
    const faces = faceCandidates
      .get(id)
      // Longer waits first; an animal whose wait is unknown sorts after every
      // animal whose wait is, never mixed in among them by array order.
      ?.sort((a, b) => {
        if (a.months !== undefined && b.months !== undefined) {
          return b.months - a.months;
        }
        if (a.months !== undefined) return -1;
        if (b.months !== undefined) return 1;
        return 0;
      })
      .slice(0, MAX_FACES)
      .map(({ name, src }) => ({ name, src }));
    summaries.set(id, {
      species: SPECIES_ORDER.flatMap((species) => {
        const count = perSpecies.get(species) ?? 0;
        return count > 0 ? [{ species, count }] : [];
      }),
      longestWaiting: waited
        ? { name: waited.name, duration: ageLabel(waited.months, locale) }
        : undefined,
      faces: faces && faces.length > 0 ? faces : undefined,
    });
  }
  return summaries;
}
