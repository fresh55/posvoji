import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import {
  AppearanceManifest,
  applyAppearance,
  currentPhotoHashes,
  categoryIssues,
  categoryReport,
} from "./appearance";

const now = "2026-09-21T12:00:00.000Z";
const url = "https://shelter.example/cat.jpg";
const hash = "a".repeat(64);
const policy = ProviderPolicy.parse({
  providerId: "fixture", source: "https://shelter.example/", enabled: true,
  ingestion: "scrape", images: "cache-permitted", descriptions: "full-permitted",
  permission: { status: "granted", date: "2026-01-01" },
  attribution: "Fixture shelter", crawl: { intervalHours: 12, excludePaths: [] },
});
const policies = new Map([["fixture", policy]]);
const source = Animal.parse({
  id: "fixture:1", species: "cat", status: "available",
  source: { providerId: "fixture", sourceAnimalId: "1", sourceUrl: "https://shelter.example/1",
    fetchedAt: now, firstSeenAt: now, lastSeenAt: now },
  shelter: { id: "fixture", name: "Fixture shelter", city: "Fixture town" },
  images: [{ sourceUrl: url, cachedUrl: "/media/animals/fixture.webp", rights: "cache-permitted" }],
  attribution: "Fixture shelter",
});
function review(): AppearanceManifest {
  return { version: 1, reviewedAt: now, records: [{
    animalId: source.id, providerId: "fixture", sourceUrl: source.source.sourceUrl, species: "cat",
    coatColors: ["black", "white"], coatLength: "short",
    coatColor: "black", coatColorReviewedBy: ["colour-first", "colour-second"],
    evidence: [{ sourceUrl: url, sha256: hash }], reviewedBy: ["first", "second"],
  }] };
}
const photos = new Map([[url, hash]]);

describe("colours that cannot have a dominant one", () => {
  const filed = (coatColors: string[], coatColor: string): AppearanceManifest => {
    const manifest = review();
    return {
      ...manifest,
      records: [{ ...manifest.records[0], coatColors, coatColor } as (typeof manifest.records)[number]],
    };
  };

  it("flags a tortoiseshell or a calico filed under one colour", () => {
    expect(categoryIssues(filed(["black", "orange"], "black"))).toEqual([
      "fixture:1: tortoiseshell (black+orange) filed as black, expected multicolour",
    ]);
    expect(categoryIssues(filed(["black", "white", "orange"], "white"))).toEqual([
      "fixture:1: calico (black+white+orange) filed as white, expected multicolour",
    ]);
  });

  it("leaves the answers nobody disputes alone", () => {
    // Already right, a brown tabby's stripes, and a black and white cat:
    // none of these is the pattern this check is about.
    expect(categoryIssues(filed(["black", "orange"], "multicolour"))).toEqual([]);
    expect(categoryIssues(filed(["black", "brown"], "brown"))).toEqual([]);
    expect(categoryIssues(filed(["black", "white"], "black"))).toEqual([]);
  });

  it("reports paired categories separately", () => {
    expect(categoryReport(filed(["black", "white"], "black-white")))
      .toEqual({ classified: 1, multicolour: 0, paired: 1 });
  });

  it.each([
    [["white"], "black-white", "black"],
    [["orange"], "orange-white", "white"],
    [["grey"], "white", "white"],
  ])("warns when the category contradicts its palette", (colours, category, missing) => {
    const manifest = filed(colours as string[], category as string);
    expect(categoryIssues(manifest)).toEqual([
      `fixture:1: ${category} requires ${missing} in coatColors`,
    ]);
    // A warning must not rewrite the review or block schema parsing.
    expect(AppearanceManifest.parse(manifest).records[0]?.coatColor).toBe(category);
  });

  it("does not label a dog's tan points as tortoiseshell", () => {
    const manifest = filed(["black", "orange"], "black");
    manifest.records[0]!.species = "dog";
    expect(categoryIssues(manifest)).toEqual([]);
  });

  it("allows tabby-and-white and essentially white animals with minor spots", () => {
    expect(categoryIssues(filed(["black", "brown", "white"], "brown-white"))).toEqual([]);
    expect(categoryIssues(filed(["black", "grey", "white"], "grey-white"))).toEqual([]);
    expect(categoryIssues(filed(["black", "white"], "white"))).toEqual([]);
  });
});

