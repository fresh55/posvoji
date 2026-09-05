import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Animal, Species } from "@posvoji/schema";
import { isDrawableImage } from "./cache-images";
import {
  cachedImagesDir,
  fontsDir,
  shareCardManifestPath,
  shareCardsDir,
} from "./paths";
import { writeFileAtomic } from "./write-atomic";

// Where the static site serves the files written to shareCardsDir.
const PUBLIC_PREFIX = "/media/share";

// The size every platform crops from: 1.91:1, above Facebook's 600x315
// minimum and what Twitter's summary_large_image expects.
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

// Part of every fingerprint, so a change to the drawing redraws the existing
// cards instead of leaving last week's design in place.
const RENDERER_VERSION = 2;

const JPEG_QUALITY = 84;

// Site tokens from apps/web/app/globals.css, converted from oklch once. A
// share card is the site's own surface, so it uses the site's own palette.
const COLOR = {
  page: "#f5f5f5",
  surface: "#ffffff",
  border: "#e5e5e5",
  foreground: "#0a0a0a",
  muted: "#737373",
  accent: "#d0eed6",
  accentBorder: "#76a681",
  accentForeground: "#0d3d1e",
  accentStrong: "#1d6234",
} as const;

const FONT_REGULAR = join(fontsDir, "Inter-Regular.ttf");
const FONT_SEMIBOLD = join(fontsDir, "Inter-SemiBold.ttf");

export type CardLocale = "sl" | "en";
export const CARD_LOCALES: CardLocale[] = ["sl", "en"];

const SPECIES_LABEL: Record<CardLocale, Record<Species, string>> = {
  sl: { dog: "Pes", cat: "Mačka", rabbit: "Zajček", other: "Žival" },
  en: { dog: "Dog", cat: "Cat", rabbit: "Rabbit", other: "Animal" },
};

const UNNAMED: Record<CardLocale, string> = {
  sl: "Brez imena",
  en: "Unnamed",
};

// Mirrors formatAge in apps/web/lib/labels.ts, including the Slovenian dual.
// The card is drawn in the ingest process, which has no access to the web
// app's messages, so the two agree by convention rather than by import.
function formatAge(months: number, locale: CardLocale): string {
  if (locale === "en") {
    if (months < 12) return `${months} ${months === 1 ? "month" : "months"}`;
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  const forms: [string, string, string, string] =
    months < 12
      ? ["mesec", "meseca", "meseci", "mesecev"]
      : ["leto", "leti", "leta", "let"];
  const n = months < 12 ? months : Math.floor(months / 12);
  const rest = n % 100;
  const form =
    rest === 1
      ? forms[0]
      : rest === 2
        ? forms[1]
        : rest === 3 || rest === 4
          ? forms[2]
          : forms[3];
  return `${n} ${form}`;
}

export function ageInMonths(
  animal: Animal,
  reference: Date,
): number | undefined {
  if (animal.birthDate) {
    const born = new Date(animal.birthDate);
    const months =
      (reference.getFullYear() - born.getFullYear()) * 12 +
      (reference.getMonth() - born.getMonth());
    return months >= 0 ? months : undefined;
  }
  return animal.approximateAgeMonths;
}

export interface CardText {
  name: string;
  species: string;
  age?: string;
  shelter: string;
  city: string;
}

// Name, species, age, shelter: the four facts every animal in the dataset can
// carry, and the ones og:description repeats in prose.
export function cardText(
  animal: Animal,
  locale: CardLocale,
  reference: Date,
): CardText {
  const months = ageInMonths(animal, reference);
  return {
    name: animal.name ?? UNNAMED[locale],
    species: SPECIES_LABEL[locale][animal.species],
    age: months === undefined ? undefined : formatAge(months, locale),
    shelter: animal.shelter.name,
    city: animal.shelter.city,
  };
}

// Animal ids come from provider slugs, but a card is a file name. Sanitizing
// alone is not injective (`a:b` and `a_b` used to overwrite the same card), so
// keep a readable bounded stem and bind it to the complete id with a digest.
function safeId(id: string): string {
  const stem = id
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "_")
    .slice(0, 96);
  const digest = createHash("sha256").update(id).digest("hex").slice(0, 16);
  return `${stem || "animal"}-${digest}`;
}

// A photo card carries no words, so one file serves both languages. A
// typographic card spells out species and age, so it gets one per language.
export function shareCardFile(id: string, locale?: CardLocale): string {
  return locale ? `${safeId(id)}.${locale}.jpg` : `${safeId(id)}.jpg`;
}

export function shareCardUrlFor(file: string): string {
  return `${PUBLIC_PREFIX}/${file}`;
}

