import type { MetadataRoute } from "next";
import { animalPath } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { loadMunicipalities } from "@/lib/municipalities";
import { municipalityPath } from "@/lib/municipality-path";
import { indexPagePath, type IndexPage } from "@/lib/page-share";
import { shelterPath } from "@/lib/shelter-path";
import { loadShelters } from "@/lib/shelters";
import { SITE_URL } from "@/lib/site";

// Every address the static export writes, in one file a crawler can read
// instead of walking the site to find 500 animals behind a filter UI.
//
// This runs at build time like every other page here, off the same three
// registries: the exported dataset, data/shelters.yaml and
// data/municipalities.yaml. Nothing in it needs a request, so `output:
// "export"` writes it out as /sitemap.xml alongside the pages.
//
// A checkout with no exported dataset still gets a sitemap: the static pages
// and the shelter and municipality registries are checked into the repo, and
// only the animal entries and the lastmod fallback come from data/dist.

// sitemap.xml is a Route Handler, and `output: "export"` refuses to build one
// that has not said it is static. Everything below is read off the disk at
// build time, so saying so costs nothing; app/robots.ts says the same.
export const dynamic = "force-static";

const INDEX_PAGES: IndexPage[] = ["home", "shelters", "resources", "foundAnimal"];

function absolute(path: string): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

/** One route in both languages, each entry naming the other as its
 *  alternate. Same pairing the pages' own metadata declares; a sitemap that
 *  repeats it is how a crawler learns the pairing without fetching both. */
function pair(
  slPath: string,
  enPath: string,
  lastModified: Date | undefined,
): MetadataRoute.Sitemap {
  const languages = { sl: absolute(slPath), en: absolute(enPath) };
  return [
    { url: absolute(slPath), lastModified, alternates: { languages } },
    { url: absolute(enPath), lastModified, alternates: { languages } },
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const dataset = loadDataset();
  // What the dataset says about itself, for everything whose freshness is the
  // export's freshness rather than one listing's. Undefined without an export,
  // and an entry with no lastmod is a valid entry.
  const generatedAt = dataset ? new Date(dataset.generatedAt) : undefined;

  const indexes = INDEX_PAGES.flatMap((page) =>
    pair(indexPagePath(page, "sl"), indexPagePath(page, "en"), generatedAt),
  );

  const shelters = loadShelters().flatMap((shelter) =>
    pair(shelterPath(shelter.id, "sl"), shelterPath(shelter.id, "en"), generatedAt),
  );

  // lastSeenAt is the day the shelter last showed this animal on its own site,
  // which is the only date on the page that is about the animal rather than
  // about our build.
  const animals = (dataset?.animals ?? []).flatMap((animal) =>
    pair(
      animalPath(animal, "sl"),
      animalPath(animal, "en"),
      new Date(animal.source.lastSeenAt),
    ),
  );

  // Slovenian only, like the pages themselves. See lib/municipality-path.ts.
  const municipalities = loadMunicipalities().municipalities.map(
    (municipality) => ({
      url: absolute(municipalityPath(municipality.name)),
      lastModified: generatedAt,
    }),
  );

  return [...indexes, ...shelters, ...animals, ...municipalities];
}
