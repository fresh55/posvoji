import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Animal, type ProviderPolicy } from "@posvoji/schema";
import { z } from "zod";
import { repoRoot } from "./paths";
import type { PortalExportPayload } from "./portal-contract";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const Evidence = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  sha256: digest,
}).refine((span) => span.end > span.start, "evidence must not be empty");

const fields = {
  energy: z.enum(["calm", "balanced", "lively"]),
  size: z.enum(["small", "medium", "large"]),
  sex: z.enum(["male", "female"]),
  "goodWith.kids": z.enum(["yes", "no"]),
  "goodWith.dogs": z.enum(["yes", "no"]),
  "goodWith.cats": z.enum(["yes", "no"]),
  apartmentOk: z.enum(["yes", "no"]),
  specialNeeds: z.literal(true),
  "medical.neutered": z.boolean(),
  "medical.vaccinated": z.boolean(),
  "medical.microchipped": z.boolean(),
  "medical.fiv": z.enum(["positive", "negative"]),
  "medical.felv": z.enum(["positive", "negative"]),
  "adoptionRequirements.indoorOnly": z.literal(true),
  "adoptionRequirements.bondedPair": z.literal(true),
  "adoptionRequirements.experiencedCarer": z.literal(true),
  "adoptionRequirements.ongoingCare": z.literal(true),
} as const;

export const EnrichmentClaim = z.strictObject({
  field: z.enum(Object.keys(fields) as [keyof typeof fields, ...(keyof typeof fields)[]]),
  value: z.union([z.string(), z.boolean()]),
  evidence: Evidence,
  reviewedBy: z.array(z.string().min(1)).min(2),
}).superRefine((claim, ctx) => {
  if (!fields[claim.field].safeParse(claim.value).success) {
    ctx.addIssue({ code: "custom", message: "invalid value for enrichment field", path: ["value"] });
  }
  if (new Set(claim.reviewedBy).size < 2) {
    ctx.addIssue({ code: "custom", message: "two distinct reviewers are required", path: ["reviewedBy"] });
  }
});

export const EnrichmentManifest = z.strictObject({
  version: z.literal(1),
  reviewedAt: z.iso.datetime(),
  records: z.array(z.strictObject({
    animalId: z.string().min(1),
    providerId: z.string().min(1),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    descriptionSha256: digest,
    claims: z.array(EnrichmentClaim).min(1),
  })),
}).superRefine((manifest, ctx) => {
  const seen = new Set<string>();
  for (const [index, record] of manifest.records.entries()) {
    const key = `${record.providerId}\u0000${record.animalId}`;
    if (seen.has(key) || new Set(record.claims.map((c) => c.field)).size !== record.claims.length) {
      ctx.addIssue({ code: "custom", message: "duplicate animal or field", path: ["records", index] });
    }
    seen.add(key);
  }
});
export type EnrichmentManifest = z.infer<typeof EnrichmentManifest>;

export function evidenceHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// This committed file contains facts, offsets and hashes, never shelter prose.
// Missing or malformed review data fails closed instead of silently dropping it.
export function loadEnrichment(): EnrichmentManifest {
  return EnrichmentManifest.parse(JSON.parse(readFileSync(
    join(repoRoot, "data", "animal-enrichment.json"), "utf8",
  )));
}

export type EnrichmentIssue = {
  animalId: string;
  field?: string;
  reason: "missing-animal" | "permission" | "source-changed" | "shelter-description" | "shelter-value" |
    "evidence-changed" | "existing-value" | "species";
};

/** Pure publication step. Only missing fields are filled; the raw snapshot
 * remains untouched. Recomputing from that snapshot also removes stale claims. */
export function applyEnrichment(
  animals: readonly Animal[],
  manifest: EnrichmentManifest,
  policies: ReadonlyMap<string, ProviderPolicy>,
  portal: PortalExportPayload | null = null,
) {
  const checked = EnrichmentManifest.parse(manifest);
  const byId = new Map(animals.map((animal) => [animal.id, animal]));
  const result = new Map(byId);
  const issues: EnrichmentIssue[] = [];
  const applied: { animalId: string; field: string }[] = [];
  for (const record of checked.records) {
    const animal = byId.get(record.animalId);
    const reject = (reason: EnrichmentIssue["reason"], field?: string) =>
      issues.push({ animalId: record.animalId, ...(field ? { field } : {}), reason });
    if (!animal || animal.source.providerId !== record.providerId) {
      reject("missing-animal");
      continue;
    }
    const policy = policies.get(record.providerId);
    if (!policy?.enabled || policy.permission.status !== "granted" || policy.descriptions === "facts-only") {
      reject("permission");
      continue;
    }
    const description = animal.shortDescription;
    if (!description || animal.source.sourceUrl !== record.sourceUrl || evidenceHash(description) !== record.descriptionSha256) {
      reject("source-changed");
      continue;
    }
    // A portal correction to the description supersedes the text reviewed here.
    const correction = portal?.overrides.find((override) =>
      override.animalId === record.animalId && override.providerId === record.providerId);
    if (correction?.fields.shortDescription !== undefined && correction.fields.shortDescription !== description) {
      reject("shelter-description");
      continue;
    }
    let enriched = animal;
    for (const claim of record.claims) {
      const [top, nested] = claim.field.split(".") as [string, string?];
      const portalField = top === "goodWith" && nested
        ? `goodWith${nested[0]!.toUpperCase()}${nested.slice(1)}` : claim.field;
      if (correction && portalField in correction.fields) {
        reject("shelter-value", claim.field);
        continue;
      }
      if (policy.allowedFields?.length && !policy.allowedFields.includes(top)) {
        reject("permission", claim.field);
        continue;
      }
      if (claim.field === "medical.fiv" || claim.field === "medical.felv") {
        if (animal.species !== "cat") {
          reject("species", claim.field);
          continue;
        }
      }
      const { start, end, sha256 } = claim.evidence;
      if (end > description.length || evidenceHash(description.slice(start, end)) !== sha256) {
        reject("evidence-changed", claim.field);
        continue;
      }
      const object = enriched as unknown as Record<string, unknown>;
      const parent = object[top] as Record<string, unknown> | undefined;
      const existing = nested ? parent?.[nested] : object[top];
      // Explicit "unknown", false and "no" are answers too. Never overrule them.
      if (existing !== undefined) {
        reject("existing-value", claim.field);
        continue;
      }
      enriched = Animal.parse({
        ...enriched,
        [top]: nested ? { ...parent, [nested]: claim.value } : claim.value,
      });
      applied.push({ animalId: animal.id, field: claim.field });
    }
    result.set(animal.id, enriched);
  }
  return { animals: animals.map((animal) => result.get(animal.id)!), applied, issues };
}