// Only our own cached copy is ever drawn into a card. A display-permitted
// photo may be shown from the shelter's server; it may not be baked into an
// image we host, so those animals get a typographic card instead.
//
// The card shows the photo the page leads with, which is the first drawable
// image and nothing else: reaching past a display-permitted lead for a
// cache-permitted photo further down would put a picture on the card that the
// site never shows. Same rule as heroSourceUrls and permittedPhotos.
export function photoSourceFor(
  animal: Animal,
  mediaDir = cachedImagesDir,
): string | undefined {
  const lead = animal.images.find(isDrawableImage);
  if (!lead || lead.rights !== "cache-permitted") return undefined;
  const cached = lead.cachedUrl;
  if (!cached || !cached.startsWith("/media/animals/")) return undefined;
  const path = join(mediaDir, cached.slice("/media/animals/".length));
  return existsSync(path) ? path : undefined;
}

function escapeMarkup(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

interface TextLayer {
  data: Buffer;
  width: number;
  height: number;
}

// One Pango run per weight and colour: sharp takes a single font file per
// call, and the vendored Inter ships regular and semibold as separate files.
// fontfile only offers the face to fontconfig; the font description is what
// picks it, so the two have to name the same family.
async function textLayer(
  value: string,
  options: { size: number; color: string; bold?: boolean; width?: number },
): Promise<TextLayer> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${options.color}">${escapeMarkup(value)}</span>`,
      font: `${options.bold ? "Inter SemiBold" : "Inter"} ${options.size}`,
      fontfile: options.bold ? FONT_SEMIBOLD : FONT_REGULAR,
      rgba: true,
      dpi: 72,
      width: options.width,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// The photo card's caption strip. The photo is sized to sit above it, so the
// caption never lands on the animal.
const BAR_HEIGHT = 104;
const PHOTO_HEIGHT = CARD_HEIGHT - BAR_HEIGHT;
const PADDING = 48;
const BLUR_SIGMA = 30;
const LINE_GAP = 6;

/**
 * The recipe rescue sites converge on: the photo blown up and blurred as the
 * background, the whole uncropped photo composited on top. A portrait shelter
 * photo keeps its head and its paws where a cover crop would cut through
 * them, and the frame is still filled.
 */
export async function renderPhotoCard(
  source: Buffer,
  text: CardText,
): Promise<Buffer> {
  const background = await sharp(source)
    .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: "centre" })
    .blur(BLUR_SIGMA)
    .modulate({ brightness: 0.84, saturation: 1.1 })
    .toBuffer();

  const photo = await sharp(source)
    .resize(CARD_WIDTH - PADDING * 2, PHOTO_HEIGHT, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });

  const name = await textLayer(truncate(text.name, 28), {
    size: 28,
    color: COLOR.foreground,
    bold: true,
  });
  // Names of places and shelters only. The photo card is one file for both
  // languages, so nothing on it may need translating; species and age are
  // said in the title and the description the platform prints beside it.
  const meta = await textLayer(truncate(`${text.shelter} · ${text.city}`, 54), {
    size: 20,
    color: COLOR.muted,
  });
  const wordmark = await textLayer("posvoji.si", {
    size: 22,
    color: COLOR.accentStrong,
    bold: true,
  });

  const strip = Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${BAR_HEIGHT}">`,
      `<rect width="${CARD_WIDTH}" height="${BAR_HEIGHT}" fill="${COLOR.surface}"/>`,
      `<rect width="${CARD_WIDTH}" height="3" fill="${COLOR.accentBorder}"/>`,
      `</svg>`,
    ].join(""),
  );

  const top = PHOTO_HEIGHT;
  const textTop =
    top + Math.round((BAR_HEIGHT - name.height - meta.height - LINE_GAP) / 2);

  return sharp(background)
    .composite([
      {
        input: photo.data,
        top: Math.round((PHOTO_HEIGHT - photo.info.height) / 2),
        left: Math.round((CARD_WIDTH - photo.info.width) / 2),
      },
      { input: strip, top, left: 0 },
      { input: name.data, top: textTop, left: PADDING },
      {
        input: meta.data,
        top: textTop + name.height + LINE_GAP,
        left: PADDING,
      },
      {
        input: wordmark.data,
        top: top + Math.round((BAR_HEIGHT - wordmark.height) / 2),
        left: CARD_WIDTH - PADDING - wordmark.width,
      },
    ])
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

