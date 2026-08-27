import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const registryPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "municipalities.yaml",
);

export type CoverageSpecies = "dogs" | "cats";

export type CoverageEntry = {
  shelter: string;
  species?: CoverageSpecies;
  source: string;
};

export type MunicipalityEntry = {
  name: string;
  coverage: CoverageEntry[];
};

export type CoverageSource = {
  label: string;
  url?: string;
  date: string;
  confirmed: boolean;
};

export type MunicipalityRegistry = {
  municipalities: MunicipalityEntry[];
  sources: Record<string, CoverageSource>;
};

type MunicipalityRegistryFile = {
  sources?: unknown;
  municipalities?: unknown;
};

function isCoverageEntry(value: unknown): value is CoverageEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.shelter === "string" &&
    entry.shelter.length > 0 &&
    typeof entry.source === "string" &&
    entry.source.length > 0 &&
    (entry.species === undefined ||
      entry.species === "dogs" ||
      entry.species === "cats")
  );
}

function isMunicipalityEntry(value: unknown): value is MunicipalityEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    Array.isArray(entry.coverage) &&
    entry.coverage.every(isCoverageEntry)
  );
}

function isCoverageSource(value: unknown): value is CoverageSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (
    typeof source.label === "string" &&
    typeof source.date === "string" &&
    typeof source.confirmed === "boolean" &&
    (source.url === undefined || typeof source.url === "string")
  );
}

// Cached for the life of the process, the same reason loadDataset and
// loadShelters are: the file cannot change while pages are being rendered,
// and the 212 municipality pages plus the sitemap ask for it five times over
// a full build.
let cached: MunicipalityRegistry | undefined;

// Read at build time, same as loadShelters. data/municipalities.yaml is
// reference data checked into the repo, so a shape check stands in for a
// full schema: malformed entries are dropped rather than guessed at.
export function loadMunicipalities(): MunicipalityRegistry {
  if (cached !== undefined) return cached;
  if (!existsSync(registryPath)) {
    cached = { municipalities: [], sources: {} };
    return cached;
  }
  const parsed = parse(readFileSync(registryPath, "utf8")) as
    | MunicipalityRegistryFile
    | undefined;

  const municipalities = Array.isArray(parsed?.municipalities)
    ? parsed.municipalities.filter(isMunicipalityEntry)
    : [];

  const sources: Record<string, CoverageSource> = {};
  if (parsed?.sources && typeof parsed.sources === "object") {
    for (const [id, source] of Object.entries(parsed.sources)) {
      if (isCoverageSource(source)) sources[id] = source;
    }
  }

  cached = { municipalities, sources };
  return cached;
}
