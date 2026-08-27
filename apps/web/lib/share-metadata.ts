import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";

/**
 * The one link preview this site emits, filled in four times: for an animal
 * (lib/animal-share.ts), a shelter (lib/shelter-share.ts), a municipality
 * (lib/municipality-share.ts) and the pages built from no record at all
 * (lib/page-share.ts).
 *
 * All four had written out the same Metadata object: the site name after the
 * title, the canonical, the hreflang pair, an Open Graph block and a Twitter
 * block whose card type depends on whether there is an image. Four copies of
 * one shape is four places for a tag to go missing from one page type and
 * nowhere else, which is the kind of thing nothing on screen shows.
 *
 * No node:fs here, on purpose. Two of the callers read the disk to find their
 * image; this takes the URL they already resolved, so nothing about the split
 * that keeps lib/shelter-path.ts apart from lib/shelter-share.ts applies.
 */

const SITE_NAME = "Posvoji.si";

/** What every share image on this site is drawn at: the animal cards the
 *  ingest exports and the shelter map plates the build script draws. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export type ShareImage = {
  url: string;
  /** What the picture shows. Written by the caller, which is the only side
   *  that knows whether this is an animal's card or a map plate. */
  alt: string;
};

export type ShareMetadataInput = {
  /** The title without the site name. The document title appends it; Open
   *  Graph and Twitter take it as it is, because a card already shows where
   *  it came from. */
  title: string;
  description: string;
  /** The page's own address, used as the canonical and as the OG url. */
  path: string;
  locale: Locale;
  /** "article" for a page about one animal, "website" for everything else. */
  type?: "article" | "website";
  /** The same page in both languages. Omitted where there is no second copy
   *  to point at: the municipality pages are Slovenian only, and naming an
   *  alternate that does not exist is worse than naming none. */
  languages?: Record<Locale, string>;
  image?: ShareImage;
};

export function shareMetadata({
  title,
  description,
  path,
  locale,
  type = "website",
  languages,
  image,
}: ShareMetadataInput): Metadata {
  const images = image
    ? [
        {
          url: image.url,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt: image.alt,
        },
      ]
    : undefined;

  return {
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: languages ? { canonical: path, languages } : { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
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
      images: image ? [image.url] : undefined,
    },
  };
}