// Lucide, ISC licensed, the same icons the site draws for each species. Kept
// as raw path data because ingest has no React to render the components with.
const SPECIES_ICON: Record<Species, string> = {
  dog: [
    '<path d="M11.25 16.25h1.5L12 17z"/>',
    '<path d="M16 14v.5"/>',
    '<path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"/>',
    '<path d="M8 14v.5"/>',
    '<path d="M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/>',
  ].join(""),
  cat: [
    '<path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/>',
    '<path d="M8 14v.5"/>',
    '<path d="M16 14v.5"/>',
    '<path d="M11.25 16.25h1.5L12 17l-.75-.75Z"/>',
  ].join(""),
  rabbit: [
    '<path d="M13 16a3 3 0 0 1 2.24 5"/>',
    '<path d="M18 12h.01"/>',
    '<path d="M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3"/>',
    '<path d="M20 8.54V4a2 2 0 1 0-4 0v3"/>',
    '<path d="M7.612 12.524a3 3 0 1 0-1.6 4.3"/>',
  ].join(""),
  other: [
    '<circle cx="11" cy="4" r="2"/>',
    '<circle cx="18" cy="8" r="2"/>',
    '<circle cx="20" cy="16" r="2"/>',
    '<path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  ].join(""),
};

// The card inset, in the site's own proportions: a bordered surface on the
// muted page, one radius, generous padding.
const SURFACE_INSET = 40;
const SURFACE_RADIUS = 28;
const SURFACE_PADDING = 56;
const ICON_SIZE = 300;
const BADGE_HEIGHT = 46;
const BADGE_PADDING = 22;

/**
 * The card for providers whose photos we may not host. It says the same four
 * facts in type, on the site's own surface, so a facts-only shelter is not
 * punished with a generic link preview.
 */
export async function renderTypographicCard(
  text: CardText,
  species: Species,
): Promise<Buffer> {
  const badgeText = await textLayer(text.species, {
    size: 20,
    color: COLOR.accentForeground,
    bold: true,
  });
  const name = await textLayer(truncate(text.name, 22), {
    size: 68,
    color: COLOR.foreground,
    bold: true,
  });
  const facts = await textLayer(
    truncate([text.age, text.shelter, text.city].filter(Boolean).join(" · "), 46),
    { size: 30, color: COLOR.muted },
  );
  const wordmark = await textLayer("posvoji.si", {
    size: 24,
    color: COLOR.accentStrong,
    bold: true,
  });

  const surfaceLeft = SURFACE_INSET;
  const surfaceTop = SURFACE_INSET;
  const surfaceWidth = CARD_WIDTH - SURFACE_INSET * 2;
  const surfaceHeight = CARD_HEIGHT - SURFACE_INSET * 2;
  const contentLeft = surfaceLeft + SURFACE_PADDING;
  const badgeWidth = badgeText.width + BADGE_PADDING * 2;
  const badgeTop = surfaceTop + SURFACE_PADDING;
  const iconLeft = surfaceLeft + surfaceWidth - SURFACE_PADDING - ICON_SIZE;
  const iconTop = surfaceTop + (surfaceHeight - ICON_SIZE) / 2;
  const iconScale = ICON_SIZE / 24;

  const background = Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">`,
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.page}"/>`,
      `<rect x="${surfaceLeft}" y="${surfaceTop}" width="${surfaceWidth}" height="${surfaceHeight}"`,
      ` rx="${SURFACE_RADIUS}" fill="${COLOR.surface}" stroke="${COLOR.border}" stroke-width="2"/>`,
      // The species mark sits behind the type, in the accent the filters use.
      `<g transform="translate(${iconLeft} ${iconTop}) scale(${iconScale})"`,
      ` fill="none" stroke="${COLOR.accent}" stroke-width="1.25"`,
      ` stroke-linecap="round" stroke-linejoin="round">`,
      SPECIES_ICON[species],
      `</g>`,
      `<rect x="${contentLeft}" y="${badgeTop}" width="${badgeWidth}" height="${BADGE_HEIGHT}"`,
      ` rx="${BADGE_HEIGHT / 2}" fill="${COLOR.accent}"/>`,
      `</svg>`,
    ].join(""),
  );

  const nameTop = surfaceTop + Math.round(surfaceHeight / 2) - name.height;
  return sharp(background)
    .composite([
      {
        input: badgeText.data,
        top: badgeTop + Math.round((BADGE_HEIGHT - badgeText.height) / 2),
        left: contentLeft + BADGE_PADDING,
      },
      { input: name.data, top: nameTop, left: contentLeft },
      {
        input: facts.data,
        top: nameTop + name.height + 18,
        left: contentLeft,
      },
      {
        input: wordmark.data,
        top: surfaceTop + surfaceHeight - SURFACE_PADDING - wordmark.height,
        left: contentLeft,
      },
    ])
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

