import { ProviderPolicy } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { reviewedPolicyIssues } from "./reviewed-policy";
import { loadEnrichment } from "./enrichment";
import { loadAppearance } from "./appearance";
import type { AppearanceManifest } from "./appearance";
import { loadPolicies } from "./policies";

describe("reviewed publication field coverage", () => {
  it("requires cached image permission even when appearance fields are allowed", () => {
    const reviewedAt = "2026-09-21T12:00:00.000Z";
    const enrichment = { version: 1 as const, reviewedAt, records: [] };
    const appearance: AppearanceManifest = { version: 1, reviewedAt, records: [{
      animalId: "fixture:1", providerId: "fixture", sourceUrl: "https://shelter.example/1", species: "cat",
      coatColors: ["black"], coatLength: "short",
      evidence: [{ sourceUrl: "https://shelter.example/cat.jpg", sha256: "a".repeat(64) }],
      reviewedBy: ["first", "second"],
    }] };
    const policy = ProviderPolicy.parse({
      providerId: "fixture", source: "https://shelter.example/", enabled: true,
      ingestion: "scrape", images: "cache-permitted", descriptions: "full-permitted",
      permission: { status: "granted", date: "2026-01-01" }, attribution: "Fixture shelter",
      crawl: { intervalHours: 12, excludePaths: [] }, allowedFields: ["coatColors", "coatLength"],
    });
    const check = (value: ProviderPolicy) => reviewedPolicyIssues(enrichment, appearance, new Map([["fixture", value]]));
    expect(check(policy)).toEqual(["fixture:1: reviewed images is excluded by fixture.allowedFields"]);
    const allowed = { ...policy, allowedFields: ["images", "coatColors", "coatLength"] };
    expect(check(allowed)).toEqual([]);
    const uncached = { ...allowed, images: "remote" as const };
    expect(check(uncached)).toEqual(["fixture:1: reviewed appearance requires fixture.images to be cache-permitted"]);
    expect(check({ ...uncached, enabled: false })).toEqual([]);
    expect(check({ ...uncached, permission: { status: "denied" } })).toEqual([]);
  });

  it("keeps every committed reviewed field publishable under active field grants", () => {
    expect(reviewedPolicyIssues(loadEnrichment(), loadAppearance(),
      new Map(loadPolicies().policies.map(({ policy }) => [policy.providerId, policy])))).toEqual([]);
  });

  it("catches the Horjul indoor-only omission without blocking a provider withdrawal", () => {
    const manifest = loadEnrichment();
    manifest.records = manifest.records.filter((record) => record.animalId === "horjul:834");
    expect(manifest.records).toHaveLength(1);
    const policy = ProviderPolicy.parse({ ...loadPolicies().policies.find(({ policy }) => policy.providerId === "horjul")!.policy,
      allowedFields: ["shortDescription", "images"],
    });
    const appearance = { version: 1 as const, reviewedAt: manifest.reviewedAt, records: [] };
    expect(reviewedPolicyIssues(manifest, appearance, new Map([["horjul", policy]])))
      .toContain("horjul:834: reviewed adoptionRequirements.indoorOnly is excluded by horjul.allowedFields");
    expect(reviewedPolicyIssues(manifest, appearance, new Map([["horjul", { ...policy, enabled: false }]]))).toEqual([]);
  });
});
