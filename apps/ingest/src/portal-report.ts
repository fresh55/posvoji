import type { PortalExportPayload, PortalOverride } from "./portal-contract";
import type { ApplyOverridesResult, OverrideConflict } from "./portal-merge";
import type { ListingApplied, ListingSkip } from "./portal-listings";

export interface OverrideReportEntry {
  providerId: string;
  animalId: string;
  fields: string[];
  recordedAt?: string;
}

// The manual shelters' half of the same audit trail. A correction changes a
// field on a crawled animal and a listing is the animal, so the two are
// counted separately rather than merged into one applied list.
export interface ListingsReport {
  // A listings payload reached this run. False when the portal is not
  // configured, when it answered 404 because it has no listings route yet,
  // and when the fetch failed.
  enabled: boolean;
  // The fetch was attempted and threw. Every enabled manual provider then
  // carried its previous animals forward and the run exits 2, the same as a
  // provider whose crawl failed.
  failed: boolean;
  // The listings feed's own timestamp, present exactly when enabled is true.
  portalGeneratedAt?: string;
  applied: ListingApplied[];
  skipped: ListingSkip[];
}

const NO_LISTINGS: ListingsReport = {
  enabled: false,
  failed: false,
  applied: [],
  skipped: [],
};

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
  listings: ListingsReport;
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
//
// listings is the manual shelters' half. It defaults to the disabled report
// so a caller that has no listings feed to describe, and every test that
// predates one, keeps working.
export function buildOverrideReport(
  generatedAt: string,
  payload: PortalExportPayload | null,
  result: ApplyOverridesResult | null,
  listings: ListingsReport = NO_LISTINGS,
): OverrideReport {
  if (!payload || !result) {
    return {
      generatedAt,
      enabled: false,
      applied: [],
      unmatched: [],
      conflicts: [],
      listings,
    };
  }

  return {
    generatedAt,
    enabled: true,
    portalGeneratedAt: payload.generatedAt,
    applied: result.applied.map(toEntry),
    unmatched: result.unmatched.map(toEntry),
    conflicts: result.conflicts,
    listings,
  };
}
