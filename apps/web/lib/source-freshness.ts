import type { Locale } from "@/lib/i18n";

const formats = {
  sl: new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
};

export function verificationTime(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${formats[locale].format(date)} (Ljubljana)` : "—";
}

// The date alone, for the animal's footnote and the home hero. The minute and
// the timezone are the list's provenance, and the footer still prints them
// with verificationTime above; on one animal the question is whether the
// listing was seen today, which a date answers and an hour only lengthens,
// and in the hero the hour cost a second line on every phone (site-page.tsx).
//
// Numeric in Slovenian for the reason lib/date-label.ts gives: Intl has no
// genitive month, so a named month in a Slovenian sentence comes out in the
// wrong case. This line reads "Foto: Zavetišče Horjul · Preverjeno 5. 9. 2026"
// and a numeric date has no case to get wrong. English keeps the medium form.
//
// Built once, like the pair above: the export formats this for every animal in
// both locales, and constructing the formatter is the expensive half.
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

export function sourceIsOld(value: string | undefined, now: number): boolean {
  const time = value === undefined ? NaN : Date.parse(value);
  return !Number.isFinite(time) || time > now + 300000 || now - time > 30 * 3600000;
}
