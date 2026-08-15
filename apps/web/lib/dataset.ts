import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dataset, type Animal } from "@posvoji/schema";

const datasetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "dist",
  "animals.json",
);

/**
 * Read the exported dataset at build time. Until the first shelter grants
 * permission the file is simply absent, and the site renders its empty state.
 */
export function loadAnimals(): Animal[] {
  if (!existsSync(datasetPath)) return [];
  const parsed = Dataset.safeParse(
    JSON.parse(readFileSync(datasetPath, "utf8")),
  );
  return parsed.success ? parsed.data.animals : [];
}
