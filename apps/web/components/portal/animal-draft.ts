import {
  TEXT_LIMITS,
  ageParts,
  isPlausibleBirthDate,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  isoDate,
  limited,
  parseAgeBoxes,
  specialNeedsAnswer,
  specialNeedsValue,
  trimmed,
  type AgeBox,
} from "@/components/portal/portal-fields";
import {
  type PortalAnimal,
  type PortalAnimalPatch,
  type PortalField,
} from "@/lib/portal-api";
import { draftSanitizer } from "@/lib/portal-drafts";
import { CHOICES, Draft } from "./draft-fields";

export function draftFrom(animal: PortalAnimal): Draft {
  const age = ageParts(animal.approximateAgeMonths ?? null);
  return {
    name: animal.name ?? "",
    breed: animal.breed ?? "",
    birthDate: isoDate(animal.birthDate) ?? "",
    ageYears: age.years,
    ageMonths: age.months,
    shortDescription: animal.shortDescription ?? "",
    sex: isPortalSex(animal.sex) ? animal.sex : null,
    size: isPortalSize(animal.size) ? animal.size : null,
    energy: isPortalEnergy(animal.energy) ? animal.energy : null,
    goodWithKids: isPortalCompatibility(animal.goodWithKids)
      ? animal.goodWithKids
      : null,
    goodWithDogs: isPortalCompatibility(animal.goodWithDogs)
      ? animal.goodWithDogs
      : null,
    goodWithCats: isPortalCompatibility(animal.goodWithCats)
      ? animal.goodWithCats
      : null,
    apartmentOk: isPortalCompatibility(animal.apartmentOk)
      ? animal.apartmentOk
      : null,
    specialNeeds: specialNeedsAnswer(animal.specialNeeds),
  };
}

/** What of a stored draft this form can take back. */
export const sanitizeDraft = draftSanitizer<Draft>({
  text: [
    "name",
    "breed",
    "birthDate",
    "ageYears",
    "ageMonths",
    "shortDescription",
  ],
  choices: CHOICES,
});

export function isOverridden(
  animal: PortalAnimal,
  field: PortalField,
): boolean {
  return Object.prototype.hasOwnProperty.call(animal.overrides, field);
}

/**
 * Only what actually changed goes into the body. A null is sent solely to
 * clear an override the shelter already has, never to "unset" crawled data,
 * which the API cannot do anyway.
 *
 * `now` is what the birth date is measured against: a date after today is
 * not one the animal can have.
 */
export function buildPatch(
  draft: Draft,
  animal: PortalAnimal,
  now: Date,
): { patch: PortalAnimalPatch; ageError: AgeBox | null; dateError: boolean } {
  const patch: PortalAnimalPatch = {};

  function put<Key extends keyof PortalAnimalPatch>(
    key: Key,
    next: PortalAnimalPatch[Key],
    current: PortalAnimalPatch[Key],
  ): void {
    if (next === current) return;
    if (next === null && !isOverridden(animal, key)) return;
    patch[key] = next;
  }

  // Cut to what the API takes. The inputs carry the same limits as maxLength,
  // but a draft read back from storage never went through them. The record's
  // side is trimmed too, so crawled text with a space on the end does not
  // make an untouched form dirty.
  put(
    "name",
    limited(draft.name, TEXT_LIMITS.name),
    trimmed(animal.name ?? ""),
  );
  put(
    "breed",
    limited(draft.breed, TEXT_LIMITS.breed),
    trimmed(animal.breed ?? ""),
  );
  put(
    "shortDescription",
    limited(draft.shortDescription, TEXT_LIMITS.shortDescription),
    trimmed(animal.shortDescription ?? ""),
  );
  put("sex", draft.sex, isPortalSex(animal.sex) ? animal.sex : null);
  put("size", draft.size, isPortalSize(animal.size) ? animal.size : null);
  put(
    "energy",
    draft.energy,
    isPortalEnergy(animal.energy) ? animal.energy : null,
  );
  put(
    "goodWithKids",
    draft.goodWithKids,
    isPortalCompatibility(animal.goodWithKids) ? animal.goodWithKids : null,
  );
  put(
    "goodWithDogs",
    draft.goodWithDogs,
    isPortalCompatibility(animal.goodWithDogs) ? animal.goodWithDogs : null,
  );
  put(
    "goodWithCats",
    draft.goodWithCats,
    isPortalCompatibility(animal.goodWithCats) ? animal.goodWithCats : null,
  );
  put(
    "apartmentOk",
    draft.apartmentOk,
    isPortalCompatibility(animal.apartmentOk) ? animal.apartmentOk : null,
  );
  put(
    "specialNeeds",
    specialNeedsValue(draft.specialNeeds),
    animal.specialNeeds,
  );

  // A box that holds something unusable is left out of the patch: it is not a
  // value to save and not a request to give the field back either.
  const birthDate = trimmed(draft.birthDate);
  const dateError = birthDate !== null && !isPlausibleBirthDate(birthDate, now);
  if (!dateError) put("birthDate", birthDate, isoDate(animal.birthDate));

  const age = parseAgeBoxes(draft.ageYears, draft.ageMonths);
  if (!age.error) {
    put(
      "approximateAgeMonths",
      age.months,
      animal.approximateAgeMonths ?? null,
    );
  }

  return { patch, ageError: age.error, dateError };
}
export { CHOICES } from "./draft-fields";
export type { ChoiceKey, Draft } from "./draft-fields";
