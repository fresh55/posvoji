import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dataset } from "@posvoji/schema";

const datasetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "dist",
  "animals.json",
);

// Cached for the life of the process. The export runs before the build, so the
// file cannot change while pages are being rendered, and validating it once
// instead of once per page saves most of a minute on a full build. The sentinel
// is undefined so a genuine null result is cached too.
let cached: Dataset | null | undefined;

// Read at build time. The file is absent until a provider is enabled.
export function loadDataset(): Dataset | null {
  if (cached !== undefined) return cached;
  if (!existsSync(datasetPath)) {
    cached = null;
    return cached;
  }
  const parsed = Dataset.safeParse(
    JSON.parse(readFileSync(datasetPath, "utf8")),
  );
  cached = parsed.success ? parsed.data : null;
  return cached;
}
