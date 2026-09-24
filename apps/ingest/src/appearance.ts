import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Animal, CoatColorCategory, CoatColors, CoatLength, Species, type ProviderPolicy } from "@posvoji/schema";
import { z } from "zod";
import { cachedImagesDir, repoRoot } from "./paths";

const Reviewers = z.array(z.string().min(1)).min(2).refine(
  (reviewers) => new Set(reviewers).size >= 2, "two distinct reviewers are required",
);
const PhotoEvidence = z.strictObject({
  sourceUrl: z.url({ protocol: /^https?$/ }),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const AppearanceManifest = z.strictObject({
  version: z.literal(1),
  reviewedAt: z.iso.datetime(),
  records: z.array(z.strictObject({
    animalId: z.string().min(1),
    providerId: z.string().min(1),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    species: Species,
    coatColors: CoatColors.optional(),
    coatColor: CoatColorCategory.optional(),
    // Historical white-area review; retained for provenance, never published.
    substantialWhite: z.boolean().optional(),
    substantialWhiteReviewedBy: Reviewers.optional(),
    coatColorReviewedBy: Reviewers.optional(),
    coatLength: CoatLength.optional(),
    // A photo shows a kitten or a puppy. It cannot tell five years from nine,
    // and it can be as old as the listing, so the only stage it records is
    // young, under its own reviewers, and the export keeps that only while
    // the intake is recent (life-stage.ts).
    lifeStage: z.literal("young").optional(),
    lifeStageReviewedBy: Reviewers.optional(),
    evidence: z.array(PhotoEvidence).min(1).refine(
      (photos) => new Set(photos.map((photo) => photo.sourceUrl)).size === photos.length,
      "duplicate photo evidence",
    ),
    reviewedBy: Reviewers,
  }).refine((record) => record.coatColors !== undefined || record.coatLength !== undefined || record.coatColor !== undefined || record.substantialWhite !== undefined || record.lifeStage !== undefined,
    "an appearance review must record a supported field")
    .refine((record) => (record.coatColor !== undefined) === (record.coatColorReviewedBy !== undefined),
      "a filter colour requires its own independent reviewers")
    .refine((record) => (record.lifeStage !== undefined) === (record.lifeStageReviewedBy !== undefined),
      "a life stage requires its own independent reviewers")
    .refine((record) => (record.substantialWhite !== undefined) === (record.substantialWhiteReviewedBy !== undefined),
      "white markings require their own independent reviewers")
    .refine((record) => record.substantialWhite !== true || record.coatColors === undefined || record.coatColors.includes("white"),
      "substantial white requires white among the visible coat colors")),
}).refine((manifest) => new Set(manifest.records.map((record) => record.animalId)).size === manifest.records.length,
  "duplicate animal appearance review");
export type AppearanceManifest = z.infer<typeof AppearanceManifest>;

export function loadAppearance(): AppearanceManifest {
  return AppearanceManifest.parse(JSON.parse(readFileSync(join(repoRoot, "data", "animal-appearance.json"), "utf8")));
}

/** The reviewed fields a record can carry, for the apply loop, the issue
    type and the provider permission check, which each listed them. */
export const APPEARANCE_FIELDS = ["coatColors", "coatColor", "coatLength", "lifeStage"] as const;
type AppearanceField = (typeof APPEARANCE_FIELDS)[number];

export type AppearanceIssue = {
  animalId: string;
  field?: AppearanceField;
  reason: "missing-animal" | "source-changed" | "permission" | "evidence-changed" | "existing-value";
};

/** Apply after caching photos; a shelter can replace an image at the same URL. */
export function applyAppearance(
  animals: readonly Animal[],
  manifest: AppearanceManifest,
  policies: ReadonlyMap<string, ProviderPolicy>,
  photoHashes: ReadonlyMap<string, string>,
) {
  const checked = AppearanceManifest.parse(manifest);
  const result = new Map(animals.map((animal) => [animal.id, animal]));
  const applied: { animalId: string; field: AppearanceField }[] = [];
  const issues: AppearanceIssue[] = [];
  for (const record of checked.records) {
    const reject = (reason: AppearanceIssue["reason"], field?: AppearanceIssue["field"]) =>
      issues.push({ animalId: record.animalId, reason, ...(field ? { field } : {}) });
    const animal = result.get(record.animalId);
    if (!animal || animal.source.providerId !== record.providerId) { reject("missing-animal"); continue; }
    if (animal.source.sourceUrl !== record.sourceUrl || animal.species !== record.species) { reject("source-changed"); continue; }
    const policy = policies.get(record.providerId);
    if (!policy?.enabled || policy.permission.status !== "granted" || policy.images !== "cache-permitted" ||
      (policy.allowedFields?.length && !policy.allowedFields.includes("images"))) {
      reject("permission"); continue;
    }
    if (record.evidence.some((photo) => !animal.images.some((image) =>
      image.sourceUrl === photo.sourceUrl && image.rights === "cache-permitted") || photoHashes.get(photo.sourceUrl) !== photo.sha256)) {
      reject("evidence-changed"); continue;
    }
    const enriched = { ...animal };
    for (const field of APPEARANCE_FIELDS) {
      if (record[field] === undefined) continue;
      if (policy.allowedFields?.length && !policy.allowedFields.includes(field)) { reject("permission", field); continue; }
      // Explicit shelter facts and description-backed corrections take
      // precedence, and a stated age answers what a photo's stage would.
      if (animal[field] !== undefined || (field === "lifeStage" &&
        (animal.approximateAgeMonths !== undefined || animal.birthDate !== undefined))) {
        reject("existing-value", field); continue;
      }
      Object.assign(enriched, { [field]: record[field] });
      applied.push({ animalId: animal.id, field });
    }
    result.set(animal.id, Animal.parse(enriched));
  }
  const published = animals.map((animal) => result.get(animal.id)!);
  // Why each animal is unclassified, read once. Looked up inside the queue
  // map it was a scan of every issue per unclassified animal.
  const colourIssue = new Map<string, AppearanceIssue["reason"]>();
  for (const issue of issues) {
    if (issue.field && issue.field !== "coatColor") continue;
    if (!colourIssue.has(issue.animalId)) colourIssue.set(issue.animalId, issue.reason);
  }
  const colourReviewQueue: { animalId: string; reason: string }[] = [];
  for (const animal of published) {
    if (animal.coatColor === undefined) {
      colourReviewQueue.push({
        animalId: animal.id,
        reason: colourIssue.get(animal.id) ?? "unclassified",
      });
      continue;
    }
  }
  const colourCoverage = { total: published.length, classified: published.length - colourReviewQueue.length, unknown: colourReviewQueue.length };
  return { animals: published, applied, issues, colourCoverage, colourReviewQueue };
}

/** Report contradictions for a photo reviewer; never rewrite their decision. */
export function categoryIssues(manifest: AppearanceManifest): string[] {
  return manifest.records.flatMap((record) => {
    const colours = record.coatColors;
    const category = record.coatColor;
    if (!colours || category === undefined || category === "multicolour") return [];
    if (record.species === "cat" && colours.includes("black") && colours.includes("orange")) {
      const pattern = colours.includes("white") ? "calico" : "tortoiseshell";
      return [`${record.animalId}: ${pattern} (${colours.join("+")}) filed as ${category}, expected multicolour`];
    }
    const required = category.split("-");
    const missing = required.filter((colour) => !colours.some((visible) => visible === colour));
    return missing.length ? [`${record.animalId}: ${category} requires ${missing.join(" and ")} in coatColors`] : [];
  });
}

export function categoryReport(manifest: AppearanceManifest) {
  const classified = manifest.records.filter((record) => record.coatColor !== undefined);
  const multicolour = classified.filter((record) => record.coatColor === "multicolour").length;
  const paired = classified.filter((record) => record.coatColor?.endsWith("-white")).length;
  return { classified: classified.length, multicolour, paired };
}

/** Read only currently attached, permissioned cache masters. Never fetch here. */
export function currentPhotoHashes(animals: readonly Animal[], manifest: AppearanceManifest, directory = cachedImagesDir): Map<string, string> {
  const wanted = new Set(manifest.records.flatMap((record) => record.evidence.map((photo) => photo.sourceUrl)));
  const hashes = new Map<string, string>();
  for (const animal of animals) for (const image of animal.images) {
    if (!wanted.has(image.sourceUrl) || hashes.has(image.sourceUrl) || image.rights !== "cache-permitted") continue;
    const file = image.cachedUrl?.match(/^\/media\/animals\/([A-Za-z0-9][A-Za-z0-9._-]*)$/)?.[1];
    if (!file) continue;
    try {
      hashes.set(image.sourceUrl, createHash("sha256").update(readFileSync(join(directory, file))).digest("hex"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return hashes;
}
