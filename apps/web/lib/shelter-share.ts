import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { shareMetadata } from "@/lib/share-metadata";
import { shelterPath } from "@/lib/shelter-path";
import type { ShelterRegistryEntry } from "@/lib/shelters";

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

/** What a map plate shows, as a sentence. Exported because the plate is used
 *  on more than the shelter's own page: lib/municipality-share.ts hands an
 *  občina the plate of the shelter responsible for it, and the picture is the
 *  same picture, so the description of it should not be written twice. */
export function shelterPlateAlt(
  name: string,
  city: string,
  locale: Locale,
): string {
  return text[locale].alt(name, city);
}

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
  const plate = shelterPlateUrl(shelter.id);

  return shareMetadata({
    title: shelter.name,
    description: text[locale].description(shelter.name, shelter.city),
    path: shelterPath(shelter.id, locale),
    locale,
    languages: {
      sl: shelterPath(shelter.id, "sl"),
      en: shelterPath(shelter.id, "en"),
    },
    image: plate
      ? { url: plate, alt: shelterPlateAlt(shelter.name, shelter.city, locale) }
      : undefined,
  });
}
