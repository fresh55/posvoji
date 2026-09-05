// What the card and the editor page's summary both say about one animal: the
// line under the name, the address of its public page, and which of the
// adopter's filters it still leaves blank. Written once, because the two are
// the same animal on two screens.

import {
  SEARCHABLE_FIELDS,
  SEX_META,
  isPortalSex,
  portalSpeciesLabel,
} from "@/components/portal/portal-fields";
import type { AnimalFields } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import { ageInMonths } from "@/lib/filters";
import { formatAge } from "@/lib/labels";
import type { PortalAnimal, PortalShelter } from "@/lib/portal-api";

// The public site's arithmetic, read through the API's nulls, so the same
// birth date turns into the same number of months on both sides.
//
// The date it is measured from is deliberately not the same one. The public
// site reads ages off the export it is serving (see animal-grid.tsx), because
// its pages are prerendered and the ages printed on them have to match the
// list they were filtered into. The portal is looking at live records, so
// today is the honest answer here, and at a month boundary the two can differ
// by one month for the same animal.
function ageMonths(animal: PortalAnimal, now: Date): number | undefined {
  return ageInMonths(
    {
      birthDate: animal.birthDate ?? undefined,
      approximateAgeMonths: animal.approximateAgeMonths ?? undefined,
    },
    now,
  );
}

export function portalMetaLine(animal: PortalAnimal, now: Date): string {
  const months = ageMonths(animal, now);
  return [
    portalSpeciesLabel(animal.species),
    // Crawled or typed here, the breed is the word staff recognise the animal
    // by, so it sits next to the species rather than only inside the editor.
    animal.breed ?? "",
    isPortalSex(animal.sex) && animal.sex !== "unknown"
      ? SEX_META[animal.sex].label.toLowerCase()
      : "",
    months === undefined ? "" : formatAge(months, "sl"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The public address of this animal's own page. animalPath() takes a dataset
 * animal and the portal never holds one, but it reads only the id, the name,
 * the species and the shelter's town and id (see lib/animal-path.ts), and the
 * portal has all five. The value is complete for the call, which is what the
 * cast stands on.
 *
 * The name is handed in rather than read off the animal. The address carries
 * the name, the public site is a static export rebuilt about every twelve
 * hours, and its animal route generates no page for a slug that was not in
 * that build (dynamicParams is false). A rename saved here therefore names a
 * page that does not exist yet, so the link keeps the name the animal was
 * listed under and the surface drawing it says so beside it.
 */
export function portalPublicPath(
  animal: PortalAnimal,
  shelter: PortalShelter,
  name: string | null,
): string {
  const fields = {
    id: animal.id,
    name: name ?? undefined,
    species: animal.species ?? "zival",
    shelter: { id: shelter.slug, city: shelter.city ?? "" },
  } as unknown as AnimalFields;
  return animalPath(fields, "sl");
}

/**
 * The searchable fields this animal still has no answer for, keys and all.
 * The line under the card prints the labels; the keys are what lets it link
 * to the editor at the first of them.
 */
export function missingSearchableFields(animal: PortalAnimal) {
  return SEARCHABLE_FIELDS.filter((field) => animal[field.key] === null);
}
