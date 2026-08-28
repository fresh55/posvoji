import { existsSync, readdirSync } from "node:fs";
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

function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return readdirSync(dir).length === 0;
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
