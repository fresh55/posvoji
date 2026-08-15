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

// Read at build time. The file is absent until a provider is enabled, so
// generatedAt stays undefined until there is real data to date.
export function loadDataset(): { animals: Animal[]; generatedAt?: string } {
  if (!existsSync(datasetPath)) return { animals: [] };
  const parsed = Dataset.safeParse(
    JSON.parse(readFileSync(datasetPath, "utf8")),
  );
  if (!parsed.success) return { animals: [] };
  return {
    animals: parsed.data.animals,
    generatedAt: parsed.data.generatedAt,
  };
}
