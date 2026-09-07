import type { AdoptionStatus, Sex, Species } from "@posvoji/schema";
import type { Locale } from "@/lib/i18n";

/**
 * Srečko, the cat on the about page, as data.
 *
 * One place for what the site says about him. His page, his poster and the
 * share cards all read from here, so a fact cannot be stated one way on the
 * sheet and another way on the page.
 *
 * Nothing here names the shelter he came from or the household he went to.
 * The about page promises that nobody buys a place on the list, and sending
 * every reader to one shelter out of seventeen is the nearest thing to
 * breaking that promise. The household is out for the page's fourth fact:
 * personal details do not belong on this site.
 */

/** His page in both languages, canonical and hreflangs both, the contract
 *  ABOUT_PATHS keeps in lib/site-links.ts. Not in the roster: the page is
 *  reached from the about page's dedication and from nowhere else. */
export const SRECKO_PATHS = {
  sl: "/o-nas/srecko",
  en: "/en/about/srecko",
} as const;

/** His A4 sheet, the same shape every animal's poster route has. */
export const SRECKO_POSTER_PATHS = {
  sl: "/o-nas/srecko/plakat",
  en: "/en/about/srecko/poster",
} as const;

/**
 * The 1200x630 preview a shared link to the about page or to his page shows.
 * Drawn once, from the same render the page shows before the model loads,
 * and committed beside it.
 */
export const SRECKO_SHARE_IMAGE = {
  url: "/models/our-cat/share.jpg",
  width: 1200,
  height: 630,
  alt: {
    sl: "Srečko, bel maček s sivimi lisami in enim očesom.",
    en: "Srečko, a white cat with grey patches and one eye.",
  },
} as const satisfies {
  url: string;
  width: number;
  height: number;
  alt: Record<Locale, string>;
};

/** The three dates his page tells. "home", the years between the second and
 *  the third, is derived rather than stored. */
export type SreckoEventKey = "listed" | "adopted" | "died";

export type SreckoEvent = {
  key: SreckoEventKey;
  /**
   * "YYYY-MM-DD", "YYYY-MM" or "YYYY". Absent until it is known; an event
   * without a date is still told, without one. Filled in by the person who
   * knows, not guessed.
   */
  date?: string;
};

export type SreckoPhoto = {
  /** Under public/. EXIF stripped before it is committed, longest side no
   *  more than 1600px, and checked for anything in the background that
   *  identifies a person or a home. */
  src: string;
  width: number;
  height: number;
  alt: Record<Locale, string>;
};

export type Srecko = {
  name: string;
  species: Species;
  sex: Sex;
  status: AdoptionStatus;
  /** The site models the virus as a field on a cat and offers "Brez FeLV" as
   *  a filter, which matches only the cats that tested negative. A positive
   *  cat is the one that filter hides and the one a shelter has the hardest
   *  time placing. */
  felv: "positive";
  /** The right eye was lost before he was listed and healed over. */
  eyes: "one";
  timeline: readonly SreckoEvent[];
  /** Oldest first. Empty until the photographs are chosen and prepared. */
  photos: readonly SreckoPhoto[];
};

export const SRECKO: Srecko = {
  name: "Srečko",
  species: "cat",
  sex: "male",
  status: "adopted",
  felv: "positive",
  eyes: "one",
  timeline: [{ key: "listed" }, { key: "adopted" }, { key: "died" }],
  photos: [],
};
