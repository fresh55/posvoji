// Writes public/generated/animal-descriptions.json: the shelter's own text for
// every animal that has one, keyed by animal id.
//
// The home page hands the grid every animal it can draw, and the grid is a
// client component, so every field on those animals is serialized into the
// page's flight payload. `shortDescription` was 53,673 of the home page's
// 148,363 gzipped bytes, 36% of the whole thing, so that a dialog could print
// one description for the one animal a visitor opens, if they open one at all.
// So the field stops crossing that boundary (animalsForClient in
// lib/dataset.ts) and the text lives here instead, fetched once and lazily by
// the dialog that needs it. See lib/animal-descriptions.ts.
//
// Runs before `next build` and before `next dev`. `output: export` copies
// public/ into out/, so the file is served at /generated/animal-descriptions
// .json with no route handler. It is build output like public/media/, derived
// from data/dist and not committed.
//
// Rebuild with: pnpm --filter web generate:animal-descriptions
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATASET = new URL("../../../data/dist/animals.json", import.meta.url);
const OUT =
  process.argv[2] ??
  new URL("../public/generated/animal-descriptions.json", import.meta.url);

// Absent and unreadable are not the same answer, which is the distinction
// loadDataset draws in lib/dataset.ts. Absent is the ordinary state of a
// checkout that has not run an ingest yet: the grid is empty, no dialog opens,
// and an empty map is written all the same so a stray fetch reads `{}` rather
// than the 404 page. A dataset that is there and will not parse stops the run
// instead of quietly shipping a site with no descriptions in it.
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

// Only what the dialog would print. An animal with no description is absent
// from the map, and the dialog renders nothing for it, which is what it does
// today for an animal whose description never arrived in the payload.
const descriptions = {};
for (const animal of animals) {
  if (typeof animal.id !== "string") continue;
  if (typeof animal.shortDescription !== "string") continue;
  if (animal.shortDescription.length === 0) continue;
  descriptions[animal.id] = animal.shortDescription;
}

const json = JSON.stringify(descriptions);
const outPath = typeof OUT === "string" ? OUT : fileURLToPath(OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, json);

console.log(
  `animal-descriptions: ${Object.keys(descriptions).length}/${animals.length} animals, ${json.length} bytes`,
);
