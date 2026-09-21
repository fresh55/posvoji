import type { ProviderPolicy } from "@posvoji/schema";
import type { AppearanceManifest } from "./appearance";
import type { EnrichmentManifest } from "./enrichment";

/** Check that active provider permissions allow the reviewed fields to publish. */
export function reviewedPolicyIssues(
  enrichment: EnrichmentManifest,
  appearance: AppearanceManifest,
  policies: ReadonlyMap<string, ProviderPolicy>,
): string[] {
  const issues: string[] = [];
  const check = (animalId: string, providerId: string, fields: string[]) => {
    const policy = policies.get(providerId);
    if (!policy) { issues.push(`${animalId}: reviewed provider ${providerId} does not exist`); return; }
    if (!policy.enabled || policy.permission.status !== "granted") return;
    for (const field of fields) {
      if (policy.allowedFields?.length && !policy.allowedFields.includes(field.split(".")[0]!)) {
        issues.push(`${animalId}: reviewed ${field} is excluded by ${providerId}.allowedFields`);
      }
    }
  };
  for (const record of enrichment.records) check(record.animalId, record.providerId, record.claims.map((claim) => claim.field));
  for (const record of appearance.records) {
    check(record.animalId, record.providerId,
      ["images", ...(["coatColors", "coatColor", "coatLength"] as const).filter((field) => record[field] !== undefined)]);
    const policy = policies.get(record.providerId);
    if (policy?.enabled && policy.permission.status === "granted" && policy.images !== "cache-permitted") {
      issues.push(`${record.animalId}: reviewed appearance requires ${record.providerId}.images to be cache-permitted`);
    }
  }
  return issues;
}
