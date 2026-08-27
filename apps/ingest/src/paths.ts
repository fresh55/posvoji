import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = join(here, "..", "..", "..");
export const providersDir = join(repoRoot, "providers");
export const datasetDir = join(repoRoot, "data", "dist");

// Durable across runs, unlike everything in datasetDir: that directory is
// regenerated wholesale on every export and is gitignored for it, so a file
// meant to accumulate history can never live there. This one is committed.
export const historyLedgerPath = join(repoRoot, "data", "history.jsonl");

// Cached shelter photos land inside the web app's public dir (gitignored:
// shelter content is not repository content) so both `next dev` and the
// static export serve them without a copy step.
export const cachedImagesDir = join(
  repoRoot,
  "apps",
  "web",
  "public",
  "media",
  "animals",
);
export const imageCacheManifestPath = join(datasetDir, "image-cache.json");

// Audit trail for the shelter corrections merged into the dataset. A
// sidecar rather than a field on Animal: the dataset is what the site
// reads, and this is what a maintainer reads.
export const overrideReportPath = join(datasetDir, "overrides.json");

// Shelter logos live beside the cached photos for the same reason: a logo is
// the shelter's mark, not repository content, so it is fetched rather than
// committed.
export const shelterLogosDir = join(
  repoRoot,
  "apps",
  "web",
  "public",
  "media",
  "shelter-logos",
);
export const shelterLogoManifestPath = join(datasetDir, "shelter-logos.json");

// Share cards live beside the cached photos: same public dir, same
// gitignore, same "shelter content is not repository content" rule.
export const shareCardsDir = join(
  repoRoot,
  "apps",
  "web",
  "public",
  "media",
  "share",
);
export const shareCardManifestPath = join(datasetDir, "share-cards.json");

// Inter is vendored rather than taken from the system: sharp resolves fonts
// through fontconfig, and a CI runner has no reason to have Inter installed.
export const fontsDir = join(here, "..", "assets", "fonts");
