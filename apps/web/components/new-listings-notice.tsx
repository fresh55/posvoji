"use client";

import { useEffect } from "react";
import { SORT_ICONS } from "@/components/filters/sort-picker";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import { useNewListingCount, useVisitRead } from "@/hooks/use-last-visit";
import type { AnimalFields } from "@/lib/animal";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { pick, tabPronoun } from "@/lib/labels";
import { NEW_LISTINGS_DATASET_KEY, NEW_LISTINGS_SLOT } from "@/lib/last-visit";

const NewestFirst = SORT_ICONS["newly-listed"];

// Slovenian takes the sentence's form from the count's last two digits, the
// ladder pick() already owns; English from whether the count is one.
function sentenceKey(count: number, locale: Locale): TranslationKey {
  if (locale === "en") return count === 1 ? "newListingsOne" : "newListingsMany";
  return pick(count, [
    "newListingsOne",
    "newListingsTwo",
    "newListingsFew",
    "newListingsMany",
  ]) as TranslationKey;
}

/**
 * The notice's place above the cards, and the visit it reads. Its own
 * component so that reading the visit, which every page does once it has
 * hydrated, renders this and not the grid around it.
 *
 * Held open before the first paint while the script before the grid expects a
 * notice (lib/last-visit.ts, the rule in app/globals.css), and out of the
 * column's gap whenever it is empty. The place goes back to the layout once
 * the visit has been read, in the commit that draws the notice or finds
 * nothing to draw: an effect, so the notice is already standing in the place
 * it takes over.
 */
export function NewListings({
  animals,
  reference,
  hidden,
  onShowFirst,
}: {
  /** The results on screen. */
  animals: readonly Pick<AnimalFields, "listedAt" | "status">[];
  reference: Date;
  /** Under the Nove objave order, where the new listings are already first. */
  hidden: boolean;
  onShowFirst: () => void;
}) {
  const count = useNewListingCount(animals, reference);
  const visitRead = useVisitRead(reference);
  useEffect(() => {
    if (!visitRead) return;
    delete document.documentElement.dataset[NEW_LISTINGS_DATASET_KEY];
  }, [visitRead]);
  return (
    <div data-slot={NEW_LISTINGS_SLOT}>
      {!hidden && <NewListingsNotice count={count} onShowFirst={onShowFirst} />}
    </div>
  );
}

/**
 * The line above the cards for a returning visitor: how many of the results
 * were listed since their last visit, and one button that puts them first.
 *
 * The default order is the longest wait first, on purpose, so this week's
 * listings sit at the end of it; this is the way to them, offered only to
 * the visitor who has a last visit to count from and only while there is
 * something to count. One plain sentence and one button that names what comes
 * back, the shape every offer on the site takes. The button wears the order's
 * own mark from the sort menu, because pressing it is choosing that order.
 *
 * Nothing is drawn at zero, which is every first visit, every server render
 * and the hydrating one (useNewListingCount in hooks/use-last-visit.ts).
 *
 * Its height is fixed, and the rule in app/globals.css that holds its place
 * states it: two lines on a phone, the sentence over its button, 60px, and
 * one 32px row from sm. The sentence is short enough for one line at 320px
 * with a three-digit count (239px of the 288 there); "od tvojega zadnjega
 * obiska" was 292px and wrapped.
 */
export function NewListingsNotice({
  count,
  onShowFirst,
}: {
  /** New listings among the results on screen, from useNewListingCount. */
  count: number;
  /** Switches the grid to the Nove objave order. */
  onShowFirst: () => void;
}) {
  const { locale, t } = useI18n();
  if (count <= 0) return null;
  return (
    <div
      data-slot="new-listings-notice"
      className="flex flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:gap-3"
    >
      <p>{t(sentenceKey(count, locale), { count })}</p>
      {/* 32px drawn and 44px to a thumb through tap-target's overlay, rather
          than a 44px box: the rule in app/globals.css holds this line's
          place at the height drawn here. The pronoun follows how many
          listings there are rather than the numeral's grammar: 101 takes
          "nova objava", and they are still "jih". */}
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:tap-target"
        onClick={onShowFirst}
      >
        <NewestFirst
          className="text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        {t("showNewListingsFirst", { them: tabPronoun(count, "all", locale) })}
      </Button>
    </div>
  );
}
