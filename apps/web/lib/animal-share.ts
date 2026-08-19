import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Metadata } from "next";
import type { Animal } from "@posvoji/schema";
import { animalPath } from "@/lib/animal-path";
import { ageInMonths } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { ageLabel, animalMeta, speciesLabel, statusLabel } from "@/lib/labels";


// The site's own origin. A link preview needs absolute URLs, and a static
// export has no request to derive one from.
export const SITE_URL = "https://posvoji.si";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const manifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "dist",
  "share-cards.json",
);

interface ShareCardManifest {
  entries: Record<string, { files: string[] }>;
}

let manifest: ShareCardManifest | null | undefined;

// Read once at build time. Absent until an export has drawn the cards, which
// is the normal state of a fresh checkout.
function loadManifest(): ShareCardManifest | null {
  if (manifest !== undefined) return manifest;
  manifest = null;
  if (existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (parsed && typeof parsed.entries === "object" && parsed.entries) {
        manifest = { entries: parsed.entries };
      }
    } catch {
      // A broken manifest just means the site-wide preview is used.
    }
  }
  return manifest;
}

/**
 * The card ingest drew for this animal. Photo cards carry no words and serve
 * both languages; typographic cards are drawn once per language.
 */
export function shareCardUrl(id: string, locale: Locale): string | undefined {
  const files = loadManifest()?.entries[id]?.files;
  if (!files || files.length === 0) return undefined;
  const file =
    files.find((name) => name.endsWith(`.${locale}.jpg`)) ??
    files.find((name) => !/\.(sl|en)\.jpg$/.test(name));
  return file ? `/media/share/${file}` : undefined;
}

const text = {
  sl: {
    waiting: (shelter: string, city: string) =>
      `Čaka na dom. ${shelter}, ${city}.`,
    settled: (label: string) => `Status: ${label}.`,
    close: "Podrobnosti in izvirna objava zavetišča na Posvoji.si.",
  },
  en: {
    waiting: (shelter: string, city: string) =>
      `Waiting for a home at ${shelter}, ${city}.`,
    settled: (label: string) => `Status: ${label}.`,
    close: "Details and the shelter's own listing on Posvoji.si.",
  },
} satisfies Record<Locale, Record<string, unknown>>;

/**
 * Built from the dataset's own fields, never from the shelter's description:
 * a description is the shelter's writing, and repeating it in a link preview
 * is republishing it. Name, species, sex, age, status and shelter are ours to
 * state.
 */
export function animalDescription(
  animal: Animal,
  locale: Locale,
  reference: Date,
): string {
  const t = text[locale];
  const facts = animalMeta(animal, locale, reference);
  const head = animal.name ? `${animal.name} · ${facts}.` : `${facts}.`;
  const status = statusLabel(animal.status, locale);
  // Available is the norm and says nothing worth a sentence; an unknown
  // status has no wording at all. Both leave the shelter line standing.
  const middle =
    animal.status === "available" || status === undefined
      ? t.waiting(animal.shelter.name, animal.shelter.city)
      : t.settled(status);
  return `${head} ${middle} ${t.close}`;
}

export function animalTitle(
  animal: Animal,
  locale: Locale,
  reference: Date,
): string {
  const months = ageInMonths(animal, reference);
  const parts = [
    animal.name,
    speciesLabel(animal.species, locale),
    months === undefined ? undefined : ageLabel(months, locale),
    animal.shelter.name,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

/**
 * Everything a shared link needs: a title, a description templated from the
 * structured fields, the card drawn at export time, and the other language's
 * copy of the same page.
 */
export function animalMetadata(
  animal: Animal,
  locale: Locale,
  reference: Date,
): Metadata {
  const title = animalTitle(animal, locale, reference);
  const description = animalDescription(animal, locale, reference);
  const path = animalPath(animal, locale);
  const card = shareCardUrl(animal.id, locale);
  const images = card
    ? [{ url: card, width: CARD_WIDTH, height: CARD_HEIGHT, alt: title }]
    : undefined;

  return {
    title: `${title} | Posvoji.si`,
    description,
    alternates: {
      canonical: path,
      languages: {
        sl: animalPath(animal, "sl"),
        en: animalPath(animal, "en"),
      },
    },
    openGraph: {
      type: "article",
      siteName: "Posvoji.si",
      locale: locale === "sl" ? "sl_SI" : "en_GB",
      title,
      description,
      url: path,
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: card ? [card] : undefined,
    },
  };
}
