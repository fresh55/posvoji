import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Animal, Dataset } from "@posvoji/schema";
import { isDrawableImage } from "@/lib/animal-images";

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

/**
 * The same animals, with the blur placeholders no client surface will draw
 * taken off them.
 *
 * The grid and its dialog are client components, so every animal handed to
 * them is serialized into the page's flight payload whether or not a card for
 * it is ever drawn. The placeholders are the expensive part of that: ingest
 * derives one per photo, the grid draws sixty cards, and both the card and the
 * dialog only ever blur the photo they open on, which is the animal's first
 * drawable one.
 *
 * Measured, on the mobile home page: 1294 of the dataset's 1782 placeholders
 * were never rendered, and inlining them cost about 160KB of data URLs in
 * index.html, roughly 100KB of it after gzip. That is more than the responsive
 * width ladder those same photos save (~95KB of image bytes), and it showed up
 * as about 600ms of LCP and FCP on the grid. The ladder pays; shipping a
 * placeholder for a photo nobody looks at does not.
 *
 * A photo without a placeholder renders straight onto its frame's own
 * background, which is the path animal-photo.tsx already takes for a hotlinked
 * image that never had one.
 *
 * Only for what crosses into a client component. Server-rendered surfaces read
 * loadDataset directly and keep every field: the animal page carries one
 * animal, and its gallery blurs whichever photo the visitor steps to.
 */
export function animalsForClient(animals: Animal[]): Animal[] {
  return animals.map((animal) => {
    let lead = false;
    return {
      ...animal,
      images: animal.images.map((image) => {
        // The first drawable image, not images[0]: an image the shelter gave
        // no display right to is dropped before a surface sees it, so the one
        // after it is what leads. See isDrawableImage in animal-images.ts.
        if (!lead && isDrawableImage(image)) {
          lead = true;
          return image;
        }
        if (image.blurDataURL === undefined) return image;
        const stripped = { ...image };
        delete stripped.blurDataURL;
        return stripped;
      }),
    };
  });
}
