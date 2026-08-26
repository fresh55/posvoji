"use client";

import { useCallback, useMemo, useState } from "react";

// How many cards the first render draws, and how many each step after it adds.
// Neither grid that uses this is paginated, so the home page's Vse used to
// mount all 503 matches at once: about fourteen thousand nodes, a thousand tab
// stops and a 66,000px page, all of it in the prerendered HTML as well. The
// busiest shelter page (Mačja hiša, 186 animals) did the same on its own
// scale. Sixty is several screens on the tallest phone and more than a desktop
// first paint can show, and the steps after it are asked for well before
// anyone reaches the bottom.
//
// Rendering only. Every count on the page, the facet numbers and the dialog's
// sibling list all still read the whole filtered set.
export const INITIAL_CARDS = 60;
const CARDS_PER_STEP = 60;

// How far below the last drawn card the next step is asked for, so the grid is
// already longer by the time the visitor gets there.
const STEP_MARGIN = "1200px 0px";

/**
 * How much of a sorted list is drawn, and the ref that grows it.
 *
 * The count is held together with the list it was counted against, so it
 * answers for that list and no other: any filter, sort or species move hands
 * down a different array, the count stops applying, and the grid is read from
 * its top again. No effect has to notice and no render of the new list is ever
 * made against the old one's count.
 *
 * `watchSentinel` goes on an element below the last drawn card. Both grids
 * draw that element only while `hasMore`, and both give it
 * `data-grid-sentinel` so the e2e suite has a handle on it.
 */
export function useCardWindow<Item>(sorted: Item[]) {
  const [chunk, setChunk] = useState<{ of: Item[]; drawn: number }>({
    of: sorted,
    drawn: INITIAL_CARDS,
  });
  const drawn = chunk.of === sorted ? chunk.drawn : INITIAL_CARDS;
  // slice clamps, so the whole list and a prefix of it are the same call.
  const page = useMemo(() => sorted.slice(0, drawn), [sorted, drawn]);
  const hasMore = drawn < sorted.length;

  // The sentinel's own ref is the observer's lifetime, and that lifetime is one
  // sorted list rather than one step: the callback closes over the list alone,
  // so a step does not take the observer down and put a new one up. What
  // delivers the next entry is the sentinel leaving the watched band and coming
  // back, which a step of sixty cards guarantees, being far more than the
  // 1200px margin below. The step is a functional update for the same reason:
  // it reads the count off the state it is updating rather than off a closure
  // that would have to be rebuilt to stay current.
  const watchSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // jsdom, and anything else with no observer, gets the whole list rather
      // than a grid with no way to grow.
      if (typeof IntersectionObserver === "undefined") {
        setChunk({ of: sorted, drawn: sorted.length });
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            // The same guard the render reads the count through: a count
            // counted against another list starts again from the top.
            setChunk((previous) => ({
              of: sorted,
              drawn:
                (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
                CARDS_PER_STEP,
            }));
          }
        },
        { rootMargin: STEP_MARGIN },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [sorted],
  );

  return { page, hasMore, watchSentinel };
}
