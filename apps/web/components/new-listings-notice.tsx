"use client";

import { CalendarPlus } from "lucide-react";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import type { Locale, TranslationKey } from "@/lib/i18n";
import { pick } from "@/lib/labels";
import { cn } from "@/lib/utils";

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

// The button's pronoun follows how many listings there are rather than the
// numeral's grammar: 101 takes "nova objava", and they are still "jih".
function buttonKey(count: number): TranslationKey {
  if (count === 1) return "showNewListingsFirstOne";
  if (count === 2) return "showNewListingsFirstTwo";
  return "showNewListingsFirstMany";
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
 * own mark from the sort menu (sort-picker.tsx), because pressing it is
 * choosing that order.
 *
 * Nothing is drawn at zero, which is every first visit, every server render
 * and the hydrating one (useNewListingCount in hooks/use-last-visit.ts). The
 * caller hides it under the Nove objave order itself, where the new listings
 * are already first and the button would do nothing.
 *
 * It arrives after hydration, into a place the blocking script before the
 * grid has held since the first paint (lib/last-visit.ts, the rule in
 * app/globals.css), so its height is fixed and the rule states it: two lines
 * on a phone, the sentence over its button, 60px, and one 32px row from sm.
 * The sentence is short enough for one line at 320px with a three-digit count
 * (239px of the 288 there); "od tvojega zadnjega obiska" was 292px and
 * wrapped.
 */
export function NewListingsNotice({
  count,
  onShowFirst,
  className,
}: {
  /** New listings among the results on screen, from useNewListingCount. */
  count: number;
  /** Switches the grid to the Nove objave order. */
  onShowFirst: () => void;
  className?: string;
}) {
  const { locale, t } = useI18n();
  if (count <= 0) return null;
  return (
    <div
      data-slot="new-listings-notice"
      className={cn(
        "flex flex-col items-start gap-2 text-sm sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <p>{t(sentenceKey(count, locale), { count })}</p>
      {/* 32px drawn and 44px to a thumb through tap-target's overlay, rather
          than a 44px box: the rule in app/globals.css holds this line's
          place at the height drawn here. */}
      <Button
        variant="outline"
        size="sm"
        className="pointer-coarse:tap-target"
        onClick={onShowFirst}
      >
        <CalendarPlus
          className="text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        {t(buttonKey(count))}
      </Button>
    </div>
  );
}
