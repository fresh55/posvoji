import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Animal, CoatColorCategory, CoatColors, CoatLength, Species, WhiteMarkings, type ProviderPolicy } from "@posvoji/schema";
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
    whiteMarkings: WhiteMarkings.optional(),
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
      "a filter colour requires its own independent reviewers")
    // White markings decide which colour bucket the animal is filtered into,
    // so they are held to the same two-reviewer bar as the colour itself and
    // have to agree with the colours the same review listed.
    .refine((record) => record.whiteMarkings === undefined || record.coatColorReviewedBy !== undefined,
      "white markings require the colour reviewers")
    .refine((record) => record.whiteMarkings === undefined || record.whiteMarkings === "none" ||
      record.coatColors === undefined || record.coatColors.includes("white"),
      "white markings require white among the coat colors")),
}).refine((manifest) => new Set(manifest.records.map((record) => record.animalId)).size === manifest.records.length,
  "duplicate animal appearance review");
export type AppearanceManifest = z.infer<typeof AppearanceManifest>;

export function loadAppearance(): AppearanceManifest {
  return AppearanceManifest.parse(JSON.parse(readFileSync(join(repoRoot, "data", "animal-appearance.json"), "utf8")));
}

/** The reviewed fields a record can carry, for the apply loop, the issue
    type and the provider permission check, which each listed them. */
export const APPEARANCE_FIELDS = ["coatColors", "coatColor", "whiteMarkings", "coatLength"] as const;
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
      // Explicit shelter facts and description-backed corrections take precedence.
      if (animal[field] !== undefined) { reject("existing-value", field); continue; }
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
  // How far the white-markings review has got. A classified animal without
  // it filters exactly as it did before the field existed, so this number
  // going up is the only visible sign the two-toned options are filling in.
  const whiteMarkingsCoverage = { classified: 0, judged: 0, major: 0 };
  for (const animal of published) {
    if (animal.coatColor === undefined) {
      colourReviewQueue.push({
        animalId: animal.id,
        reason: colourIssue.get(animal.id) ?? "unclassified",
      });
      continue;
    }
    whiteMarkingsCoverage.classified += 1;
    if (animal.whiteMarkings !== undefined) whiteMarkingsCoverage.judged += 1;
    if (animal.whiteMarkings === "major") whiteMarkingsCoverage.major += 1;
  }
  const colourCoverage = { total: published.length, classified: whiteMarkingsCoverage.classified, unknown: colourReviewQueue.length };
  return { animals: published, applied, issues, colourCoverage, whiteMarkingsCoverage, colourReviewQueue };
}

/**
 * Colours a review filed under one dominant colour that cannot have one.
 *
 * Black and orange together is a tortoiseshell, and with white a calico.
 * Neither has a dominant colour, so both belong in Multicolour, and the rule
 * in docs/COLOUR-REVIEW.md already says so. It was not being applied: of the
 * 30 animals carrying both, 12 were filed Multicolour, 8 White, 7 Black and
 * 3 Brown, so the same animal landed in four different places depending on
 * who looked. Two of the seven under Black are why a visitor pressing Črna
 * was shown a tortoiseshell cat.
 *
 * A check rather than a correction: the review owns the answer, and a
 * classifier that silently overrode it would hide the next drift instead of
 * reporting it. Only the combination nobody disputes is flagged, so a pass
 * here is quiet rather than merely tolerated.
 */
export function dominanceIssues(manifest: AppearanceManifest): string[] {
  return manifest.records.flatMap((record) => {
    const colours = record.coatColors;
    if (!colours || record.coatColor === undefined) return [];
    if (record.coatColor === "multicolour") return [];
    if (!colours.includes("black") || !colours.includes("orange")) return [];
    const pattern = colours.includes("white") ? "calico" : "tortoiseshell";
    return [
      `${record.animalId}: ${pattern} (${colours.join("+")}) filed as ${record.coatColor}, expected multicolour`,
    ];
  });
}

/**
 * How much of the catalogue is being forced into a dominant colour.
 *
 * Reported rather than failed, because a high share is a question and not
 * always a fault: a brown tabby really is brown, stripes and all. It earns a
 * number because Multicolour sat at 5% while 142 animals carried three or
 * more colours under a single-colour label, and nobody could see that from
 * the coverage line.
 */
export function dominanceReport(manifest: AppearanceManifest) {
  const classified = manifest.records.filter((record) => record.coatColor !== undefined);
  const multicolour = classified.filter((record) => record.coatColor === "multicolour").length;
  const forced = classified.filter((record) =>
    record.coatColor !== "multicolour" && (record.coatColors?.length ?? 0) >= 3).length;
  // The two-toned options are dormant until this reaches the classified
  // count, so it belongs beside the other two numbers rather than only in
  // the export log a release produces.
  const judged = classified.filter((record) => record.whiteMarkings !== undefined).length;
  return { classified: classified.length, multicolour, judged, forced };
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
