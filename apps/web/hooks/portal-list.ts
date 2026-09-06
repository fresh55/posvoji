// What usePortalAnimals and usePortalListings both keep: the two states a
// shelter's list can be in, the per-record save slot, and what a failure says.
// One copy, because the two hooks answer for the same screen and a fix applied
// to one and not the other is a silent difference in what a shelter is told.

import { fill, portalText } from "@/components/portal/portal-text";
import { PortalError, type PortalErrorKind } from "@/lib/portal-api";

export const SAVED_FLASH_MS = 1800;

export type PortalListState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type PortalSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

export const IDLE: PortalSaveState = { status: "idle" };

// What each failure says to a shelter. A kind that is not here says only
// what the caller was doing, which is all a server fault can honestly say.
const MESSAGES: Partial<Record<PortalErrorKind, string>> = {
  forbidden: portalText.forbidden,
  network: portalText.networkError,
  invalid: portalText.invalidError,
};

// The API's keys, as the labels the form shows them under. A key not here is
// a field the form has no name for yet, and the raw key is still more use to
// a shelter than no name at all.
const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: portalText.fieldName,
  status: portalText.statusLegend,
  species: portalText.fieldSpecies,
  sex: portalText.fieldSex,
  breed: portalText.fieldBreed,
  birthDate: portalText.fieldBirthDate,
  approximateAgeMonths: portalText.fieldAgeMonths,
  size: portalText.fieldSize,
  energy: portalText.fieldEnergy,
  goodWithKids: portalText.fieldGoodWithKids,
  goodWithDogs: portalText.fieldGoodWithDogs,
  goodWithCats: portalText.fieldGoodWithCats,
  apartmentOk: portalText.fieldApartmentOk,
  specialNeeds: portalText.fieldSpecialNeeds,
  shortDescription: portalText.fieldDescription,
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/** "Ime", "Ime in Pasma", "Ime, Pasma in Spol". */
function listFields(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} in ${labels[labels.length - 1]}`;
}

/** The invalid message, naming the fields when the API did. */
export function invalidMessage(fields: readonly string[]): string {
  if (fields.length === 0) return portalText.invalidError;
  const template =
    fields.length === 1
      ? portalText.invalidFieldOne
      : fields.length === 2
        ? portalText.invalidFieldTwo
        : portalText.invalidFieldMany;
  return fill(template, { fields: listFields(fields.map(fieldLabel)) });
}

export function message(error: unknown, fallback: string): string {
  if (error instanceof PortalError) {
    if (error.kind === "invalid") return invalidMessage(error.fields);
    const known = MESSAGES[error.kind];
    if (known) return known;
  }
  return fallback;
}
