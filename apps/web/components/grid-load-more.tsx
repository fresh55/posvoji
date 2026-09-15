"use client";

import type { Ref } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { CARDS_PER_CLICK } from "@/components/grid-rendering";
import { COARSE_ACTION } from "@/lib/link-styles";

/**
 * The tail of an incrementally drawn grid.
 *
 * While the automatic budget lasts it is the sentinel the step watches, and
 * once the budget is spent it is the button that replaces it, with the count
 * under it that says how much of the list is on the page. The count stays
 * after the button has run the list out, to say so. Written once because two
 * grids draw it, the home page's and a shelter's own, and the promise under
 * the button has to be kept in the same words on both.
 *
 * Rendered inside the grid element: col-span-full is what gives it a row of
 * its own, and the step measures its columns off that same element.
 */
export function GridLoadMore({
  hasMore,
  settled,
  watchSentinel,
  showMore,
  drawn,
  total,
}: {
  /** Whether the list holds more than the grid has drawn. */
  hasMore: boolean;
  /** Whether the automatic budget is spent, from then on only the button grows the grid. */
  settled: boolean;
  /** The sentinel's ref callback, which owns the observer (use-incremental-grid.ts). */
  watchSentinel: Ref<HTMLDivElement>;
  showMore: () => void;
  /** How many cards are on the page. */
  drawn: number;
  /** How many the list holds. */
  total: number;
}) {
  const { t } = useI18n();

  // Nothing to read and nothing to press: it exists so the observer has
  // something to watch, and it says so rather than adding a nameless row to
  // the grid a screen reader has to walk past.
  if (!settled) {
    // Before the budget is spent there is nothing to say about a list that is
    // already whole. A shelter with a dozen animals draws every one of them on
    // the first render, so it never had a button, never had a count, and is
    // owed no line saying the list ended.
    if (!hasMore) return null;
    return (
      <div
        ref={watchSentinel}
        aria-hidden
        // The e2e suite's own hook, alongside every other data-* selector in
        // this app: nothing here to find by role or text, so a class name
        // would otherwise be the only handle, and this element's classes are
        // layout and not contract.
        data-grid-sentinel
        className="col-span-full h-px"
      />
    );
  }

  // What replaces the sentinel once the budget is spent. The count under the
  // button is the transparency the sentinel never owed anyone: how much of
  // the list is on the page, and how much a press still stands between the
  // reader and the footer.
  //
  // The row outlives the button. The last press used to take the count away
  // with the control, so the grid ended on a half-row of cards and some ninety
  // pixels of nothing above the footer rule, with the counter stopped at "360
  // od 486" and never finished. The button goes, the line stays and says the
  // list ran out.
  return (
    <div className="col-span-full flex flex-col items-center gap-2 py-2">
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={showMore}
          // Real height on a coarse pointer, not a tap-target overlay: this
          // is the one control at the bottom of the list, and h-8 is short of
          // what a thumb needs. The pointer and not the width, so a touch tablet
          // past lg gets it and a narrow mouse window does not.
          className={COARSE_ACTION}
        >
          {t("showMoreAnimals", { n: Math.min(CARDS_PER_CLICK, total - drawn) })}
        </Button>
      )}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {hasMore
          ? t("shownOfTotal", { shown: drawn, total })
          : t("allShown", { total })}
      </p>
    </div>
  );
}
