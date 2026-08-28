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
  meta?: unknown;
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

// The date the UVHVVR register the file was transcribed from was published,
// as an ISO date string. yaml's core schema leaves an unquoted date as a
// string; a Date is accepted too, so a schema change upstream cannot silently
// blank the line that prints this.
function registerDateOf(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const value = (meta as Record<string, unknown>).register_date;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return undefined;
}

type Registry = {
  shelters: ShelterRegistryEntry[];
  registerDate: string | undefined;
};

// Read at build time, same as loadDataset. data/shelters.yaml is reference
// data checked into the repo, not user input, so a shape check stands in for
// a full schema: entries missing the required fields are dropped rather than
// guessed at.
// Cached like the dataset: the registry is checked into the repo and cannot
// change while pages are being rendered.
let cached: Registry | undefined;

function loadRegistry(): Registry {
  if (cached !== undefined) return cached;
  if (!existsSync(registryPath)) {
    cached = { shelters: [], registerDate: undefined };
    return cached;
  }
  const parsed = parse(readFileSync(registryPath, "utf8")) as
    | ShelterRegistryFile
    | undefined;
  const shelters = parsed?.shelters;
  cached = {
    shelters: Array.isArray(shelters) ? shelters.filter(isShelterEntry) : [],
    registerDate: registerDateOf(parsed?.meta),
  };
  return cached;
}

export function loadShelters(): ShelterRegistryEntry[] {
  return loadRegistry().shelters;
}

/** When the register this file was transcribed from was published, for the
 *  provenance line under the shelters index. */
export function shelterRegisterDate(): string | undefined {
  return loadRegistry().registerDate;
}

export function getShelterBySlug(slug: string): ShelterRegistryEntry | undefined {
  return loadShelters().find((shelter) => shelter.id === slug);
}
