import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const repoRoot = join(here, "..", "..", "..");
export const providersDir = join(repoRoot, "providers");
export const datasetDir = join(repoRoot, "data", "dist");
