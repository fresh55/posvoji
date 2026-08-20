import { z } from "zod";

export const Species = z.enum(["dog", "cat", "rabbit", "other"]);
export type Species = z.infer<typeof Species>;

export const Sex = z.enum(["male", "female", "unknown"]);
export type Sex = z.infer<typeof Sex>;

export const AdoptionStatus = z.enum([
  "available",
  "reserved",
  "adopted",
  "hold",
  "unknown",
]);
export type AdoptionStatus = z.infer<typeof AdoptionStatus>;

export const AnimalSize = z.enum(["small", "medium", "large"]);
export type AnimalSize = z.infer<typeof AnimalSize>;

// The shelter's read of day-to-day temperament. Three levels only; unknown is
// expressed by omitting the field, not by a fourth value.
export const EnergyLevel = z.enum(["calm", "balanced", "lively"]);
export type EnergyLevel = z.infer<typeof EnergyLevel>;

export const TestResult = z.enum(["positive", "negative", "unknown"]);
export type TestResult = z.infer<typeof TestResult>;

// Whether an animal gets on with a group. "unknown" is a real answer: a
// shelter saying it has not seen the animal with children is information, and
// different from the field never being set.
export const Compatibility = z.enum(["yes", "no", "unknown"]);
export type Compatibility = z.infer<typeof Compatibility>;

export const ImageRights = z.enum([
  "unknown",
  "display-permitted",
  "cache-permitted",
]);
export type ImageRights = z.infer<typeof ImageRights>;

export const AnimalImage = z.strictObject({
  sourceUrl: z.url(),
  // Filled by the ingest image cache. Root-relative ("/media/animals/…")
  // because the static site serves its own copies; a full URL stays valid
  // should the cache ever move to a separate host.
  cachedUrl: z
    .union([z.url(), z.string().regex(/^\/\S+$/)])
    .optional(),
  rights: ImageRights,
});
export type AnimalImage = z.infer<typeof AnimalImage>;

export const AnimalSource = z.strictObject({
  providerId: z.string().min(1),
  sourceAnimalId: z.string().min(1).optional(),
  sourceUrl: z.url(),
  fetchedAt: z.iso.datetime(),
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});
export type AnimalSource = z.infer<typeof AnimalSource>;

export const AnimalShelter = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  city: z.string().min(1),
});
export type AnimalShelter = z.infer<typeof AnimalShelter>;

export const AnimalMedical = z.strictObject({
  vaccinated: z.boolean().optional(),
  neutered: z.boolean().optional(),
  microchipped: z.boolean().optional(),
  fiv: TestResult.optional(),
  felv: TestResult.optional(),
});
export type AnimalMedical = z.infer<typeof AnimalMedical>;

export const AnimalGoodWith = z.strictObject({
  kids: Compatibility.optional(),
  dogs: Compatibility.optional(),
  cats: Compatibility.optional(),
});
export type AnimalGoodWith = z.infer<typeof AnimalGoodWith>;

// Strict: owner contacts, adopter data and microchip numbers must never reach
// the dataset, so any unknown key is an error rather than a passthrough.
export const Animal = z.strictObject({
  id: z.string().min(1),
  source: AnimalSource,
  shelter: AnimalShelter,

  name: z.string().min(1).optional(),
  species: Species,
  sex: Sex.optional(),

  breed: z.string().optional(),
  birthDate: z.iso.date().optional(),
  approximateAgeMonths: z.number().int().nonnegative().optional(),

  size: AnimalSize.optional(),
  energy: EnergyLevel.optional(),
  status: AdoptionStatus,

  intakeDate: z.iso.date().optional(),
  foundDate: z.iso.date().optional(),
  originMunicipality: z.string().optional(),

  medical: AnimalMedical.optional(),
  goodWith: AnimalGoodWith.optional(),

  // Same three answers as goodWith, for the same reason: a shelter saying it
  // does not know whether the animal can live in a flat is information.
  apartmentOk: Compatibility.optional(),
  // The animal needs more time, knowledge or care than most. A flag rather
  // than a Compatibility: a shelter either says so or has not, and there is
  // no useful "no" to record.
  specialNeeds: z.boolean().optional(),

  images: z.array(AnimalImage),

  shortDescription: z.string().optional(),

  attribution: z.string().min(1),
});
export type Animal = z.infer<typeof Animal>;