describe("reviewed photo appearance", () => {
  it("fills supported appearance without requiring prose or changing source observations", () => {
    const result = applyAppearance([source], review(), policies, photos);
    expect(result.issues).toEqual([]);
    expect(result.animals[0]).toMatchObject({ coatColors: ["black", "white"], coatColor: "black", coatLength: "short", source: source.source });
    expect(result.colourCoverage).toEqual({ total: 1, classified: 1, unknown: 0 });
    expect(result.colourReviewQueue).toEqual([]);
    expect(source.coatColor).toBeUndefined();
    expect(source.coatColors).toBeUndefined();
    expect(source.coatLength).toBeUndefined();
  });

  it("withdraws stale appearance on a subsequent publication from the raw snapshot", () => {
    const first = applyAppearance([source], review(), policies, photos);
    expect(first.animals[0]?.coatColors).toBeDefined();
    for (const evidence of [new Map(), new Map([[url, "b".repeat(64)]])]) {
      const next = applyAppearance([source], review(), policies, evidence);
      expect(next.animals[0]?.coatColors).toBeUndefined();
      expect(next.animals[0]?.coatColor).toBeUndefined();
      expect(next.colourReviewQueue).toEqual([{ animalId: source.id, reason: "evidence-changed" }]);
      expect(next.issues).toEqual([{ animalId: source.id, reason: "evidence-changed" }]);
    }
  });

  it("requires reviewed photos still attached to the same animal and species", () => {
    for (const changed of [
      { ...source, images: [] },
      { ...source, images: [{ ...source.images[0]!, rights: "display-permitted" as const }] },
      { ...source, species: "dog" as const },
      { ...source, source: { ...source.source, sourceUrl: "https://shelter.example/2" } },
    ]) expect(applyAppearance([changed], review(), policies, photos).applied).toEqual([]);
    expect(applyAppearance([], review(), policies, photos).animals).toEqual([]);
  });

  it("respects revoked permission and field restrictions", () => {
    for (const changed of [
      { ...policy, enabled: false },
      { ...policy, permission: { status: "denied" as const } },
      { ...policy, images: "remote" as const },
      { ...policy, allowedFields: ["coatColors"] },
      { ...policy, allowedFields: ["images"] },
    ]) expect(applyAppearance([source], review(), new Map([["fixture", changed]]), photos).applied).toEqual([]);
    const result = applyAppearance([source], review(), new Map([["fixture", { ...policy, allowedFields: ["images", "coatColors"] }]]), photos);
    expect(result.animals[0]?.coatColors).toEqual(["black", "white"]);
    expect(result.animals[0]?.coatLength).toBeUndefined();
    expect(result.animals[0]?.coatColor).toBeUndefined();
  });

  it("records only a young stage from photos, under its own reviewers, and never over an age", () => {
    const young = (): AppearanceManifest => {
      const manifest = review();
      return { ...manifest, records: [{ ...manifest.records[0]!, lifeStage: "young", lifeStageReviewedBy: ["stage-first", "stage-second"] }] };
    };
    const result = applyAppearance([source], young(), policies, photos);
    expect(result.animals[0]?.lifeStage).toBe("young");
    expect(result.applied).toContainEqual({ animalId: source.id, field: "lifeStage" });
    const aged = applyAppearance([{ ...source, approximateAgeMonths: 30 }], young(), policies, photos);
    expect(aged.animals[0]?.lifeStage).toBeUndefined();
    expect(aged.issues).toContainEqual({ animalId: source.id, field: "lifeStage", reason: "existing-value" });
    const unreviewed = young();
    delete unreviewed.records[0]!.lifeStageReviewedBy;
    expect(AppearanceManifest.safeParse(unreviewed).success).toBe(false);
    const adult = young();
    (adult.records[0] as Record<string, unknown>).lifeStage = "adult";
    expect(AppearanceManifest.safeParse(adult).success).toBe(false);
  });

  it("preserves explicit structured and description-reviewed answers", () => {
    const animal = { ...source, coatColors: ["grey" as const], coatColor: "grey" as const, coatLength: "long" as const };
    const result = applyAppearance([animal], review(), policies, photos);
    expect(result.animals).toEqual([animal]);
    expect(result.applied).toEqual([]);
  });

  it("requires distinct reviewers, meaningful values, and unique animals/photos", () => {
    const invalid = review();
    invalid.records[0]!.reviewedBy = ["same", "same"];
    expect(AppearanceManifest.safeParse(invalid).success).toBe(false);
    const duplicate = review();
    duplicate.records.push(duplicate.records[0]!);
    expect(AppearanceManifest.safeParse(duplicate).success).toBe(false);
    const empty = review();
    delete empty.records[0]!.coatColors;
    delete empty.records[0]!.coatLength;
    delete empty.records[0]!.coatColor;
    delete empty.records[0]!.coatColorReviewedBy;
    expect(AppearanceManifest.safeParse(empty).success).toBe(false);
    const missingReview = review();
    delete missingReview.records[0]!.coatColorReviewedBy;
    expect(AppearanceManifest.safeParse(missingReview).success).toBe(false);
    missingReview.records[0]!.coatColorReviewedBy = ["same", "same"];
    expect(AppearanceManifest.safeParse(missingReview).success).toBe(false);
  });

  it("preserves historical white-area reviewers without publishing the retired field", () => {
    const manifest = review();
    const record = manifest.records[0]!;
    record.substantialWhite = true;
    expect(AppearanceManifest.safeParse(manifest).success).toBe(false);
    record.substantialWhiteReviewedBy = ["same", "same"];
    expect(AppearanceManifest.safeParse(manifest).success).toBe(false);
    record.substantialWhiteReviewedBy = ["markings-first", "markings-second"];
    record.coatColor = "black-white";
    expect(AppearanceManifest.parse(manifest).records[0]).toMatchObject({
      coatColorReviewedBy: ["colour-first", "colour-second"],
      substantialWhiteReviewedBy: ["markings-first", "markings-second"],
    });
    const published = applyAppearance([source], manifest, policies, photos).animals[0];
    expect(published?.coatColor).toBe("black-white");
    expect(published).not.toHaveProperty("substantialWhite");
    expect(applyAppearance([source], manifest, policies, new Map()).animals[0]?.coatColor).toBeUndefined();
    delete record.substantialWhite;
    expect(AppearanceManifest.safeParse(manifest).success).toBe(false);
  });

  it("reports new animals and unclassified descriptions without inventing a filter colour", () => {
    const descriptiveOnly = review();
    delete descriptiveOnly.records[0]!.coatColor;
    delete descriptiveOnly.records[0]!.coatColorReviewedBy;
    const newAnimal = { ...source, id: "fixture:new" };
    const result = applyAppearance([source, newAnimal], descriptiveOnly, policies, photos);
    expect(result.animals[0]?.coatColors).toEqual(["black", "white"]);
    expect(result.animals.every((animal) => animal.coatColor === undefined)).toBe(true);
    expect(result.colourCoverage).toEqual({ total: 2, classified: 0, unknown: 2 });
    expect(result.colourReviewQueue).toEqual([
      { animalId: source.id, reason: "unclassified" },
      { animalId: newAnimal.id, reason: "unclassified" },
    ]);
  });

  it("hashes actual cache bytes and treats missing files as unavailable evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "appearance-"));
    try {
      const bytes = Buffer.from("fixture-photo-bytes");
      writeFileSync(join(directory, "fixture.webp"), bytes);
      expect(currentPhotoHashes([source], review(), directory).get(url))
        .toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(currentPhotoHashes([{ ...source, images: [{ ...source.images[0]!, cachedUrl: "/media/animals/missing.webp" }] }], review(), directory).size).toBe(0);
      expect(currentPhotoHashes([{ ...source, images: [{ ...source.images[0]!, cachedUrl: "/media/animals/../fixture.webp" }] }], review(), directory).size).toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
