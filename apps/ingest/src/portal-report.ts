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
  // The run's own dataset generatedAt, the same string animals.json and
  // animals.crawled.json carry, not a second clock reading. It is what ties
  // this report to the pair of datasets it describes, and scripts/deploy.sh
  // refuses to package a release where the three disagree.
  generatedAt: string;
  enabled: boolean;
  // The portal export's own timestamp, present exactly when enabled is true.
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

// generatedAt is the run's dataset timestamp, handed in by export.ts from the
// same variable both datasets are stamped with. Nothing here reads a clock.
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
