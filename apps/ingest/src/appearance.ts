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
    coatColorReviewedBy: Reviewers.optional(),
    coatLength: CoatLength.optional(),
    evidence: z.array(PhotoEvidence).min(1).refine(
      (photos) => new Set(photos.map((photo) => photo.sourceUrl)).size === photos.length,
      "duplicate photo evidence",
    ),
    reviewedBy: Reviewers,
  }).refine((record) => record.coatColors !== undefined || record.coatLength !== undefined || record.coatColor !== undefined,
    "an appearance review must record a supported field")
    .refine((record) => (record.coatColor !== undefined) === (record.coatColorReviewedBy !== undefined),
      "a filter colour requires its own independent reviewers")),
}).refine((manifest) => new Set(manifest.records.map((record) => record.animalId)).size === manifest.records.length,
  "duplicate animal appearance review");
export type AppearanceManifest = z.infer<typeof AppearanceManifest>;

export function loadAppearance(): AppearanceManifest {
  return AppearanceManifest.parse(JSON.parse(readFileSync(join(repoRoot, "data", "animal-appearance.json"), "utf8")));
}

type AppearanceField = "coatColors" | "coatColor" | "coatLength";

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
    for (const field of ["coatColors", "coatColor", "coatLength"] as const) {
      if (record[field] === undefined) continue;
      if (policy.allowedFields?.length && !policy.allowedFields.includes(field)) { reject("permission", field); continue; }
      // Explicit shelter facts and description-backed corrections take precedence.
      if (animal[field] !== undefined) { reject("existing-value", field); continue; }
      Object.assign(enriched, { [field]: record[field] });
      applied.push({ animalId: animal.id, field });
    }
    result.set(animal.id, Animal.parse(enriched));
  }
  const published = animals.map((animal) => result.get(animal.id)!);
  const colourReviewQueue = published.filter((animal) => animal.coatColor === undefined).map((animal) => ({
    animalId: animal.id,
    reason: issues.find((issue) => issue.animalId === animal.id && (!issue.field || issue.field === "coatColor"))?.reason
      ?? "unclassified",
  }));
  const colourCoverage = { total: published.length, classified: published.length - colourReviewQueue.length, unknown: colourReviewQueue.length };
  return { animals: published, applied, issues, colourCoverage, colourReviewQueue };
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
