import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Animal, Dataset } from "@posvoji/schema";
import type { ClientAnimal } from "@/lib/animal";
import { permittedPhotos } from "@/lib/animal-images";
import { displayName } from "@/lib/animal-name";

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
            (issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
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

/**
 * The same animals, with every photo resolved to the file a surface draws it
 * from and nothing else on the wire.
 *
 * The grid and its dialog are client components, so every animal handed to
 * them is serialized into the page's flight payload whether or not a card for
 * it is ever drawn. What was paid for there and never read:
 *
 * The blur placeholders. Ingest derives one per photo, the grid draws sixty
 * cards, and both the card and the dialog only ever blur the photo they open
 * on, which is the animal's first drawable one. Measured, on the mobile home
 * page: 1294 of the dataset's 1782 placeholders were never rendered, and
 * inlining them cost about 160KB of data URLs in index.html, roughly 100KB of
 * it after gzip. That is more than the responsive width ladder those same
 * photos save (~95KB of image bytes), and it showed up as about 600ms of LCP
 * and FCP on the grid. The ladder pays; shipping a placeholder for a photo
 * nobody looks at does not.
 *
 * `sourceUrl`, the shelter's own file, which is dead weight for every photo we
 * hold a cached copy of, and `rights`, which decides whether a photo may be
 * drawn at all and which file it is drawn from. That decision has no client
 * half: permittedPhotos answers it here, once, at build time, and what crosses
 * the boundary is the answer.
 *
 * A photo without a placeholder renders straight onto its frame's own
 * background, which is the path animal-photo.tsx already takes for a hotlinked
 * image that never had one.
 *
 * Source identity and first/last-seen bookkeeping remain on the server.
 * The listing URL and fetchedAt ride with the deferred descriptions, so the
 * dialog can link to the source and show when it was verified.
 *
 * `shortDescription`, the shelter's own words. One component renders it,
 * AnimalFacts, for the one animal a dialog is open on, and it is the longest
 * field an animal has. Shipping five hundred of them so that at most one is
 * read is the whole of the home page's weight problem: it alone is a third of
 * the payload. AnimalFacts fetches the text it needs when a dialog opens, so
 * the field stays optional on the type and simply goes unset here.
 *
 * Measured on the built home page, out/index.txt at 503 animals, gzip level 6:
 * 148,363 bytes down to 82,043, of which the bookkeeping is 13,420 and
 * shortDescription 53,918. Raw, 814,650 down to 576,334.
 *
 * Only for what crosses into a client component. Server-rendered surfaces read
 * loadDataset directly and resolve their own photos through permittedPhotos,
 * keeping every placeholder: the animal page carries one animal, and its
 * gallery blurs whichever photo the visitor steps to.
 */
export function animalsForClient(animals: Animal[]): ClientAnimal[] {
  return animals.map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- pulled out only to leave it behind
    ({ source, shortDescription, ...animal }) => ({
      ...animal,
      // permittedPhotos has already dropped the images no surface may draw, so
      // the first photo left is the one that leads: what a card shows and what
      // a dialog opens on.
      images: permittedPhotos(animal.images).map((photo, index) => {
        if (index === 0 || photo.blurDataURL === undefined) return photo;
        const stripped = { ...photo };
        delete stripped.blurDataURL;
        return stripped;
      }),
    }),
  );
}
