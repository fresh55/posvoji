import { Animal, ProviderPolicy } from "@posvoji/schema";
import { describe, expect, it } from "vitest";
import { applyEnrichment, EnrichmentManifest, evidenceHash } from "./enrichment";
import { preparePublication } from "./export-animals";

const NOW = "2026-09-13T10:00:00.000Z";
const description = "Je mirna mačka. Dobro se razume z drugimi mačkami.";
const policy = ProviderPolicy.parse({
  providerId: "fixture", source: "https://shelter.example/", enabled: true,
  ingestion: "scrape", images: "none", descriptions: "full-permitted",
  permission: { status: "granted", date: "2026-01-01" },
  attribution: "Fixture shelter", crawl: { intervalHours: 12, excludePaths: [] },
});
const policies = new Map([[policy.providerId, policy]]);
function animal(patch: Partial<Animal> = {}): Animal {
  return Animal.parse({
    id: "fixture:1", species: "cat", status: "available",
    source: { providerId: "fixture", sourceAnimalId: "1", sourceUrl: "https://shelter.example/1",
      fetchedAt: NOW, firstSeenAt: NOW, lastSeenAt: NOW },
    shelter: { id: "fixture", name: "Fixture shelter", city: "Fixture town" },
    images: [], attribution: "Fixture shelter", shortDescription: description, ...patch,
  });
}
function manifest(): EnrichmentManifest {
  return {
    version: 1, reviewedAt: NOW,
    records: [{ animalId: "fixture:1", providerId: "fixture", sourceUrl: "https://shelter.example/1",
      descriptionSha256: evidenceHash(description),
      claims: [{ field: "energy", value: "calm",
        evidence: { start: 0, end: 14, sha256: evidenceHash(description.slice(0, 14)) },
        reviewedBy: ["reviewer-a", "reviewer-b"] }],
    }],
  };
}

describe("reviewed description enrichment", () => {
  it("fills a missing field without mutating its source, and validates the result", () => {
    const source = animal();
    const result = applyEnrichment([source], manifest(), policies);
    expect(result.animals[0]?.energy).toBe("calm");
    expect(source.energy).toBeUndefined();
    expect(Animal.safeParse(result.animals[0]).success).toBe(true);
    expect(result.applied).toEqual([{ animalId: source.id, field: "energy" }]);
  });

  it("withdraws enrichment when the description, source URL or animal identity changes", () => {
    for (const source of [
      animal({ shortDescription: `${description} Ni več mirna.` }),
      animal({ source: { ...animal().source, sourceUrl: "https://shelter.example/new" } }),
      animal({ id: "fixture:new" }),
    ]) {
      expect(applyEnrichment([source], manifest(), policies).applied).toEqual([]);
    }
    expect(applyEnrichment([], manifest(), policies).animals).toEqual([]);
  });

  it("rejects altered evidence spans even with a matching description hash", () => {
    const changed = manifest();
    changed.records[0]!.claims[0]!.evidence.end = 15;
    expect(applyEnrichment([animal()], changed, policies).issues[0]?.reason).toBe("evidence-changed");
  });

  it("preserves an existing structured answer", () => {
    const result = applyEnrichment([animal({ energy: "lively" })], manifest(), policies);
    expect(result.animals[0]?.energy).toBe("lively");
    expect(result.applied).toEqual([]);
  });

  it("merges nested leaves while preserving explicit unknown, false and sibling values", () => {
    const reviewed = manifest();
    const claim = reviewed.records[0]!.claims[0]!;
    claim.field = "medical.neutered";
    claim.value = true;
    const source = animal({ medical: { vaccinated: false, fiv: "unknown" } });
    expect(applyEnrichment([source], reviewed, policies).animals[0]?.medical)
      .toEqual({ vaccinated: false, fiv: "unknown", neutered: true });
    claim.field = "medical.vaccinated";
    expect(applyEnrichment([source], reviewed, policies).applied).toEqual([]);
    claim.field = "medical.fiv";
    claim.value = "negative";
    expect(applyEnrichment([source], reviewed, policies).applied).toEqual([]);
  });

  it("does not add feline tests to dogs", () => {
    const reviewed = manifest();
    reviewed.records[0]!.claims[0]!.field = "medical.fiv";
    reviewed.records[0]!.claims[0]!.value = "negative";
    const result = applyEnrichment([animal({ species: "dog" })], reviewed, policies);
    expect(result.applied).toEqual([]);
    expect(result.issues[0]?.reason).toBe("species");
  });

  it("honors revoked permission, description restrictions and allowed fields", () => {
    for (const changed of [
      { ...policy, enabled: false },
      { ...policy, descriptions: "facts-only" as const },
      { ...policy, allowedFields: ["shortDescription"] },
      { ...policy, permission: { status: "denied" as const } },
    ]) {
      expect(applyEnrichment([animal()], manifest(), new Map([["fixture", changed]])).applied).toEqual([]);
    }
  });

  it("requires two distinct reviewers, valid field/value pairs and no duplicate claims", () => {
    const reviewed = manifest();
    reviewed.records[0]!.claims[0]!.reviewedBy = ["same", "same"];
    expect(EnrichmentManifest.safeParse(reviewed).success).toBe(false);
    reviewed.records[0]!.claims[0]!.reviewedBy = ["a", "b"];
    reviewed.records[0]!.claims[0]!.value = "friendly";
    expect(EnrichmentManifest.safeParse(reviewed).success).toBe(false);
    reviewed.records[0]!.claims[0]!.value = "calm";
    reviewed.records[0]!.claims.push(reviewed.records[0]!.claims[0]!);
    expect(EnrichmentManifest.safeParse(reviewed).success).toBe(false);
  });

  it("uses the same last correction as the portal merge for duplicate entries", () => {
    const portal = { generatedAt: NOW, overrides: [
      { providerId: "fixture", animalId: "fixture:1", fields: { shortDescription: "Older correction." } },
      { providerId: "fixture", animalId: "fixture:1", fields: {} },
    ] };
    const result = applyEnrichment([animal()], manifest(), policies, portal);
    expect(result.animals[0]?.energy).toBe("calm");
    expect(result.issues).toEqual([]);
  });

  it("keeps raw snapshots clean, gives portal corrections priority and suppresses changed descriptions", () => {
    function publish(fields: { energy?: "lively"; shortDescription?: string }) {
      return preparePublication({
        crawled: [animal()], listingAnimals: [], previousAnimals: [],
        policies: [{ dir: "fixture", policy }], policyById: policies,
        portalPayload: { generatedAt: NOW, overrides: [{ providerId: "fixture", animalId: "fixture:1", fields }] },
        enrichment: manifest(), crawledProviderIds: new Set(["fixture"]),
        logger: { log() {}, warn() {} },
      });
    }
    const enriched = publish({});
    expect(enriched.crawledSnapshot[0]?.energy).toBeUndefined();
    expect(enriched.overridden[0]?.energy).toBe("calm");
    expect(publish({ energy: "lively" }).overridden[0]?.energy).toBe("lively");
    expect(publish({ shortDescription: "Revised by shelter." }).overridden[0]?.energy).toBeUndefined();
  });
});
