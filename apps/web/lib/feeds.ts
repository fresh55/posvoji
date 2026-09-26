import type { Metadata } from "next";
import type { Animal, Dataset } from "@posvoji/schema";
import { adoptableNow, listedAtOf, listedAtTime } from "@/lib/animal";
import { animalPath } from "@/lib/animal-path";
import { EMPTY_FILTERS, serializeFilters } from "@/lib/filters";
import { getMessages, type Locale } from "@/lib/i18n";
import {
  animalMetaParts,
  META_SEPARATOR,
  speciesLabel,
  speciesScopeLabel,
} from "@/lib/labels";
import { homePath } from "@/lib/shelter-path";
import { SITE_URL } from "@/lib/site";
import { SITE_NAME } from "@/lib/site-metadata";
import { serializeSort } from "@/lib/sort";
import { TAB_OF_SPECIES, type SpeciesTab } from "@/lib/species";

/**
 * Atom feeds of the newest listings, which is how a visitor is told about new
 * animals without handing this site anything. An email alert would be the
 * adopters' personal data, which docs/DATA-POLICY.md rules out (principle 4);
 * a feed is fetched by the visitor's own reader and asks nothing of them.
 *
 * Only what the site states as fact: the name, the species, the card's fact
 * line, the shelter and its town, the day this site first listed the animal,
 * a link to its page here and one to the shelter's own listing. No
 * description and no photograph. The policy indexes facts by default and
 * shows photos and a shelter's own words only as far as that shelter allows
 * (principle 2), and what policy.yaml records is permission to show them on
 * this site. A feed hands its contents to somebody else's software to keep,
 * which no shelter has been asked about.
 *
 * Pure: the routes that serve these read the dataset and hand it over
 * (app/(sl)/nove-objave, app/(en)/en/new-listings).
 */

/** The feeds: every species, and one per species tab. */
export type FeedScope = "all" | SpeciesTab;

export const FEED_SCOPES: readonly FeedScope[] = ["all", "dog", "cat", "other"];

/** How far back a feed reaches from the dataset's generatedAt. */
export const FEED_WINDOW_DAYS = 30;

/** The most entries a feed carries. */
export const FEED_LIMIT = 50;

const DAY_MS = 86_400_000;

// Each language's folder and file names, in the words of that language's
// pages. .xml and not .atom: the host names a type by the extension, and Go's
// own table, which Caddy's file server reads, knows .xml and not .atom
// (docs/DEPLOY-HEADERS.md).
const FEED_DIRECTORY: Record<Locale, string> = {
  sl: "/nove-objave",
  en: "/en/new-listings",
};

const FEED_FILES: Record<Locale, Record<FeedScope, string>> = {
  sl: { all: "vse.xml", dog: "psi.xml", cat: "macke.xml", other: "ostale.xml" },
  en: { all: "all.xml", dog: "dogs.xml", cat: "cats.xml", other: "other.xml" },
};

// Whole sentences per language rather than words put together here. Kept
// out of lib/i18n.ts on purpose: that catalogue is handed to every page's
// client components, and these strings are only ever written into a file at
// build time.
const FEED_TEXT: Record<Locale, { title: string; subtitle: string }> = {
  sl: {
    title: `Nove objave na ${SITE_NAME}`,
    subtitle: `Živali na voljo za posvojitev, prvič objavljene na ${SITE_NAME} v zadnjih ${FEED_WINDOW_DAYS} dneh.`,
  },
  en: {
    title: `New listings on ${SITE_NAME}`,
    subtitle: `Animals available for adoption, first listed on ${SITE_NAME} in the last ${FEED_WINDOW_DAYS} days.`,
  },
};

// The date half of every tag: URI below, a day on which the site held its
// domain. It never changes, because an id that changes is a new entry to
// every reader that has already seen the old one.
const TAG_AUTHORITY = "tag:posvoji.si,2026-09-26:";

