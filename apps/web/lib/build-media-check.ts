import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

const animalsMediaDir = join(
  repoRoot,
  "apps",
  "web",
  "public",
  "media",
  "animals",
);
const shareCardManifestPath = join(repoRoot, "data", "dist", "share-cards.json");
const shelterLogoManifestPath = join(
  repoRoot,
  "data",
  "dist",
  "shelter-logos.json",
);
const shelterLogosDir = join(
  repoRoot,
  "apps",
  "web",
  "public",
  "media",
  "shelter-logos",
);

function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return readdirSync(dir).length === 0;
}

/** Logos the manifest names that are not on disk.
 *
 *  Having the manifest is not the same as having what it points at. Logo files
 *  are content-addressed, so a mark whose bytes change is written under a new
 *  name and the old one is swept: a build that reads a manifest from either
 *  side of that sync ships pages referencing files it does not have, which
 *  reaches a reader as a broken image and nothing else. Cheap to check, since
 *  it is one stat per shelter against a build that prerenders a thousand
 *  pages. */
function missingLogoFiles(manifestPath: string, logosDir: string): string[] {
  let entries: Record<string, { file?: unknown }>;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!parsed?.entries || typeof parsed.entries !== "object") return [];
    entries = parsed.entries;
  } catch {
    // An unreadable manifest is the reader's problem to report, not this
    // one's: lib/shelter-logos.ts already says so and falls back to initials.
    return [];
  }

  const missing: string[] = [];
  for (const [id, entry] of Object.entries(entries)) {
    const file = entry?.file;
    if (typeof file !== "string") continue;
    if (!existsSync(join(logosDir, file))) missing.push(`${id} (${file})`);
  }
  return missing;
}

/**
 * What a build without `pnpm dataset:export` looks like: no cached photos,
 * no share-card or logo manifest. Neither one fails the build, so this is the
 * only thing that says so out loud. Pure and side-effect free, so it is
 * cheap to test against a temp directory instead of the real repo tree.
 */
export function buildMediaWarnings(paths?: {
  animalsMediaDir?: string;
  shareCardManifestPath?: string;
  shelterLogoManifestPath?: string;
  shelterLogosDir?: string;
}): string[] {
  const warnings: string[] = [];

  if (isEmptyDir(paths?.animalsMediaDir ?? animalsMediaDir)) {
    warnings.push(
      "[build] public/media/animals is missing or empty: this site will " +
        "ship with no animal photos. Expected in CI, which never runs the " +
        "export; must not happen in a production build. Run " +
        "`pnpm dataset:export` (or `pnpm images:derive` after a schema-only " +
        "change) before building.",
    );
  }

  const shareManifest = paths?.shareCardManifestPath ?? shareCardManifestPath;
  const logoManifest = paths?.shelterLogoManifestPath ?? shelterLogoManifestPath;
  if (!existsSync(shareManifest) || !existsSync(logoManifest)) {
    warnings.push(
      "[build] data/dist/share-cards.json or shelter-logos.json is " +
        "missing: link-preview cards and/or shelter logos will be absent. " +
        "Expected in CI, which never runs the export; must not happen in a " +
        "production build. Run `pnpm dataset:export` before building.",
    );
  } else {
    // Only worth asking once the manifest is there at all: with no manifest
    // the warning above already covers it, and there is nothing to name.
    const missing = missingLogoFiles(
      logoManifest,
      paths?.shelterLogosDir ?? shelterLogosDir,
    );
    if (missing.length > 0) {
      warnings.push(
        `[build] shelter-logos.json names ${missing.length} file(s) that are ` +
          `not in public/media/shelter-logos: ${missing.join(", ")}. Those ` +
          "shelters will ship a broken image rather than fall back to a " +
          "letter. The manifest and the files came from different runs; " +
          "re-run `pnpm --filter @posvoji/ingest fetch:logos` before building.",
      );
    }
  }

  return warnings;
}

// A single `next build` loads next.config.ts more than once: the CLI reads
// it up front, then Turbopack loads it again in the process it spawns to do
// the actual build. Both re-executions are child processes of the first, so
// an env var set on the first pass is already there on the rest, unlike a
// globalThis flag, which lives inside one process only and would let the
// warning through again in each fresh one. That is what keeps it to one line
// per build instead of one per process.
const DEDUPE_ENV_VAR = "POSVOJI_BUILD_MEDIA_WARNED";

/** Logs each warning from {@link buildMediaWarnings} at most once per build. */
export function warnAboutMissingMedia(): void {
  if (process.env[DEDUPE_ENV_VAR]) return;
  process.env[DEDUPE_ENV_VAR] = "1";
  for (const warning of buildMediaWarnings()) {
    console.warn(warning);
  }
}
