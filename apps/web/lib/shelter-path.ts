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
