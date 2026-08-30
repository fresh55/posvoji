import type { PortalExportPayload, PortalOverride } from "./portal-contract";
import type { ApplyOverridesResult, OverrideConflict } from "./portal-merge";

export interface OverrideReportEntry {
  providerId: string;
  animalId: string;
  fields: string[];
  recordedAt?: string;
}

// This sidecar keeps correction provenance out of the public Animal schema
// while making applied, unmatched, and conflicting overrides auditable.
export interface OverrideReport {
  generatedAt: string;
  enabled: boolean;
  portalGeneratedAt?: string;
  applied: OverrideReportEntry[];
  unmatched: OverrideReportEntry[];
  conflicts: OverrideConflict[];
}

function toEntry(override: PortalOverride): OverrideReportEntry {
  return {
    providerId: override.providerId,
    animalId: override.animalId,
    fields: Object.keys(override.fields).sort(),
    ...(override.recordedAt ? { recordedAt: override.recordedAt } : {}),
  };
}

export function buildOverrideReport(
  generatedAt: string,
  payload: PortalExportPayload | null,
  result: ApplyOverridesResult | null,
): OverrideReport {
  if (!payload || !result) {
    return {
      generatedAt,
      enabled: false,
      applied: [],
      unmatched: [],
      conflicts: [],
    };
  }

  return {
    generatedAt,
    enabled: true,
    portalGeneratedAt: payload.generatedAt,
    applied: result.applied.map(toEntry),
    unmatched: result.unmatched.map(toEntry),
    conflicts: result.conflicts,
  };
}
