import type { Locale } from "@/lib/i18n";

const formats = {
  sl: new Intl.DateTimeFormat("sl-SI", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Ljubljana" }),
};

export function verificationTime(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${formats[locale].format(date)} (Ljubljana)` : "—";
}

export function sourceIsOld(value: string | undefined, now: number): boolean {
  const time = value === undefined ? NaN : Date.parse(value);
  return !Number.isFinite(time) || time > now + 300000 || now - time > 30 * 3600000;
}
