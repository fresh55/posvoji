import type { Metadata, Viewport } from "next";
import { getMessages, type Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

/**
 * The site's name, as og:site_name states it and as the root's title template
 * ends every title.
 *
 * Exported because the other two metadata builders, animalMetadata and
 * shelterMetadata, name the same site on their cards.
 */
export const SITE_NAME = "Posvoji.si";

/**
 * One page's address in both languages, as the head's canonical and its set
 * of hreflangs.
 *
 * Every caller builds the same three-line shape off a locale-keyed pair of
 * paths, and the shape is the part worth writing once: which of the two is
 * canonical follows from the locale being rendered, and the languages map
 * always names both, including the page itself.
 *
 * x-default is the Slovenian half. Google defines that value as the version
 * that targets no particular language, and Slovenian is the one that owns the
 * unprefixed routes: /zavetisca is the address, /en/shelters is the
 * translation. The argument for pointing it at English, that a reader of
 * neither language is likelier to read English, is a reasonable thing to want
 * and a weaker hreflang claim, so it is recorded here and not taken. The head
 * and app/sitemap.ts say the same thing, which is the agreement the comment in
 * that file is keeping.
 *
 * Here rather than beside shelterMetadata, where it started, because the
 * static pages need it too and lib/shelter-share.ts opens node:fs at its top
 * level. This module is plain string work and safe to import from anywhere.
 */
export function localeAlternates(
  paths: Record<Locale, string>,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: paths[locale],
    languages: { ...paths, "x-default": paths.sl },
  };
}

/** The one spelling OpenGraph accepts for each of the two languages. */
export function openGraphLocale(locale: Locale): string {
  return locale === "sl" ? "sl_SI" : "en_GB";
}

/**
 * What every root layout puts in its head, written once.
 *
 * There is no layout above app/(sl) and app/(en)/en, so anything either of
 * them needs has to be written in both. It was three fields twice, which is
 * how a fourth one lands in one file and not the other. This is that one
 * place.
 *
 * The template is why the callers below hand back a bare title. Next appends
 * the suffix to whatever a page sets, so a page that spells it itself gets it
 * twice; `default` is what a page with no title of its own renders, which is
 * the bare site name the two roots used to set by hand. It reaches the poster
 * routes too, and those set an absolute title to stay out of it, with the
 * reason written down beside it.
 *
 * The share cards are unaffected: Next derives the OpenGraph and Twitter title
 * templates from openGraph.title.template and twitter.title.template, never
 * from this one, so the bare card titles staticPageMetadata is careful about
 * stay bare.
 */
export function rootMetadata(locale: Locale): Metadata {
  return {
    // Link previews need absolute URLs, and a static export has no request to
    // build one from, so every relative URL in the tree is resolved against
    // this.
    metadataBase: new URL(SITE_URL),
    title: { template: `%s | ${SITE_NAME}`, default: SITE_NAME },
    description: getMessages(locale).metadataDescription,
  };
}

/**
 * The viewport both roots declare.
 *
 * viewportFit: without it env(safe-area-inset-*) resolves to 0 on iOS: the
 * page draws under the notch and home indicator, but nothing is told it may.
 *
 * themeColor as a media pair rather than one value, because the site follows
 * the OS preference and offers no toggle (app/globals.css). Without it Android
 * Chrome's toolbar keeps its own default above a page that is pure white or
 * near-black, so the top of the screen never matches the site in either theme.
 * Hex and not the oklch() the tokens are written in, because meta theme-color
 * support for oklch is not universal; these two are the sRGB values of
 * oklch(1 0 0) and oklch(0.145 0 0), the light and dark --background.
 */
export const rootViewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

/**
 * The card a fixed page shows when it has none of its own, drawn by
 * scripts/build-og-card.mjs.
 *
 * One card for both languages. It carries the mark, the wordmark and the
 * sentence the head's description already states, and no per-page text, so
 * there is nothing on it a locale split would translate. The plates take the
 * same line for the same reason.
 */
const SITE_CARD = { url: "/og-card.png", width: 1200, height: 630 };

// The card is set in Slovenian in both languages, the way the shelter plates
// are. The alternative text is not: it is read out to somebody who asked for
// the page in one language or the other.
const siteCardAlt = {
  sl: "Posvoji.si: odprt indeks živali iz slovenskih zavetišč, ki iščejo dom.",
  en: "Posvoji.si: an open index of animals from Slovenian shelters looking for a home.",
} satisfies Record<Locale, string>;

export type StaticPageInput = {
  locale: Locale;
  /** The same page's path in each language, canonical and hreflangs both. */
  paths: Record<Locale, string>;
  /**
   * The page's own name, without the site suffix. The root layout's title
   * template appends "| Posvoji.si", so every route spells the suffix the
   * same way and no page spells it itself; the previews use the bare name,
   * because og:site_name already carries it and a card that reads
   * "Zavetišča | Posvoji.si" under the word Posvoji.si says it twice.
   */
  title: string;
  description: string;
  /**
   * A 1200x630 preview of the page's own, when it has one. Most fixed pages
   * do not and take the site card instead, drawn once for all of them. The url
   * is relative to the site; the roots set metadataBase, so Next resolves it.
   */
  image?: { url: string; width: number; height: number; alt: string };
};

/**
 * Everything a shared link to one of the site's fixed pages needs: the title
 * and description the page already had, its own address and the other
 * language's copy of it, and the preview blocks.
 *
 * The detail pages have carried all of this since animalMetadata and
 * shelterMetadata were written. The pages around them carried a title and a
 * description and nothing else: the two front doors said only "Posvoji.si",
 * in both languages, and a link to any of them pasted into a chat had no
 * card at all.
 *
 * The site card is the default. The site draws three kinds now: a share card
 * per animal, drawn by the ingest export, a map plate per shelter, drawn by
 * scripts/build-shelter-plates.mjs, and one card for the site itself, drawn by
 * scripts/build-og-card.mjs. Until that third one existed these pages emitted
 * no og:image at all, so the two front doors, the shelters index, the
 * found-animal page and the resources page were the only links from this
 * domain that pasted into a chat as a bare row of text. A page with a picture
 * of its own, the about page and the cat's, passes it as `image` and shows
 * that instead.
 *
 * Every page therefore asks for the large card. summary was the shape for a
 * page with nothing to show, and no page is in that state any more.
 */
export function staticPageMetadata({
  locale,
  paths,
  title,
  description,
  image,
}: StaticPageInput): Metadata {
  const images = [image ?? { ...SITE_CARD, alt: siteCardAlt[locale] }];
  return {
    title,
    description,
    alternates: localeAlternates(paths, locale),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: openGraphLocale(locale),
      title,
      description,
      url: paths[locale],
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}
