import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale, TranslationKey } from "@/lib/i18n";

export type RoutePair = { readonly sl: string; readonly en: string };

/**
 * Every path prefix that differs between the two languages, paired.
 *
 * One table, because two would drift. The language switcher translates the
 * address a visitor is standing on with it, and the header builds its
 * navigation from it, so neither side can hardcode one locale's paths into
 * the other's. The found-animal pair is read from lib/found-animal.ts rather
 * than restated: the footer and the page component already share it there.
 */
export const ROUTE_PREFIXES: readonly RoutePair[] = [
  { sl: "/zival", en: "/en/animal" },
  { sl: "/zavetisca", en: "/en/shelters" },
  { sl: FOUND_ANIMAL_PATHS.sl, en: FOUND_ANIMAL_PATHS.en },
  { sl: "/viri", en: "/en/resources" },
];

/**
 * The pages the header links to, in order.
 *
 * The animal pair is deliberately absent: /zival is an animal's own page and
 * its index is the homepage, which the logo already goes to.
 */
export const NAV_ROUTES: readonly {
  paths: RoutePair;
  label: TranslationKey;
}[] = [
  { paths: ROUTE_PREFIXES[1], label: "shelters" },
  { paths: ROUTE_PREFIXES[2], label: "muniTab" },
  { paths: ROUTE_PREFIXES[3], label: "navResources" },
];

/** True when `path` is that route or a page below it, so /zavetisca/<id>
 *  marks the shelters link and /najdena-zival/<obcina> the found-animal one. */
export function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** The same page in the other language, worked out from the path a visitor is
 *  standing on. Falls back to that language's index for a path with no paired
 *  prefix (the portal, a dev route, or the index itself). */
export function translatePath(pathname: string, target: Locale): string {
  for (const { sl, en } of ROUTE_PREFIXES) {
    const [from, to] = target === "en" ? [sl, en] : [en, sl];
    if (isUnder(pathname, from)) return to + pathname.slice(from.length);
  }
  return target === "en" ? "/en" : "/";
}
