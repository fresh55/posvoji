import type { Locale } from "@/lib/i18n";

const formats = {
  sl: new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
};

export function verificationTime(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${formats[locale].format(date)} (Ljubljana)` : "—";
}

// Cache formatters for the animal footnote and home hero. Numeric Slovenian
// dates avoid the month-case limitation described in lib/date-label.ts.
const dateFormats: Record<Locale, Intl.DateTimeFormat> = {
  sl: new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Ljubljana",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/Ljubljana",
  }),
};

export function verificationDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormats[locale].format(date) : "—";
}

/**
 * Whether a source check is old enough to warn about, and whether it can be
 * read at all.
 *
 * `known` and not a formatted age. This used to return the elapsed time as
 * words, and the animal footnote printed them under the absolute date one line
 * above; that sentence is gone, and with it the two Intl.RelativeTimeFormat
 * instances and the hours-versus-days branch that built it on every tick of
 * the component's minute timer. What the one caller actually asks is whether
 * the timestamp parsed, which is a boolean.
 */
export function sourceFreshness(
  value: string | undefined,
  now: number,
): { isOld: boolean; known: boolean } {
  const time = value === undefined ? NaN : Date.parse(value);
  // Allow minor clock skew, but treat missing or unreliable checks as unknown.
  if (!Number.isFinite(time) || time > now + 300000) {
    return { isOld: true, known: false };
  }
  return { isOld: Math.max(0, now - time) > 30 * 3600000, known: true };
}