/** A feed's path, from the site's root. */
export function feedPath(locale: Locale, scope: FeedScope): string {
  return `${FEED_DIRECTORY[locale]}/${FEED_FILES[locale][scope]}`;
}

/** The file names a route generates for one language. */
export function feedFileParams(locale: Locale): { feed: string }[] {
  return FEED_SCOPES.map((scope) => ({ feed: FEED_FILES[locale][scope] }));
}

/** Which feed a file name is, or undefined for one that is none of them. */
export function feedScopeOf(locale: Locale, file: string): FeedScope | undefined {
  return FEED_SCOPES.find((scope) => FEED_FILES[locale][scope] === file);
}

/** "Nove objave na Posvoji.si", or with the species it covers after a colon. */
export function feedTitle(locale: Locale, scope: FeedScope): string {
  const { title } = FEED_TEXT[locale];
  if (scope === "all") return title;
  return `${title}: ${speciesScopeLabel(scope, locale).toLocaleLowerCase(locale)}`;
}

/** The feeds of one language as the head's alternate links. */
export function feedLinks(locale: Locale): { title: string; url: string }[] {
  return FEED_SCOPES.map((scope) => ({
    title: feedTitle(locale, scope),
    url: feedPath(locale, scope),
  }));
}

/** A results page's metadata with its language's feeds added to the
 *  alternates, which Next writes as <link rel="alternate"
 *  type="application/atom+xml"> in the head. The canonical and the hreflangs
 *  already there are kept. */
export function withFeedLinks(metadata: Metadata, locale: Locale): Metadata {
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      types: { "application/atom+xml": feedLinks(locale) },
    },
  };
}

/**
 * The animals a feed carries: listed in the FEED_WINDOW_DAYS before the
 * dataset was generated, newest first, ties by id as every order in
 * lib/sort.ts breaks them, at most FEED_LIMIT.
 *
 * Only animals a visitor can adopt now. An entry is an invitation to go and
 * look, and a reader keeps it as it was when it arrived, so an entry for an
 * animal on hold would go on saying so after the hold had ended. One that
 * becomes adoptable inside the window arrives then, as an entry the reader
 * has not seen.
 *
 * The listing time is listedAt, the grid's own (lib/animal.ts), so the feed
 * and the Nove objave order agree about which animal is newer.
 */
export function feedAnimals(
  animals: readonly Animal[],
  generatedAt: string,
  scope: FeedScope,
): Animal[] {
  const from = Date.parse(generatedAt) - FEED_WINDOW_DAYS * DAY_MS;
  return animals
    .flatMap((animal) => {
      const listedAt = listedAtOf(animal.source.firstSeenAt);
      if (listedAt === undefined || listedAtTime(listedAt) < from) return [];
      if (!adoptableNow(animal.status)) return [];
      if (scope !== "all" && TAB_OF_SPECIES[animal.species] !== scope) return [];
      return [{ animal, listedAt }];
    })
    .sort(
      (left, right) =>
        right.listedAt - left.listedAt || left.animal.id.localeCompare(right.animal.id),
    )
    .slice(0, FEED_LIMIT)
    .map(({ animal }) => animal);
}

/**
 * The whole feed, as an Atom document (RFC 4287).
 *
 * `updated` is the dataset's generatedAt, the time the list the feed was
 * drawn from was published. A checkout with no dataset gets an empty feed
 * dated 1970 rather than the build's own clock, which would say a list was
 * published that never was.
 */
