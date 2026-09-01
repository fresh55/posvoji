import type { MetadataRoute } from "next";
import { animalPath } from "@/lib/animal-path";
import { loadDataset } from "@/lib/dataset";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale } from "@/lib/i18n";
import { homePath, sheltersIndexPath, shelterPath } from "@/lib/shelter-path";
import { loadShelters } from "@/lib/shelters";
import { SITE_URL } from "@/lib/site";
import { RESOURCES_PATHS } from "@/lib/site-links";

/**
 * Every public page, in both languages, with each one naming the other.
 *
 * The site had no sitemap and no robots.txt at all, which for a register
 * whose whole traffic is somebody typing a town and the word "zavetišče" is
 * the cheapest thing there is to fix. It is a static export, so this is
 * generated once at build time from the same two files every page is built
 * from: the register and the dataset.
 *
 * What is not here: /portal and /portal/prijava, which already carry
 * robots: { index: false } because they are a shelter's own workspace behind
 * a magic link, and /dev/map, which is a drawing tool. The portal pages are
 * fetchable on purpose, so that noindex is read; see app/robots.ts. /viri is
 * here despite being hidden from the site's own navigation, because hidden
 * from a menu is not the same as hidden from search, and it was written for
 * the search that lands on it.
 *
 * No priority field. It is advisory, Google says it ignores it, and a number
 * invented per route reads as a claim the site cannot support. lastModified
 * is real where the data carries a date and left off where it does not,
 * rather than stamped with the build's own clock: a build time on every URL
 * says every page changed, which is how a sitemap stops being believed.
 */

// The same declaration app/robots.ts carries, and for the same reason: a
// metadata route is a Route Handler, and under output: export one that does
// not declare itself static fails the build. This reads two files off disk at
// build time and nothing off a request.
export const dynamic = "force-static";

const LOCALES = ["sl", "en"] as const;

function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

type Pair = {
  /** The same page's path in each language. */
  paths: Record<Locale, string>;
  lastModified?: Date;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
};

/**
 * One page as the two entries a sitemap wants for it.
 *
 * Both languages are listed, and each carries the full set of alternates
 * including itself, which is what Google's own documentation asks for: a
 * crawler arriving at either URL has to be able to find every other version
 * from that one entry.
 */
function entries(pair: Pair): MetadataRoute.Sitemap {
  const languages = {
    sl: absolute(pair.paths.sl),
    en: absolute(pair.paths.en),
  };
  return LOCALES.map((locale) => ({
    url: absolute(pair.paths[locale]),
    lastModified: pair.lastModified,
    changeFrequency: pair.changeFrequency,
    alternates: { languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const shelters = loadShelters();
  // Absent until a provider is enabled, which is an ordinary state: the
  // register still has seventeen pages of its own to list.
  const animals = loadDataset()?.animals ?? [];

  const pages: Pair[] = [
    // The grid, which is the site's front door in both languages. It changes
    // whenever an animal is listed or adopted, which is every crawl.
    {
      paths: { sl: homePath("sl"), en: homePath("en") },
      changeFrequency: "daily",
    },
    {
      paths: {
        sl: sheltersIndexPath("sl"),
        en: sheltersIndexPath("en"),
      },
      changeFrequency: "weekly",
    },
    {
      paths: { sl: FOUND_ANIMAL_PATHS.sl, en: FOUND_ANIMAL_PATHS.en },
      changeFrequency: "monthly",
    },
    // Hidden from the navigation, still a page written for search. See
    // lib/site-links.ts for why it is not in the menus.
    {
      paths: { sl: RESOURCES_PATHS.sl, en: RESOURCES_PATHS.en },
      changeFrequency: "monthly",
    },
    ...shelters.map((shelter) => ({
      paths: {
        sl: shelterPath(shelter.id, "sl"),
        en: shelterPath(shelter.id, "en"),
      },
      changeFrequency: "weekly" as const,
    })),
    ...animals.map((animal) => ({
      paths: {
        sl: animalPath(animal, "sl"),
        en: animalPath(animal, "en"),
      },
      // When the crawl last saw the listing still up, which is the closest
      // thing the dataset holds to "when did this page last change".
      lastModified: new Date(animal.source.lastSeenAt),
      changeFrequency: "weekly" as const,
    })),
  ];

  return pages.flatMap(entries);
}
