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
  "shelters.yaml",
);

export type ShelterRegistryEntry = {
  id: string;
  name: string;
  city: string;
  website?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

type ShelterRegistryFile = {
  shelters?: unknown;
};

function isShelterEntry(value: unknown): value is ShelterRegistryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    typeof entry.city === "string" &&
    entry.city.length > 0
  );
}

// Read at build time, same as loadDataset. data/shelters.yaml is reference
// data checked into the repo, not user input, so a shape check stands in for
// a full schema: entries missing the required fields are dropped rather than
// guessed at.
// Cached like the dataset: the registry is checked into the repo and cannot
// change while pages are being rendered.
let cached: ShelterRegistryEntry[] | undefined;

export function loadShelters(): ShelterRegistryEntry[] {
  if (cached !== undefined) return cached;
  if (!existsSync(registryPath)) {
    cached = [];
    return cached;
  }
  const parsed = parse(readFileSync(registryPath, "utf8")) as
    | ShelterRegistryFile
    | undefined;
  const shelters = parsed?.shelters;
  cached = Array.isArray(shelters) ? shelters.filter(isShelterEntry) : [];
  return cached;
}

export function getShelterBySlug(slug: string): ShelterRegistryEntry | undefined {
  return loadShelters().find((shelter) => shelter.id === slug);
}
