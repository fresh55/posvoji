import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./paths";

// data/shelters.yaml is the register every surface names a shelter from. A
// crawled animal gets its shelter block from its provider adapter, which has
// the shelter's own site to read the name off. A manual listing has no site,
// so the register is where its name and city come from, and this is the only
// reader of it in the pipeline.
//
// The site has the other one: loadShelters in apps/web/lib/shelters.ts reads
// the same file with the same three failure branches, and also checks for a
// duplicate id and for the contact fields this reader ignores. The strictness
// differs on purpose. There, one malformed entry throws, because a register
// that cannot be read builds a shelters index that is empty and looks
// finished; here it is dropped, so one broken row cannot stop a crawl of
// seventeen shelters that do not need it. A change to the file's shape has to
// reach both. They are not shared because apps/ingest does not depend on
// apps/web: a reader in packages/ is the real fix and needs an issue first.
export const shelterRegistryPath = join(repoRoot, "data", "shelters.yaml");

// The three fields Animal.shelter carries. The register holds more (website,
// email, phone, notes); none of them belong in the dataset.
export interface ShelterEntry {
  id: string;
  name: string;
  city: string;
}

function entryOf(value: unknown): ShelterEntry | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const { id, name, city } = raw;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof city !== "string" ||
    id.trim() === "" ||
    name.trim() === "" ||
    city.trim() === ""
  ) {
    return undefined;
  }
  return { id, name, city };
}

// Keyed by shelter id, which is also the providerId: the same string the
// override join and the shelter.id check in export.ts already depend on.
//
// A file that is missing or will not parse throws: it is repository content,
// every shelter page is built from it, and a manual listing cannot be built
// without it. An individual entry that lacks one of the three fields is left
// out rather than throwing, and a listing whose shelter is not indexed is
// reported as skipped by portal-listings.ts. That keeps one malformed entry
// from stopping a crawl of seventeen shelters that do not need it.
export function loadShelters(
  path: string = shelterRegistryPath,
): Map<string, ShelterEntry> {
  if (!existsSync(path)) {
    throw new Error(
      `the shelter register is missing: ${path}. Manual listings take their ` +
        `shelter name and city from it.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`the shelter register will not parse: ${path}`, {
      cause: error,
    });
  }

  const raw =
    parsed && typeof parsed === "object"
      ? (parsed as { shelters?: unknown }).shelters
      : undefined;
  if (!Array.isArray(raw)) {
    throw new Error(
      `the shelter register has no shelters list: ${path}. Expected a ` +
        `top-level shelters: holding a sequence of entries.`,
    );
  }

  const byId = new Map<string, ShelterEntry>();
  for (const value of raw) {
    const entry = entryOf(value);
    if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return byId;
}
