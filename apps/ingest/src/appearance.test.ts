import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Animal, ProviderPolicy } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { AppearanceManifest, applyAppearance, currentPhotoHashes } from "./appearance";

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
