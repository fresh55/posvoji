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

const relativeFormats: Record<Locale, Intl.RelativeTimeFormat> = {
  sl: new Intl.RelativeTimeFormat("sl-SI", { numeric: "always" }),
  en: new Intl.RelativeTimeFormat("en-GB", { numeric: "always" }),
};

export function sourceFreshness(
  value: string | undefined,
  locale: Locale,
  now: number,
): { isOld: boolean; age: string | null } {
  const time = value === undefined ? NaN : Date.parse(value);
  // Allow minor clock skew, but treat missing or unreliable checks as unknown.
  if (!Number.isFinite(time) || time > now + 300000) {
    return { isOld: true, age: null };
  }
  const elapsed = Math.max(0, now - time);
  // Keep hours through the first two days so a 31-hour check is distinct
  // from one a full two days old. Longer gaps use completed days.
  const hours = Math.floor(elapsed / 3600000);
  return {
    isOld: elapsed > 30 * 3600000,
    age: hours < 48
      ? relativeFormats[locale].format(-hours, "hour")
      : relativeFormats[locale].format(-Math.floor(hours / 24), "day"),
  };
}
