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

export const TestResult = z.enum(["positive", "negative", "unknown"]);
export type TestResult = z.infer<typeof TestResult>;

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
  status: AdoptionStatus,

  intakeDate: z.iso.date().optional(),
  foundDate: z.iso.date().optional(),
  originMunicipality: z.string().optional(),

  medical: AnimalMedical.optional(),

  images: z.array(AnimalImage),

  shortDescription: z.string().optional(),

  attribution: z.string().min(1),
});
export type Animal = z.infer<typeof Animal>;
