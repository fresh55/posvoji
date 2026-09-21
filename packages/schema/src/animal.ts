import { z } from "zod";
import { HttpUrl } from "./url";

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

export const CoatColor = z.enum(["black", "white", "grey", "brown", "orange", "cream"]);
export type CoatColor = z.infer<typeof CoatColor>;
export const CoatColorCategory = z.enum([...CoatColor.options, "multicolour"]);
export type CoatColorCategory = z.infer<typeof CoatColorCategory>;
export const CoatLength = z.enum(["short", "medium", "long", "hairless"]);
export type CoatLength = z.infer<typeof CoatLength>;
export const CoatColors = z.array(CoatColor).min(1).max(6).refine(
  (colors) => new Set(colors).size === colors.length,
  { error: "coat colors must be unique" },
);

/**
 * How much of the animal the white is.
 *
 * coatColors records which colours are visible and coatColor which one
 * dominates, and between them they cannot tell a tuxedo cat from a black cat
 * with a white bib: both are ["black", "white"] with a predominant black. 83
 * of the 146 animals classified black carry white, so over half of what the
 * Črna filter returned did not look black, which is the one thing that
 * filter promises.
 *
 * A separate answer rather than more colour categories, because it is a
 * smaller question for a reviewer than picking out of ten, and because it
 * leaves every coatColor already reviewed standing: the next review fills
 * this in and nothing else has to be decided again.
 *
 * minor is a bib, a locket, socks. major is a coat someone would describe as
 * two-coloured. Absent means nobody has looked yet, and reads as minor
 * everywhere downstream, so the catalogue behaves exactly as it does today
 * until the review lands.
 */
export const WhiteMarkings = z.enum(["none", "minor", "major"]);
export type WhiteMarkings = z.infer<typeof WhiteMarkings>;

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

// A tiny inline preview, not a link: "data:image/<type>;base64,<payload>".
const DATA_IMAGE_URL = /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/;

// The ingest cache writes one file directly under this directory. Keeping the
// final segment to a conservative filename character set rejects protocol-
// relative URLs, nested paths, traversal and query/fragment injection while
// still admitting the hashed masters and their derived filename shapes.
const CACHED_ANIMAL_PATH =
  /^\/media\/animals\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

const Fraction = z.number().min(0).max(1);

/** Where the animal is in a cached photo, as fractions of the copy's width
 *  and height: left edge, top edge, width, height. */
export const SubjectBox = z.strictObject({
  x: Fraction,
  y: Fraction,
  w: Fraction.refine((v) => v > 0, { error: "subject width must be positive" }),
  h: Fraction.refine((v) => v > 0, { error: "subject height must be positive" }),
});
export type SubjectBox = z.infer<typeof SubjectBox>;

export const AnimalImage = z.strictObject({
  sourceUrl: HttpUrl,
  // Filled by the ingest image cache. Root-relative ("/media/animals/…")
  // because the static site serves its own copies; a full URL stays valid
  // should the cache ever move to a separate host.
  cachedUrl: z
    .union([
      HttpUrl,
      z.string().regex(CACHED_ANIMAL_PATH, {
        error: "cachedUrl must be an HTTP(S) URL or a safe /media/animals filename",
      }),
    ])
    .optional(),
  // Pixel size of the cached copy, so a layout can reserve the right box
  // before the file loads. Optional: an image cached before ingest recorded
  // dimensions, or one that was never cached, carries neither.
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  // Widths of the smaller copies that exist next to the cached one, ascending
  // and ending with the cached copy's own width. Carried here so a consumer
  // knows the ladder from the dataset alone, without the ingest manifest.
  widths: z.array(z.number().int().positive()).optional(),
  // An AVIF sibling of the cached copy exists. Ingest derives one only for an
  // animal's first image, where the encode pays for itself.
  avif: z.boolean().optional(),
  // Inline placeholder shown while the photo loads.
  blurDataURL: z.string().regex(DATA_IMAGE_URL).optional(),
  // Where the animal is in the cached copy, from the ingest subject detector,
  // so a surface that crops the photo can keep the animal in its frame.
  // Absent when the detector found no animal or has not read this copy.
  subject: SubjectBox.optional(),
  rights: ImageRights,
});
export type AnimalImage = z.infer<typeof AnimalImage>;

export const AnimalSource = z.strictObject({
  providerId: z.string().min(1),
  sourceAnimalId: z.string().min(1).optional(),
  sourceUrl: HttpUrl,
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

// Explicit placement/care requirements stated for this animal. Absence means
// unanswered, never false. Kept separate from temperament and apartment fit.
export const AnimalAdoptionRequirements = z.strictObject({
  indoorOnly: z.boolean().optional(),
  bondedPair: z.boolean().optional(),
  experiencedCarer: z.boolean().optional(),
  ongoingCare: z.boolean().optional(),
  onlyPet: z.boolean().optional(),
});
export type AnimalAdoptionRequirements = z.infer<typeof AnimalAdoptionRequirements>;

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
  // Visible appearance, recorded only from explicit text or reviewed photos.
  // Detailed colours are separate from the single category used for filtering.
  coatColors: CoatColors.optional(),
  coatColor: CoatColorCategory.optional(),
  whiteMarkings: WhiteMarkings.optional(),
  coatLength: CoatLength.optional(),
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
  adoptionRequirements: AnimalAdoptionRequirements.optional(),

  images: z.array(AnimalImage),

  shortDescription: z.string().optional(),

  attribution: z.string().min(1),
}).refine(
  // White that is not listed among the visible colours is a contradiction
  // between two answers from the same review, and it would put an animal in
  // a two-toned filter bucket nothing else agrees with.
  (animal) =>
    animal.whiteMarkings === undefined ||
    animal.whiteMarkings === "none" ||
    animal.coatColors === undefined ||
    animal.coatColors.includes("white"),
  { error: "white markings require white among the coat colors" },
);
export type Animal = z.infer<typeof Animal>;
