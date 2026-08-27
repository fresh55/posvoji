import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import type { Locale, TranslationKey } from "@/lib/i18n";

export type RoutePair = Readonly<Record<Locale, string>>;

export type RouteKey =
  | "home"
  | "animal"
  | "shelters"
  | "foundAnimal"
  | "resources";

/**
 * Every route whose address differs between the two languages, paired and
 * named.
 *
 * One table. The language switcher translates the address a visitor is
 * standing on with it, the header builds its navigation from it, the footer
 * and the page components link with it, the sitemap walks it, and the
 * metadata builders declare their hreflang pairs from it. None of those can
 * hardcode one locale's paths without the other side drifting.
 *
 * Keyed rather than ordered: the navigation used to reach into a list by
 * index, so inserting a pair silently repointed a link and nothing said so.
 *
 * The found-animal pair is read from lib/found-animal.ts rather than restated
 * there: that file is the contract between the homepage button and the
 * lookup, and both sides already reach it.
 *
 * In lib and not in components because lib modules must not import upward
 * from components, and half the readers of this table are lib modules. It
 * stays free of node:fs and of JSX, so a client component can import it.
 */
export const ROUTES: Readonly<Record<RouteKey, RoutePair>> = {
  home: { sl: "/", en: "/en" },
  animal: { sl: "/zival", en: "/en/animal" },
  shelters: { sl: "/zavetisca", en: "/en/shelters" },
  foundAnimal: FOUND_ANIMAL_PATHS,
  resources: { sl: "/viri", en: "/en/resources" },
};

/**
 * The routes that are a page in both languages and are built from no record.
 * The animal key is absent: /zival is a prefix, not an address, and an
 * animal's page comes from the dataset.
 *
 * lib/page-share.ts writes the copy for these four and app/sitemap.ts lists
 * them, so the set is named once here instead of in both.
 */
export const INDEX_ROUTES = [
  "home",
  "shelters",
  "resources",
  "foundAnimal",
] as const satisfies readonly RouteKey[];

export type IndexRoute = (typeof INDEX_ROUTES)[number];

/**
 * The pages the header links to, in order.
 *
 * Home is deliberately absent: the logo already goes there, and so is the
 * animal pair, whose index is the homepage.
 */
export const NAV_ROUTES: readonly {
  paths: RoutePair;
  label: TranslationKey;
}[] = [
  { paths: ROUTES.shelters, label: "shelters" },
  { paths: ROUTES.foundAnimal, label: "muniTab" },
  { paths: ROUTES.resources, label: "navResources" },
];

/**
 * The pairs translatePath rewrites between. Home is left out on purpose: "/"
 * is a prefix of every Slovenian path and "/en" of every English one, so
 * pairing it here would turn /en/shelters into //shelters. It is the fallback
 * below instead, which is where a path with no paired prefix belongs anyway.
 */
const PREFIX_PAIRS: readonly RoutePair[] = [
  ROUTES.animal,
  ROUTES.shelters,
  ROUTES.foundAnimal,
  ROUTES.resources,
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
  for (const { sl, en } of PREFIX_PAIRS) {
    const [from, to] = target === "en" ? [sl, en] : [en, sl];
    if (isUnder(pathname, from)) return to + pathname.slice(from.length);
  }
  return ROUTES.home[target];
}
