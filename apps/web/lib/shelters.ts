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

/**
 * A website the register may hand to an anchor.
 *
 * http and https only. The value goes into an href unescaped, so this is not
 * about tidiness: a javascript: or data: URL typed into the registry would be
 * a link on seventeen cards that runs rather than navigates, and the three
 * required fields were the only ones anything checked.
 */
function websiteProblem(value: unknown): string | undefined {
  if (typeof value !== "string") return "website is not a string";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `website is not a URL: ${value}`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `website is not http or https: ${value}`;
  }
  return undefined;
}

// An address with nothing in it that changes what a mailto: means. The comma,
// the semicolon and the question mark each turn one recipient into a list or
// a header, and whitespace and angle brackets do the same by another route.
const EMAIL = /^[^\s<>()[\]\\,;:@"]+@[^\s<>()[\]\\,;:@"]+\.[a-z]{2,}$/i;

function emailProblem(value: unknown): string | undefined {
  if (typeof value !== "string" || !EMAIL.test(value)) {
    return `email is not an address: ${String(value)}`;
  }
  return undefined;
}

// The characters a phone number is written with in the register, which spells
// them the way they are read aloud ("03 749 06 00"). telHref strips the
// spaces; anything outside this set would survive into the dialled string.
const PHONE = /^[0-9 ()+/-]+$/;

function phoneProblem(value: unknown): string | undefined {
  if (typeof value !== "string" || !PHONE.test(value)) {
    return `phone has characters a dialler cannot take: ${String(value)}`;
  }
  return undefined;
}

/** The fields an entry may carry beyond the three it must, each with what
 *  makes it usable. A table rather than three hand-written blocks: all three
 *  ask the same two questions, and a fourth field added later should not have
 *  to remember which shape the last one used. */
const OPTIONAL_FIELDS = [
  ["website", websiteProblem],
  ["email", emailProblem],
  ["phone", phoneProblem],
] as const;

/**
 * Everything wrong with one entry, as sentences a person can act on.
 *
 * A list rather than a boolean, and returned rather than thrown, so a bad
 * file is reported once with every fault in it instead of once per fix.
 */
function entryProblems(value: unknown, index: number): string[] {
  const at = `shelters[${index}]`;
  if (!value || typeof value !== "object") return [`${at} is not a mapping`];

  const entry = value as Record<string, unknown>;
  const problems: string[] = [];

  for (const field of ["id", "name", "city"] as const) {
    const held = entry[field];
    if (typeof held !== "string" || held.trim().length === 0) {
      problems.push(`${at} has no ${field}`);
    }
  }

  // Named by id once there is one to name it by: "shelter zonzani" is what a
  // reader greps data/shelters.yaml for. The index is only useful for an
  // entry so broken it has no id to be found by.
  const named =
    typeof entry.id === "string" && entry.id.trim().length > 0
      ? `shelter ${entry.id}`
      : at;

  // Absent is fine for all three: the register holds shelters we have a phone
  // for and no email, and the card prints what is there.
  for (const [field, problemWith] of OPTIONAL_FIELDS) {
    if (entry[field] === undefined) continue;
    const problem = problemWith(entry[field]);
    if (problem) problems.push(`${named}: ${problem}`);
  }

  return problems;
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
// a full schema.
//
// It throws rather than filters. Every earlier version of this dropped what
// it could not read and returned the rest, which meant a missing file, a YAML
// syntax error or one mistyped field rendered a shelters index that was
// structurally perfect and empty: breadcrumb, h1, lede, invite card and
// provenance line, no shelters, no census, and a build that passed. The page
// never prints a zero, so there was nothing left on it to say anything was
// wrong. A register that cannot be read is a broken build, and this is where
// that is decided, once, for every surface that reads it.
//
// Cached like the dataset: the registry is checked into the repo and cannot
// change while pages are being rendered.
let cached: Registry | undefined;

function loadRegistry(): Registry {
  if (cached !== undefined) return cached;

  if (!existsSync(registryPath)) {
    throw new Error(
      `The shelter registry is missing: ${registryPath}\n` +
        "It is checked into the repo and every shelter page is built from it.",
    );
  }

  let parsed: ShelterRegistryFile | undefined;
  try {
    parsed = parse(readFileSync(registryPath, "utf8")) as
      | ShelterRegistryFile
      | undefined;
  } catch (cause) {
    throw new Error(`The shelter registry will not parse: ${registryPath}`, {
      cause,
    });
  }

  const raw = parsed?.shelters;
  if (!Array.isArray(raw)) {
    throw new Error(
      `The shelter registry has no shelters list: ${registryPath}\n` +
        "Expected a top-level shelters: holding a sequence of entries.",
    );
  }

  const problems = raw.flatMap(entryProblems);

  // Two entries claiming one id is a fault of neither on its own, so it is
  // counted here rather than in entryProblems. One of them would win every
  // lookup and the other would quietly lose its detail page.
  const seen = new Set<string>();
  for (const value of raw) {
    const id = (value as Record<string, unknown> | null)?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) problems.push(`shelter ${id}: id is used twice`);
    seen.add(id);
  }

  if (problems.length > 0) {
    const count = problems.length;
    throw new Error(
      `The shelter registry has ${count} unusable ${
        count === 1 ? "entry" : "entries"
      }: ${registryPath}\n` +
        problems.map((problem) => `  ${problem}`).join("\n") +
        "\nEntries are not dropped. Fix the file or remove them.",
    );
  }

  if (raw.length === 0) {
    throw new Error(
      `The shelter registry is empty: ${registryPath}\n` +
        "An empty register builds a shelters index with nothing on it.",
    );
  }

  cached = {
    shelters: raw as ShelterRegistryEntry[],
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

export function getShelterBySlug(
  slug: string,
): ShelterRegistryEntry | undefined {
  return loadShelters().find((shelter) => shelter.id === slug);
}
