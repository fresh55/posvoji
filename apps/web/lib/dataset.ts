import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Animal, Dataset } from "@posvoji/schema";
import { listedAtOf, type ClientAnimal } from "@/lib/animal";
import { permittedPhotos } from "@/lib/animal-images";
import { displayName } from "@/lib/animal-name";
import { INITIAL_CARDS } from "@/components/grid-rendering";
import { sortAnimals } from "@/lib/sort";
import { galleryPayload } from "@/lib/client-payload";

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

// The refusal is cached the same as the answer. loadDataset is called once
// per rendered page and the export prerenders about a thousand of them, so a
// file that will not parse would otherwise be read, parsed and validated a
// thousand times over on the way to the same error. Before this function
// learned to refuse, the failure was cached as null and cost one read.
let refusal: Error | undefined;

// Read at build time. The file is absent until a provider is enabled.
//
// Absent and unreadable are not the same answer, and this used to give both
// of them as null. Absent is the ordinary state of a checkout that has not
// run an ingest yet, and every surface is written to handle it: the grid is
// empty, the census prints no animal count, the shelters index draws the
// register alone. Unreadable is a data/dist that cannot be believed, which
// looks exactly the same on the page and is not the same thing at all. So:
// missing stays null, and a file that is there but will not parse or will not
// validate stops the build with what is wrong with it.
//
// What comes back is the file with one thing settled: a name a shelter typed
// in block capitals is handed on in the case a page prints it (asDisplayed
// below). Here because this is the one door every surface reads the dataset
// through, and a dozen of them print a name.
//
// What that guards against is not a torn write. apps/ingest validates with
// Dataset.parse before writing and writes through writeFileAtomic, which
// renames a complete temporary file over the target, so a reader sees one
// whole version or the other. It is the two sides drifting: the crawl and the
// site build are separate scheduled jobs, so the dataset on disk was written
// by whichever @posvoji/schema the ingest run held, and this build is reading
// it with whichever one apps/web holds now. A hand-edited or partly restored
// data/dist lands here too.
export function loadDataset(): Dataset | null {
  if (refusal) throw refusal;
  if (cached !== undefined) return cached;
  if (!existsSync(datasetPath)) {
    cached = null;
    return cached;
  }

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(datasetPath, "utf8"));
  } catch (cause) {
    refusal = new Error(
      `The dataset is not valid JSON: ${datasetPath}\n` +
        "Re-run pnpm dataset:export.",
      { cause },
    );
    throw refusal;
  }

  const parsed = Dataset.safeParse(json);
  if (!parsed.success) {
    refusal = new Error(
      `The dataset does not match the schema apps/web was built against: ${datasetPath}\n` +
        parsed.error.issues
          .slice(0, 10)
          .map(
            (issue) =>
              `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          )
          .join("\n") +
        (parsed.error.issues.length > 10
          ? `\n  and ${parsed.error.issues.length - 10} more`
          : "") +
        "\nRe-run pnpm dataset:export against this checkout.",
    );
    throw refusal;
  }

  cached = { ...parsed.data, animals: parsed.data.animals.map(asDisplayed) };
  return cached;
}

/**
 * The one place the dataset's own spelling of a name is turned into the one
 * every surface prints (displayName in lib/animal-name.ts).
 *
 * Here and not at a card, a heading or a share text, because the site has a
 * dozen places that print a name and they would have to agree. The dataset on
 * disk is untouched, and so is anything derived from a name rather than read
 * off it: slugs lower-case before they build a path, so an address written
 * against the shelter's spelling still resolves. The animal is only copied
 * where its name actually changes, which is 29 of 486.
 */
function asDisplayed(animal: Animal): Animal {
  if (animal.name === undefined) return animal;
  const name = displayName(animal.name);
  return name === animal.name ? animal : { ...animal, name };
}

/**
 * Every animal the dataset holds for one shelter.
 *
 * The shelter's own page asks this to draw its list, and both locales' routes
 * ask it again to decide whether the page's description may promise animals.
 * Written once here rather than three times as a filter over
 * `loadDataset()?.animals`, so the head and the body of a shelter page cannot
 * come to different answers about the same shelter. loadDataset caches, so the
 * repeat costs a walk of the array and no second read.
 */
export function shelterAnimals(shelterId: string): Animal[] {
  return (loadDataset()?.animals ?? []).filter(
    (animal) => animal.shelter.id === shelterId,
  );
}

/** Client projection: permitted photos, with descriptions and source details deferred.
 * Blur is kept only for the first photo of each initially rendered card.
 * Grids can defer the remaining photos to a generated gallery payload;
 * standalone animal pages resolve their full gallery on the server.
 *
 * Of the source block only its first-seen time crosses, as listedAt: the grid
 * orders by it (Nove objave) and marks what is new since a visitor's last
 * visit, and both happen on the client with no request to make first.
 */
export function animalsForClient(
  animals: Animal[],
  { deferPhotos = false }: { deferPhotos?: boolean } = {},
): ClientAnimal[] {
  // Select placeholders by display order without reordering the input.
  const initiallyDrawn = new Set(
    sortAnimals(animals)
      .slice(0, INITIAL_CARDS)
      .map((animal) => animal.id),
  );
  const projected = animals.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
    ({ source, shortDescription, ...animal }) => ({
      ...animal,
      // Spread rather than assigned, so an unparsable time ships no key at
      // all: React writes an undefined value as "$undefined".
      ...listedAtEntry(source.firstSeenAt),
      images: permittedPhotos(animal.images).map((photo, index) => {
        if (
          (index === 0 && initiallyDrawn.has(animal.id)) ||
          photo.blurDataURL === undefined
        )
          return photo;
        const stripped = { ...photo };
        delete stripped.blurDataURL;
        return stripped;
      }),
    }),
  );
  if (!deferPhotos) return projected;
  return projected.map((animal, index) => {
    if (animal.images.length < 2) return animal;
    const { url, count } = galleryPayload(animals[index]);
    return {
      ...animal,
      images: animal.images.slice(0, 1),
      gallery: { url, count },
    };
  });
}

function listedAtEntry(firstSeenAt: string): { listedAt?: number } {
  const listedAt = listedAtOf(firstSeenAt);
  return listedAt === undefined ? {} : { listedAt };
}
