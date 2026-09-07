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
  /** The right eye was missing and had healed over. When he lost it is not
   *  recorded, so nothing says. */
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

// The three date shapes a SreckoEvent is allowed to carry, as the one place
// that decides what is a date and what is a typo. Both readers below go
// through them, so a value his page prints is a value the span arithmetic can
// also read.
const YEAR = /^\d{4}$/u;
const YEAR_MONTH = /^\d{4}-\d{2}$/u;
const YEAR_MONTH_DAY = /^\d{4}-\d{2}-\d{2}$/u;

// Built once rather than per call. Constructing an Intl.DateTimeFormat is the
// expensive half of formatting a date, and the shapes never vary.
//
// Slovenian is numeric for a full date, the same choice lib/labels.ts argues
// for registerDateLabel, and a month name where there is no day to carry:
// "marec 2019" stands on its own in a list, where "3. 2019" reads as a broken
// date rather than as a month.
//
// registerDateLabel itself is not reused. It handles the full date only, and
// importing it would pull lib/labels.ts, and through it the whole filter
// engine, into a module the poster route and the share card also read.
const MONTH_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  sl: new Intl.DateTimeFormat("sl-SI", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
};

const DAY_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  sl: new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }),
};

/** The first instant a stored date can mean, read in UTC. A date-only string
 *  parses as UTC midnight and reading it locally moves it into the previous
 *  day west of Greenwich. */
function startOf(date: string): Date | undefined {
  const iso = YEAR.test(date)
    ? `${date}-01-01`
    : YEAR_MONTH.test(date)
      ? `${date}-01`
      : YEAR_MONTH_DAY.test(date)
        ? date
        : undefined;
  if (iso === undefined) return undefined;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // The round trip is not decoration. A day past the end of its month is not
  // rejected, it is rolled over: "2019-02-30" parses as 2 March and would have
  // printed as a date he could be said to have. Only a value that reads back
  // as it was written is a date.
  return parsed.toISOString().startsWith(iso) ? parsed : undefined;
}

/**
 * One of his dates as the locale writes it, at the precision it was recorded
 * at: a year stays a year, a month prints as a month, a full date as a date.
 *
 * Undefined for anything this file does not recognise as a date, because the
 * timeline is written to read without one. A line that lost its date says
 * less; a line that printed "Invalid Date" would say something false.
 */
export function sreckoDateLabel(
  date: string,
  locale: Locale,
): string | undefined {
  if (YEAR.test(date)) return date;
  const start = startOf(date);
  if (!start) return undefined;
  return YEAR_MONTH.test(date)
    ? MONTH_FORMAT[locale].format(start)
    : DAY_FORMAT[locale].format(start);
}

/**
 * Whole months between the adoption and the death, or undefined while either
 * date is missing.
 *
 * Derived rather than stored, so the one number on his page that is a claim
 * about how long he had cannot disagree with the two dates above it. The same
 * arithmetic monthsInShelter uses in lib/labels.ts: both ends read in UTC,
 * days ignored, and a span that runs backwards is refused rather than shown
 * as zero.
 */
export function sreckoMonthsAtHome(
  timeline: readonly SreckoEvent[],
): number | undefined {
  const dateOf = (key: SreckoEventKey) =>
    timeline.find((event) => event.key === key)?.date;
  const adopted = dateOf("adopted");
  const died = dateOf("died");
  if (adopted === undefined || died === undefined) return undefined;
  const from = startOf(adopted);
  const to = startOf(died);
  if (!from || !to) return undefined;
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  return months < 0 ? undefined : months;
}
