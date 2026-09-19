// Build the deferred dialog details and the legacy description-only endpoint.
// Runs before dev/build; output: export copies both files from public/generated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATASET = new URL("../../../data/dist/animals.json", import.meta.url);
const OUT =
  process.argv[2] ??
  new URL("../public/generated/animal-descriptions.json", import.meta.url);

// A checkout without a dataset exports empty maps. An invalid dataset fails the build.
let animals = [];
if (existsSync(DATASET)) {
  let data;
  try {
    data = JSON.parse(readFileSync(DATASET, "utf8"));
  } catch (cause) {
    throw new Error(
      `The dataset is not valid JSON: ${fileURLToPath(DATASET)}\n` +
        "Re-run pnpm dataset:export.",
      { cause },
    );
  }
  if (!Array.isArray(data?.animals)) {
    throw new Error(
      `The dataset has no animals array: ${fileURLToPath(DATASET)}\n` +
        "Re-run pnpm dataset:export.",
    );
  }
  animals = data.animals;
}

const details = {};
const descriptions = {};
for (const animal of animals) {
  if (typeof animal.id !== "string") continue;
  const description =
    typeof animal.shortDescription === "string" && animal.shortDescription.length > 0
      ? animal.shortDescription
      : undefined;
  if (description) descriptions[animal.id] = description;
  details[animal.id] = {
    description,
    source: {
      sourceUrl: animal.source.sourceUrl,
      fetchedAt: animal.source.fetchedAt
    },
  };
}

const json = JSON.stringify(details);
const outPath = typeof OUT === "string" ? OUT : fileURLToPath(OUT);
mkdirSync(dirname(outPath), { recursive: true });
// Keep the old endpoint for tabs opened before deployment.
writeFileSync(outPath, JSON.stringify(descriptions));
writeFileSync(join(dirname(outPath), "animal-details.json"), json);

console.log(
  `animal-details: ${Object.keys(details).length}/${animals.length} animals, ${Buffer.byteLength(json)} bytes`,
);
