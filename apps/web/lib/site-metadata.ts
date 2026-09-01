import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";

/**
 * The site's name, as og:site_name states it and as every title ends.
 *
 * Exported because the other two metadata builders, animalMetadata and
 * shelterMetadata, end their titles the same way and name the same site.
 */
export const SITE_NAME = "Posvoji.si";

/**
 * One page's address in both languages, as the head's canonical and its pair
 * of hreflangs.
 *
 * Every caller builds the same three-line shape off a locale-keyed pair of
 * paths, and the shape is the part worth writing once: which of the two is
 * canonical follows from the locale being rendered, and the languages map
 * always names both, including the page itself.
 *
 * Here rather than beside shelterMetadata, where it started, because the
 * static pages need it too and lib/shelter-share.ts opens node:fs at its top
 * level. This module is plain string work and safe to import from anywhere.
 */
export function localeAlternates(
  paths: Record<Locale, string>,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  return { canonical: paths[locale], languages: paths };
}

/** The one spelling OpenGraph accepts for each of the two languages. */
export function openGraphLocale(locale: Locale): string {
  return locale === "sl" ? "sl_SI" : "en_GB";
}

export type StaticPageInput = {
  locale: Locale;
  /** The same page's path in each language, canonical and hreflangs both. */
  paths: Record<Locale, string>;
  /**
   * The page's own name, without the site suffix. The head's title gets
   * "| Posvoji.si" appended here so every route spells the suffix the same
   * way; the previews use the bare name, because og:site_name already
   * carries it and a card that reads "Zavetišča | Posvoji.si" under the word
   * Posvoji.si says it twice.
   */
  title: string;
  description: string;
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
 * No image. The site draws two kinds and neither is generic: a share card per
 * animal, drawn by the ingest export, and a map plate per shelter, drawn by
 * scripts/build-shelter-plates.mjs. There is nothing in public/ that a fixed
 * page could use at 1200x630, so these emit no og:image and take the plain
 * summary card, which is the shape shelterMetadata already falls back to when
 * a plate is missing. If a site-wide card is ever drawn, it is added here once
 * and every fixed page gets it.
 */
export function staticPageMetadata({
  locale,
  paths,
  title,
  description,
}: StaticPageInput): Metadata {
  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: localeAlternates(paths, locale),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: openGraphLocale(locale),
      title,
      description,
      url: paths[locale],
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