export interface ShareCardEntry {
  files: string[];
  fingerprint: string;
}

export interface ShareCardManifest {
  entries: Record<string, ShareCardEntry>;
}

function readManifest(path: string): ShareCardManifest {
  if (!existsSync(path)) return { entries: {} };
  let why: string;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed.entries === "object" && parsed.entries) {
      return { entries: parsed.entries };
    }
    why = "no entries object";
  } catch (error) {
    why = String(error);
  }
  console.warn(`share cards: the manifest at ${path} is unreadable (${why})`);
  return { entries: {} };
}

// Everything the drawing depends on. The photo path is content addressed by
// the image cache, so a new shelter photo changes the fingerprint by itself.
export function fingerprintFor(
  animal: Animal,
  photo: string | undefined,
  reference: Date,
): string {
  const input = JSON.stringify({
    version: RENDERER_VERSION,
    photo: photo === undefined ? null : photo.split(/[\\/]/).pop(),
    text: CARD_LOCALES.map((locale) => cardText(animal, locale, reference)),
  });
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export interface WriteShareCardsOptions {
  cardsDir?: string;
  manifestPath?: string;
  mediaDir?: string;
  /** Ages are measured from the dataset's build time, as on the site. */
  reference?: Date;
}

export interface WriteShareCardsResult {
  written: number;
  reused: number;
  deleted: number;
}

/**
 * Draws one share card per animal and sweeps the ones that no longer belong
 * to anybody. Cards are keyed by animal id and their content is fingerprinted,
 * so a re-export redraws only what changed.
 */
export async function writeShareCards(
  animals: Animal[],
  options: WriteShareCardsOptions = {},
): Promise<WriteShareCardsResult> {
  const cardsDir = options.cardsDir ?? shareCardsDir;
  const manifestPath = options.manifestPath ?? shareCardManifestPath;
  const mediaDir = options.mediaDir ?? cachedImagesDir;
  const reference = options.reference ?? new Date();

  const previous = readManifest(manifestPath);
  const next: ShareCardManifest = { entries: {} };
  mkdirSync(cardsDir, { recursive: true });

  // Same rule as the photo and logo caches: with no usable manifest the sweep
  // below reads every card on disk as an orphan, and an animal whose card
  // fails to draw this run would lose the card it already had.
  const startedWith = readdirSync(cardsDir);
  const manifestLost =
    Object.keys(previous.entries).length === 0 && startedWith.length > 0;
  if (manifestLost) {
    console.warn(
      `share cards: no usable manifest at ${manifestPath} but ` +
        `${startedWith.length} file(s) in ${cardsDir}. Keeping them and ` +
        `skipping the deletion sweep for this run.`,
    );
  }

  let written = 0;
  let reused = 0;

  for (const animal of animals) {
    const photo = photoSourceFor(animal, mediaDir);
    const fingerprint = fingerprintFor(animal, photo, reference);
    const before = previous.entries[animal.id];
    if (
      before?.fingerprint === fingerprint &&
      before.files.every((file) => existsSync(join(cardsDir, file)))
    ) {
      next.entries[animal.id] = before;
      reused++;
      continue;
    }

    try {
      if (photo) {
        const source = readFileSync(photo);
        const file = shareCardFile(animal.id);
        writeFileAtomic(
          join(cardsDir, file),
          await renderPhotoCard(source, cardText(animal, "sl", reference)),
        );
        next.entries[animal.id] = { files: [file], fingerprint };
      } else {
        const files: string[] = [];
        for (const locale of CARD_LOCALES) {
          const file = shareCardFile(animal.id, locale);
          writeFileAtomic(
            join(cardsDir, file),
            await renderTypographicCard(
              cardText(animal, locale, reference),
              animal.species,
            ),
          );
          files.push(file);
        }
        next.entries[animal.id] = { files, fingerprint };
      }
      written++;
    } catch (error) {
      // A card is a nice-to-have. A shelter photo that sharp cannot read must
      // not take the export down with it.
      console.warn(`share card ${animal.id}: not drawn (${error})`);
    }
  }

  const referenced = new Set(
    Object.values(next.entries).flatMap((entry) => entry.files),
  );
  let deleted = 0;
  if (!manifestLost) {
    for (const file of readdirSync(cardsDir)) {
      if (referenced.has(file)) continue;
      try {
        rmSync(join(cardsDir, file));
        deleted++;
      } catch (error) {
        console.warn(`share card ${file}: could not be deleted (${error})`);
      }
    }
  }

  writeFileAtomic(manifestPath, JSON.stringify(next, null, 2));

  return { written, reused, deleted };
}
