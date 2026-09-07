import {
  TEXT_LIMITS,
  ageParts,
  isPlausibleBirthDate,
  isPortalCompatibility,
  isPortalEnergy,
  isPortalSex,
  isPortalSize,
  isPortalStatus,
  isoDate,
  limited,
  parseAgeBoxes,
  specialNeedsAnswer,
  specialNeedsValue,
  trimmed,
  type AgeBox,
  type ReadBox,
} from "@/components/portal/portal-fields";
import {
  PORTAL_SPECIES,
  PORTAL_STATUSES,
  type PortalListing,
  type PortalListingInput,
  type PortalSpecies,
  type PortalStatus,
} from "@/lib/portal-api";
import { draftSanitizer } from "@/lib/portal-drafts";
import {
  CHOICES as COMMON_CHOICES,
  type Draft as AnimalDraftFields,
  type ChoiceKey as CommonChoiceKey,
} from "./draft-fields";

export type Draft = AnimalDraftFields & {
  species: PortalSpecies | null;
  status: PortalStatus;
};

/**
 * The input as the draft reads right now, before the two required fields are
 * enforced. Kept apart from PortalListingInput so "what changed" can be
 * asked of a draft the API would refuse.
 */
export type Shape = Omit<PortalListingInput, "species" | "name"> & {
  species: PortalSpecies | null;
  name: string | null;
};

/** The two fields a listing cannot exist without. */
export type Required = "species" | "name";

/**
 * What a submit can refuse: a required field left empty, or one of the three
 * boxes the browser reads for us holding something that is not a value. One
 * box at a time, so the mark and the message land on that box alone.
 */
export type Refused = Required | ReadBox;

export const isPortalSpecies = (value: string | null): value is PortalSpecies =>
  value !== null && (PORTAL_SPECIES as readonly string[]).includes(value);

export function draftFrom(listing: PortalListing | null): Draft {
  if (!listing) return EMPTY_DRAFT;
  const age = ageParts(listing.approximateAgeMonths);
  return {
    species: isPortalSpecies(listing.species) ? listing.species : null,
    status: isPortalStatus(listing.status) ? listing.status : "available",
    name: listing.name,
    breed: listing.breed ?? "",
    birthDate: isoDate(listing.birthDate) ?? "",
    ageYears: age.years,
    ageMonths: age.months,
    shortDescription: listing.shortDescription ?? "",
    sex: isPortalSex(listing.sex) ? listing.sex : null,
    size: isPortalSize(listing.size) ? listing.size : null,
    energy: isPortalEnergy(listing.energy) ? listing.energy : null,
    goodWithKids: isPortalCompatibility(listing.goodWithKids)
      ? listing.goodWithKids
      : null,
    goodWithDogs: isPortalCompatibility(listing.goodWithDogs)
      ? listing.goodWithDogs
      : null,
    goodWithCats: isPortalCompatibility(listing.goodWithCats)
      ? listing.goodWithCats
      : null,
    apartmentOk: isPortalCompatibility(listing.apartmentOk)
      ? listing.apartmentOk
      : null,
    specialNeeds: specialNeedsAnswer(listing.specialNeeds),
  };
}

export type ChoiceKey = CommonChoiceKey | "species";

/** The answers each choice row can hold, so a stored one can be checked. */
export const CHOICES: Record<ChoiceKey, readonly string[]> = {
  ...COMMON_CHOICES,
  species: PORTAL_SPECIES,
};

/**
 * What of a stored draft this form can take back: the same rule the crawled
 * editor runs, over a draft with two more keys, the species row and the status
 * a listing always has. Photos are never in the draft: a File is not JSON, and
 * the stored ones belong to the record.
 */
export const sanitizeListingDraft = draftSanitizer<Draft>({
  text: [
    "name",
    "breed",
    "birthDate",
    "ageYears",
    "ageMonths",
    "shortDescription",
  ],
  choices: CHOICES,
  answered: { status: PORTAL_STATUSES },
});

/**
 * The whole draft as the API would read it. The age stays null while a box
 * holds something that is not a count, and says which box.
 *
 * The text is cut to what the API takes. The inputs carry the same limits as
 * maxLength, but a draft read back from storage never went through them.
 */
export function shapeOf(draft: Draft): {
  shape: Shape;
  ageError: AgeBox | null;
} {
  const { months: approximateAgeMonths, error: ageError } = parseAgeBoxes(
    draft.ageYears,
    draft.ageMonths,
  );

  return {
    shape: {
      species: draft.species,
      name: limited(draft.name, TEXT_LIMITS.name),
      status: draft.status,
      sex: draft.sex,
      breed: limited(draft.breed, TEXT_LIMITS.breed),
      birthDate: trimmed(draft.birthDate),
      approximateAgeMonths,
      size: draft.size,
      energy: draft.energy,
      goodWithKids: draft.goodWithKids,
      goodWithDogs: draft.goodWithDogs,
      goodWithCats: draft.goodWithCats,
      apartmentOk: draft.apartmentOk,
      specialNeeds: specialNeedsValue(draft.specialNeeds),
      shortDescription: limited(
        draft.shortDescription,
        TEXT_LIMITS.shortDescription,
      ),
    },
    ageError,
  };
}

/**
 * Whether the date box holds a day the animal could not have been born on:
 * after today, or before 1900. The API refuses the same date, so the box is
 * refused here, where the message can sit next to it. Empty is no answer, not
 * a fault. Kept out of shapeOf, which the status buttons also read and which
 * has no reason to know the time.
 */
export function birthDateFault(draft: Draft, now: Date): boolean {
  const date = trimmed(draft.birthDate);
  return date !== null && !isPlausibleBirthDate(date, now);
}

/**
 * Both sides come out of the one object literal in shapeOf, so their keys are
 * in the same order and every value is a primitive: comparing the encodings is
 * comparing the shapes.
 */
export function sameShape(left: Shape, right: Shape): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * The draft as the API would take it, or the first required field it leaves
 * empty, in the form's order. One answer for both, so what the form refuses
 * and what it would send cannot disagree.
 */
export function inputOf(shape: Shape): {
  input: PortalListingInput | null;
  missing: Required | null;
} {
  if (shape.species === null) return { input: null, missing: "species" };
  if (shape.name === null) return { input: null, missing: "name" };
  return {
    input: { ...shape, species: shape.species, name: shape.name },
    missing: null,
  };
}

/**
 * A saved listing as the PUT body that would leave it unchanged. The status
 * buttons on the card and in the editor's summary send this with one field
 * swapped, because the route is a full replace and a partial body would clear
 * everything it left out.
 *
 * The API's own enums make the fallbacks unreachable: a listing is stored
 * through ListingIn, which only admits these values.
 */
export function listingInput(listing: PortalListing): PortalListingInput {
  const { shape } = shapeOf(draftFrom(listing));
  return {
    ...shape,
    species: shape.species ?? "other",
    name: shape.name ?? listing.name,
  };
}

const EMPTY_DRAFT: Draft = {
  species: null,
  status: "available",
  name: "",
  breed: "",
  birthDate: "",
  ageYears: "",
  ageMonths: "",
  shortDescription: "",
  sex: null,
  size: null,
  energy: null,
  goodWithKids: null,
  goodWithDogs: null,
  goodWithCats: null,
  apartmentOk: null,
  specialNeeds: null,
};