export function buildFeed({
  dataset,
  locale,
  scope,
}: {
  dataset: Pick<Dataset, "generatedAt" | "animals"> | null;
  locale: Locale;
  scope: FeedScope;
}): string {
  const generatedAt = dataset?.generatedAt ?? new Date(0).toISOString();
  const reference = new Date(generatedAt);
  const self = `${SITE_URL}${feedPath(locale, scope)}`;
  const entries = feedAnimals(dataset?.animals ?? [], generatedAt, scope).map(
    (animal) => entry(animal, locale, reference),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">`,
    `  <id>${xml(self)}</id>`,
    `  <title>${xml(feedTitle(locale, scope))}</title>`,
    `  <subtitle>${xml(FEED_TEXT[locale].subtitle)}</subtitle>`,
    `  <updated>${new Date(generatedAt).toISOString()}</updated>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${xml(resultsUrl(locale, scope))}"/>`,
    `  <author><name>${SITE_NAME}</name><uri>${SITE_URL}</uri></author>`,
    `  <icon>${SITE_URL}/icon-192.png</icon>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}

/** What a feed route answers for one file name: the document, or a 404 for a
 *  name that is none of the feeds (which dynamicParams keeps from being asked
 *  for anyway). The type is Atom's own; the static host names it by the
 *  extension instead. */
export function feedResponse(
  locale: Locale,
  file: string,
  dataset: Pick<Dataset, "generatedAt" | "animals"> | null,
): Response {
  const scope = feedScopeOf(locale, file);
  if (!scope) return new Response(null, { status: 404 });
  return new Response(buildFeed({ dataset, locale, scope }), {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}

// The results page the feed is a copy of: the same species, in the Nove
// objave order, through the grid's own two codecs so the link cannot spell a
// parameter the page does not read.
function resultsUrl(locale: Locale, scope: FeedScope): string {
  const query = [
    serializeFilters({ ...EMPTY_FILTERS, species: scope }),
    serializeSort("newly-listed"),
  ]
    .filter(Boolean)
    .join("&");
  return `${SITE_URL}${homePath(locale)}?${query}`;
}

function entry(animal: Animal, locale: Locale, reference: Date): string {
  const listed = new Date(
    listedAtTime(listedAtOf(animal.source.firstSeenAt) ?? 0),
  ).toISOString();
  const name = animal.name ?? getMessages(locale).unnamed;
  // The card's own line as the Vse tab draws it, species first, then the
  // shelter, which the card draws on a line of its own.
  const summary = [
    ...animalMetaParts(animal, locale, reference, "all"),
    shelterWithTown(animal.shelter),
  ].join(META_SEPARATOR);
  return [
    "  <entry>",
    `    <id>${xml(entryId(animal, locale))}</id>`,
    `    <title>${xml(name)}</title>`,
    `    <link rel="alternate" type="text/html" href="${xml(`${SITE_URL}${animalPath(animal, locale)}`)}"/>`,
    // The shelter's own listing, which every animal on the site links to
    // (principle 3 in docs/DATA-POLICY.md).
    `    <link rel="via" type="text/html" href="${xml(animal.source.sourceUrl)}"/>`,
    `    <published>${listed}</published>`,
    `    <updated>${listed}</updated>`,
    `    <category term="${animal.species}" label="${xml(speciesLabel(animal.species, locale))}"/>`,
    `    <summary>${xml(summary)}</summary>`,
    "  </entry>",
  ].join("\n");
}

// A tag: URI (RFC 4151) off the animal's id, and not its address. The
// address carries the name, and a name a shelter corrects would be a new
// entry in every reader. One per language, because the two feeds are two
// documents about the animal.
function entryId(animal: Animal, locale: Locale): string {
  return `${TAG_AUTHORITY}${locale}/${encodeURIComponent(animal.id).replace(/%3A/g, ":")}`;
}

// "Zavetišče Mačja hiša, Celje", and the name alone where it already carries
// the town: "Zavetišče Horjul" does not need ", Horjul" after it.
function shelterWithTown({ name, city }: Animal["shelter"]): string {
  return name.toLocaleLowerCase("sl").includes(city.toLocaleLowerCase("sl"))
    ? name
    : `${name}, ${city}`;
}

// Text for XML, with the characters XML 1.0 cannot carry at all taken out: a
// control character typed into a listing would otherwise make the whole feed
// unreadable, not just the one entry.
const NOT_XML = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

function xml(text: string): string {
  return text
    .replace(NOT_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
