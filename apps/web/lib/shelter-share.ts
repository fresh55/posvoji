import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { shelterPath, sheltersIndexPath } from "@/lib/shelter-path";
import type { ShelterRegistryEntry } from "@/lib/shelters";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

// Where the static export serves the plates from, and where they sit in the
// repo. Unlike the animal cards these are committed assets, not build output of
// the ingest run, so there is no manifest to consult: the file is either in the
// tree or it is not.
const PUBLIC_PREFIX = "/map-plates";

const platesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "map-plates",
);

const known = new Map<string, string | undefined>();

/**
 * The map plate scripts/build-shelter-plates.mjs drew for this shelter: the
 * site's own map of Slovenia with the shelter's region lifted and its town
 * marked. One image serves both languages, because the plate is set in
 * Slovenian in both, the way the live map's own furniture is.
 *
 * Absent until the script has run, which is the normal state only if somebody
 * added a shelter to the registry and did not redraw. A missing plate costs the
 * page its preview image and nothing else.
 */
export function shelterPlateUrl(id: string): string | undefined {
  if (!known.has(id)) {
    const file = `${id}.jpg`;
    known.set(id, existsSync(join(platesDir, file)) ? `${PUBLIC_PREFIX}/${file}` : undefined);
  }
  return known.get(id);
}

// Re-exported so the callers that want a path and the metadata in one import
// keep getting both. It lives in shelter-path.ts because this module cannot be
// imported from the browser (see the note there).
export { shelterPath };

/**
 * One page's address in both languages, as the head's canonical and its pair
 * of hreflangs.
 *
 * Both callers below build the same three-line shape off a locale-keyed pair
 * of paths, and the shape is the part worth writing once: which of the two is
 * canonical follows from the locale being rendered, and the languages map
 * always names both, including the page itself.
 */
function localeAlternates(
  paths: Record<Locale, string>,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  return { canonical: paths[locale], languages: paths };
}

/**
 * The shelters index's own address, and the other language's copy of it.
 *
 * Every shelter detail page has carried these since shelterMetadata was
 * written, and the index they all hang off carried neither: /zavetisca and
 * /en/shelters are the same document in two languages with nothing in either
 * head to say so, while /zavetisca/muri names both. That is the pair most
 * likely to be searched for, in the language the searcher is not using.
 *
 * A helper rather than the object written twice, because the two routes are
 * separate files that nothing else keeps in step.
 */
export function sheltersIndexAlternates(
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  return localeAlternates(
    { sl: sheltersIndexPath("sl"), en: sheltersIndexPath("en") },
    locale,
  );
}

const text = {
  sl: {
    description: (name: string, city: string) =>
      `${name}, ${city}. Kontaktni podatki in živali za posvojitev na Posvoji.si.`,
    alt: (name: string, city: string) =>
      `Zemljevid Slovenije z označeno lokacijo: ${name}, ${city}.`,
  },
  en: {
    description: (name: string, city: string) =>
      `${name}, ${city}. Contact details and animals for adoption on Posvoji.si.`,
    alt: (name: string, city: string) =>
      `Map of Slovenia marking the location of ${name}, ${city}.`,
  },
} satisfies Record<Locale, Record<string, unknown>>;

/**
 * Everything a shared shelter link needs, built the same way animalMetadata
 * builds an animal's: a title, a description templated from the registry's own
 * fields, the image drawn at build time, and the other language's copy of the
 * same page.
 */
export function shelterMetadata(
  shelter: ShelterRegistryEntry,
  locale: Locale,
): Metadata {
  const t = text[locale];
  const description = t.description(shelter.name, shelter.city);
  const path = shelterPath(shelter.id, locale);
  const plate = shelterPlateUrl(shelter.id);
  const images = plate
    ? [
        {
          url: plate,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt: t.alt(shelter.name, shelter.city),
        },
      ]
    : undefined;

  return {
    title: `${shelter.name} | Posvoji.si`,
    description,
    alternates: localeAlternates(
      { sl: shelterPath(shelter.id, "sl"), en: shelterPath(shelter.id, "en") },
      locale,
    ),
    openGraph: {
      type: "website",
      siteName: "Posvoji.si",
      locale: locale === "sl" ? "sl_SI" : "en_GB",
      title: shelter.name,
      description,
      url: path,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: shelter.name,
      description,
      images: plate ? [plate] : undefined,
    },
  };
}
