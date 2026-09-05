// Derives the image variants on their own, without a crawl. The export run
// does this too; this entry point exists so a maintainer can backfill rungs,
// placeholders and hero avif over photos that are already cached, without
// re-crawling every animal.
//
// Nothing here touches the network. It first validates the committed snapshot,
// then reads the dataset and image manifest, cuts what is missing from our own
// cached files and writes both back under a replacement receipt.
import { existsSync, readFileSync } from "node:fs";
import { Dataset } from "@posvoji/schema";
import { holdArtifactLock } from "./artifact-lock";
import {
  deriveVariants,
  heroSourceUrls,
  readImageCacheManifest,
  withCachedUrls,
} from "./cache-images";
import {
  assertRepairableGeneration,
  writeGenerationReceipt,
} from "./generation-receipt";
import {
  cachedImagesDir,
  datasetDir,
  datasetPath,
  imageCacheManifestPath,
} from "./paths";
import { writeFileAtomic } from "./write-atomic";

holdArtifactLock("derive-images");

// Missing derivatives are the one invalid state this job can prove it owns
// and recreate from receipt-verified masters. Changed/empty derivatives,
// master photos and every unrelated byte remain fail-closed.
assertRepairableGeneration("image-derivatives");

// Only the published dataset. animals.crawled.json deliberately carries no
// cached image fields: they are stripped again the moment a record is reused.
if (!existsSync(datasetPath)) {
  throw new Error(`no dataset at ${datasetPath}; run the export first`);
}
const dataset = Dataset.parse(JSON.parse(readFileSync(datasetPath, "utf8")));

const manifest = readImageCacheManifest(imageCacheManifestPath);
const cached = Object.keys(manifest.entries).length;
if (cached === 0) {
  console.warn(`images: no cached copies in ${imageCacheManifestPath}`);
}

const derived = await deriveVariants(
  manifest,
  heroSourceUrls(dataset.animals),
  cachedImagesDir,
);
writeFileAtomic(imageCacheManifestPath, JSON.stringify(manifest, null, 2));

// Only the images change, so everything else in the dataset is carried over
// as it stands. generatedAt records when the data was fetched, and this run
// fetched nothing, so it keeps the time of the export that did.
const animals = withCachedUrls(dataset.animals, manifest);
writeFileAtomic(
  datasetPath,
  JSON.stringify(Dataset.parse({ ...dataset, animals }), null, 2),
);
const generationId = writeGenerationReceipt();

console.log(
  `image variants: ${derived.thumbs} thumbs, ${derived.rungs} rungs, ` +
    `${derived.blurs} placeholders, ${derived.avifs} avif derived`,
);
console.log(
  `derived over ${cached} cached images, rewrote ${animals.length} animals ` +
    `in ${datasetDir} (generatedAt ${dataset.generatedAt} unchanged, ` +
    `generation ${generationId})`,
);
