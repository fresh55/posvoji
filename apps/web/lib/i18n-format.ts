import type { Locale } from "./i18n";

/**
 * The `lang` a quoted string needs, or nothing when the page already says it.
 *
 * The site prints text it did not write in either language: a shelter's own
 * description and attribution, which are always Slovenian and appear on the
 * English pages too, and the resource titles, which are mostly English and sit
 * on a Slovenian page. Unmarked, a screen reader voices all of it with the
 * page's phonemes, which for a paragraph of Slovenian read as English is not
 * an accent but an unintelligible one.
 *
 * Marked only where it says something. `lang` on every one of them would
 * repeat what `<html lang>` already states, and an attribute that is always
 * there is one nobody notices is wrong.
 */
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

