import type { ClientAnimal } from "@/lib/animal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cardLink,
  CARDS_PER_CLICK,
  gridColumns,
  INITIAL_CARDS,
  ROWS_PER_STEP,
  ROWS_PER_STEP_BEHIND_DIALOG,
  STEP_MARGIN,
  TARGET_ROWS,
} from "./grid-rendering";

export function useIncrementalGrid(
  sorted: ClientAnimal[],
  isDialogOpen: boolean,
) {
  // Whether a dialog stands over the grid, which is the automatic step's own
  // question: behind one, a step commits fewer rows
  // (ROWS_PER_STEP_BEHIND_DIALOG above).
  //
  // A ref, and not a dependency of watchSentinel below. That callback's
  // lifetime is one sorted list on purpose, because the callback is the
  // sentinel's own ref: rebuilding it takes the observation down and puts a
  // fresh one up, and a fresh observation is always delivered an initial entry.
  // Closed over the open animal, the callback would be rebuilt on every open
  // and every close, so opening a dialog would itself ask for a step nobody
  // scrolled for, and it would ask with the sentinel sitting wherever the last
  // step left it. The callback reads the ref at the moment it computes a step,
  // which is the moment the answer has to be true for.
  //
  // Kept current by an effect rather than written during the render. A render
  // is not a commit: React can throw one away before it lands, and a ref
  // moved by a render that was thrown away would be answering for a dialog
  // that never appeared.
  const dialogOpen = useRef(false);
  useEffect(() => {
    dialogOpen.current = isDialogOpen;
  }, [isDialogOpen]);

  // How much of that list is on the page. The count is held together with the
  // list it was counted against, so it answers for that list and no other: any
  // filter, sort or species move hands down a different array, the count stops
  // applying, and the grid is read from its top again. No effect has to notice
  // and no render of the new list is ever made against the old one's count.
  // `settled` is the auto-step budget being spent: from then on the grid only
  // grows by the button below, and a new list starts the budget over.
  const [chunk, setChunk] = useState<{
    of: ClientAnimal[];
    drawn: number;
    settled: boolean;
  }>({
    of: sorted,
    drawn: INITIAL_CARDS,
    settled: false,
  });
  const drawn = chunk.of === sorted ? chunk.drawn : INITIAL_CARDS;
  const settled = chunk.of === sorted && chunk.settled;
  // slice clamps, so the whole list and a prefix of it are the same call.
  const page = useMemo(() => sorted.slice(0, drawn), [sorted, drawn]);
  const hasMore = drawn < sorted.length;

  // The grid itself, which two things read: the button's focus move below, and
  // the step above it, which measures the drawn columns off this element.
  const gridRef = useRef<HTMLDivElement>(null);

  // The sentinel's own ref is the observer's lifetime, and that lifetime is one
  // sorted list rather than one step: the callback closes over the list alone,
  // so a step does not take the observer down and put a new one up, and neither
  // does a dialog opening over the grid, which is why the open state is the ref
  // above and not a dependency here. The step is a functional update for the
  // same reason: it reads the count off the state it is updating rather than
  // off a closure that would have to be rebuilt to stay current.
  //
  // What a step does have to do is re-arm the observation, which is the
  // unobserve and observe pair at the end of the callback. This used to be left
  // to the geometry, on the reasoning that a step already delivers the next
  // entry by moving the sentinel: fifteen rows is some 4,500px even at two
  // columns, far past the 1200px margin below, so the sentinel leaves the
  // watched band and comes back. It does leave. Whether the browser says so is
  // a different question, and an observer reports a change of state and nothing
  // else, so across a step it is still holding "intersecting" and only a
  // delivered leave can move it off that.
  //
  // A reader who is at the end of the document when a step lands grows the page
  // entirely below the viewport, where nothing that is painted changes.
  // Measured on 28 August 2026, Chrome delivered that leave on some loads of
  // that shape and not others: two of three loads at 1440x900 in a headed
  // browser missed it, and 1280x800 and 1920x1080 the same. A missed leave was
  // permanent, because no further entry could ever arrive. The grid stopped at
  // one step, the sentinel never gave way to the button, and four hundred of
  // the five hundred animals had no way onto the page at all.
  //
  // Re-arming does not depend on a transition. A fresh observation is always
  // delivered an initial entry, measured against wherever the sentinel stands
  // by then, so the grid either takes the next step or waits for a real scroll,
  // and neither of those is something the browser has to volunteer.
  //
  // Behind an open dialog the re-arm is the whole of what carries the grid on.
  // A three-row step is shorter than the watched band rather than several times
  // it, so the sentinel never leaves the band at all, and every fresh
  // observation delivers the entry that takes the next small step. The grid
  // reaches the same budget it always does, in more steps and one task each.
  const watchSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // jsdom, and anything else with no observer, gets the whole list rather
      // than a grid with no way to grow.
      if (typeof IntersectionObserver === "undefined") {
        setChunk({ of: sorted, drawn: sorted.length, settled: true });
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            // Cards per row, so both the step and the budget below are the
            // row counts they are written as.
            const columns = gridColumns(gridRef.current);
            // The same guard the render reads the count through: a count
            // counted against another list starts again from the top.
            //
            // Clamped at the budget, so the last step is what is left of it
            // rather than a full stride past it. Unclamped, three columns once
            // went 60, 105, 150: fifty rows drawn where TARGET_ROWS then
            // promised forty-five, and some 1,500px of page nobody asked for.
            // A short last step is nothing for the re-arm below to worry
            // about either, because a step that reaches the budget settles,
            // and settling unmounts the sentinel. Only a step that stops short
            // of the budget has a sentinel left to deliver anything, whichever
            // of the two strides it took.
            const budget = TARGET_ROWS * columns;
            // How wide this step is. Behind an open dialog it is the small
            // one, so what commits while somebody is dragging the photo fan is
            // a dozen cards rather than sixty. Read off the ref as the entry
            // arrives, rather than closed over when the observer was made,
            // which is the whole reason the ref exists (dialogOpen above).
            const rows = dialogOpen.current
              ? ROWS_PER_STEP_BEHIND_DIALOG
              : ROWS_PER_STEP;
            // A plain update, not a transition, on purpose. A transition
            // would let React yield partway through rendering the step, but
            // the re-arm below is measured at the next frame against wherever
            // the sentinel stands by then. With the step still rendering it
            // stands where it was, inside the band, and that entry would take
            // a second step nobody scrolled for. A plain update renders in
            // one task, ahead of that frame, so the fresh observation sees
            // the sentinel the step moved. What bounds the commit behind a
            // dialog is the small stride above, which needs no slicing.
            setChunk((previous) => {
              const drawn = Math.min(
                (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
                  rows * columns,
                budget,
              );
              return { of: sorted, drawn, settled: drawn >= budget };
            });
            // The re-arm. Nothing else asks this observer for another entry.
            observer.unobserve(node);
            observer.observe(node);
          }
        },
        { rootMargin: STEP_MARGIN },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [sorted],
  );

  // The button's step, once the automatic budget above is spent. Focus moves
  // to the first card the press added: the reading position a screen reader
  // or a keyboard should resume from, and the button itself can unmount when
  // the list runs out, which would otherwise drop focus on <body>.
  //
  // A ref rather than state: nothing renders from this, it only says which
  // card the next paint should hand focus to. The effect below runs off the
  // count the press changed, so it lands after those cards exist.
  const focusOrdinal = useRef<number | null>(null);
  const showMore = useCallback(() => {
    focusOrdinal.current = drawn;
    setChunk((previous) => ({
      of: sorted,
      drawn:
        (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
        CARDS_PER_CLICK,
      settled: true,
    }));
  }, [drawn, sorted]);
  useEffect(() => {
    const ordinal = focusOrdinal.current;
    if (ordinal === null) return;
    focusOrdinal.current = null;
    cardLink(gridRef.current?.querySelectorAll("article")[ordinal])?.focus();
  }, [drawn]);

  return { page, drawn, hasMore, settled, gridRef, watchSentinel, showMore };
}
