import { GOOD_WITH_KEYS, type GoodWithKey } from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";

const LEAD_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithLeadKids",
  dogs: "goodWithLeadDogs",
  cats: "goodWithLeadCats",
};

const TAIL_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithTailKids",
  dogs: "goodWithTailDogs",
  cats: "goodWithTailCats",
};

/**
 * "z otroki, psi in mačkami": who the animal gets along with, as the words
 * that follow "se razume". In the fixed facet order, so the sentence does not
 * reshuffle as picks are made. The first phrase carries the preposition, which
 * in Slovenian depends on the word after it, and the rest go without. Commas
 * and the joining word are the sentence's own punctuation; the words being
 * joined all come from the message catalogue.
 */
export function goodWithPhrase(
  keys: readonly GoodWithKey[],
  t: (key: TranslationKey) => string,
): string {
  const phrases = GOOD_WITH_KEYS.filter((key) => keys.includes(key)).map(
    (key, index) => t(index === 0 ? LEAD_KEYS[key] : TAIL_KEYS[key]),
  );
  if (phrases.length < 2) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${t("goodWithJoiner")} ${phrases[phrases.length - 1]}`;
}
