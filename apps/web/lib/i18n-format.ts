import type { Locale } from "./i18n";

/** Mark quoted text when its language differs from the page for screen readers. */
export function quotedLang(
  textLocale: Locale,
  pageLocale: Locale,
): Locale | undefined {
  return textLocale === pageLocale ? undefined : textLocale;
}

// Fills {name} placeholders. Exported because the portal keeps its own
// Slovenian-only strings outside Messages but writes placeholders the same way.
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template,
  );
}
