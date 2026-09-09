import type { Locale } from "@/lib/i18n";

/**
 * The date the shelter register was published, for the provenance line the
 * shelters index and every shelter page carry, and for the footer's own
 * freshness line.
 *
 * Its own module and not lib/labels.ts, where it was written, because of who
 * calls it. labels.ts imports the lib/filters barrel for ageInMonths and
 * FILTER_METADATA, and that barrel re-exports the filter engine, the metadata
 * tables and the URL codec. site-footer.tsx renders on every document in the
 * export and is imported by PortalShell, which is a client component, so
 * reaching labels.ts for this one function put about 7 KB gzipped of filter
 * engine into the bundles of pages that have no filters at all: measured on
 * the export, /viri and /o-nas carried a chunk holding pruneHiddenFilters and
 * the label tables that /404, with the same chrome, did not.
 *
 * Nothing here imports anything but the locale type, so a page that wants a
 * date pays for a date. labels.ts re-exports it, so the callers that already
 * hold the filter engine are unaffected and unchanged.
 *
 * Read as UTC, because a date-only string parses as UTC midnight and reading
 * it locally moves it into the previous day west of Greenwich. An unparseable
 * value prints as it was written rather than as "Invalid Date".
 *
 * Numeric in Slovenian, and not out of preference. The line reads
 * "Vir: UVHVVR ..., stanje 23. 2. 2026." and after "stanje" the date is
 * genitive: "23. februarja 2026". Intl has no genitive month, dateStyle
 * "long" gives the nominative "23. februar 2026", and the sentence shipped
 * ungrammatical on the shelters index and on every shelter page. A month
 * table of our own would be a second date formatter to keep in step with
 * this one; a numeric date has no case to get wrong at all.
 *
 * English keeps the long form. "as of 23 February 2026" is already
 * grammatical there, and that sentence is the only place either string
 * appears, so the two locales do not have to agree on shape.
 */
// Two formatters, built once. Constructing an Intl.DateTimeFormat is the
// expensive half of formatting one date, and the build calls this on every
// shelter page in both locales; the shapes never vary, so there is nothing to
// build per call.
const REGISTER_DATE_FORMAT: Record<Locale, Intl.DateTimeFormat> = {
  sl: new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }),
};

export function registerDateLabel(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return REGISTER_DATE_FORMAT[locale].format(date);
}
