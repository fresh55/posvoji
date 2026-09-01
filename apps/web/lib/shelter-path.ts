import type { Locale } from "@/lib/i18n";

/**
 * One address per shelter per language. Pure string work, and deliberately in
 * a module of its own rather than beside shelterMetadata in lib/shelter-share.
 *
 * That module opens node:fs at its top level to look for a shelter's map plate,
 * which is right for something only a server page calls, and fatal for anything
 * a client component imports: the whole module graph follows the named export,
 * so a card asking for a URL string dragged node:fs into the browser chunk and
 * Turbopack failed the build with "the chunking context does not support
 * external modules". lib/animal-path.ts is the same shape for the same reason.
 */
export function shelterPath(id: string, locale: Locale): string {
  return `${sheltersIndexPath(locale)}/${id}`;
}

/** The shelters index itself, the other half of the same route pair. */
export function sheltersIndexPath(locale: Locale): string {
  return locale === "sl" ? "/zavetisca" : "/en/shelters";
}

/** The animals grid, which is the site's root in either language. */
export function homePath(locale: Locale): string {
  return locale === "sl" ? "/" : "/en";
}

/**
 * The two routes as locale-keyed pairs, for the callers that need both halves
 * at once: the head's hreflang alternates, the sitemap's entries, and the
 * language switcher.
 *
 * Constants rather than the pair written out at each site, which is the shape
 * FOUND_ANIMAL_PATHS and RESOURCES_PATHS already take, and for the reason
 * RESOURCES_PATHS gives: written by hand in three places is two more than can
 * be kept in step.
 */
export const HOME_PATHS = {
  sl: homePath("sl"),
  en: homePath("en"),
} as const;

export const SHELTER_INDEX_PATHS = {
  sl: sheltersIndexPath("sl"),
  en: sheltersIndexPath("en"),
} as const;
