import {
  PORTAL_SPECIAL_NEEDS_ANSWERS,
  type PortalSpecialNeedsAnswer,
} from "@/components/portal/portal-fields";
import {
  PORTAL_COMPATIBILITIES,
  PORTAL_ENERGIES,
  PORTAL_SEXES,
  PORTAL_SIZES,
  type PortalCompatibility,
  type PortalEnergy,
  type PortalSex,
  type PortalSize,
} from "@/lib/portal-api";

export type Draft = {
  name: string;
  breed: string;
  birthDate: string;
  /** The age is one number on the wire and two inputs here: years and months. */
  ageYears: string;
  ageMonths: string;
  shortDescription: string;
  sex: PortalSex | null;
  size: PortalSize | null;
  energy: PortalEnergy | null;
  goodWithKids: PortalCompatibility | null;
  goodWithDogs: PortalCompatibility | null;
  goodWithCats: PortalCompatibility | null;
  apartmentOk: PortalCompatibility | null;
  specialNeeds: PortalSpecialNeedsAnswer | null;
};

export type ChoiceKey =
  | "sex"
  | "size"
  | "energy"
  | "goodWithKids"
  | "goodWithDogs"
  | "goodWithCats"
  | "apartmentOk"
  | "specialNeeds";

/** The answers each choice row can hold, so a stored one can be checked. */
export const CHOICES: Record<ChoiceKey, readonly string[]> = {
  sex: PORTAL_SEXES,
  size: PORTAL_SIZES,
  energy: PORTAL_ENERGIES,
  goodWithKids: PORTAL_COMPATIBILITIES,
  goodWithDogs: PORTAL_COMPATIBILITIES,
  goodWithCats: PORTAL_COMPATIBILITIES,
  apartmentOk: PORTAL_COMPATIBILITIES,
  specialNeeds: PORTAL_SPECIAL_NEEDS_ANSWERS,
};
