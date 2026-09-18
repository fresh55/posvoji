"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Runs a blur's teardown after the focusout that asked for it has finished
 * dispatching, rather than inside it.
 *
 * Every blur on the shelter map takes something off the plate: the region's
 * annotation, the coin's, the ring of wedges inside a drilled coin. Done
 * synchronously, React flushes that removal while the browser is still moving
 * focus, so document.activeElement is the body for that moment. The picker
 * draws the map inside a Radix dialog, whose FocusScope watches for removed
 * nodes and pulls focus back to the dialog whenever it finds it on the body.
 * Forward Tab out of a region or a coin therefore landed on the dialog element
 * instead of on the next control, and the search box, the list and the confirm
 * button were unreachable from the map: a keyboard trap around the whole plate.
 *
 * A frame and not a microtask. A microtask still runs before focus has settled,
 * and the rescue fires anyway; the next frame is the first point at which the
 * new activeElement is the one the Tab chose.
 *
 * Deferring is safe only for a teardown that checks it is still undoing its own
 * work. A frame is long enough for a pointer or a second focus to name
 * something else, and a blur arriving after that must not take the newer answer
 * down. Every caller holds the guard in its own shape: the map's two write
 * `current === mine ? null : current`, and the coin's returns early when the
 * wedges it would close are no longer the ones on screen. Whatever the new
 * focus names is written first, and the late blur then finds a different answer
 * and does nothing, which is the same order the pointer's own leave keeps.
 *
 * An unmount cancels every teardown that has not run yet.
 */
export function useDeferredBlur(): (teardown: () => void) => void {
  /** The frames the deferred teardowns are waiting on, so an unmount can cancel
   *  whatever is still outstanding.
   *
   *  A set and not one slot. Two blurs can be waiting at once, a Tab that
   *  leaves one mark and arrives on another being the ordinary way it happens,
   *  and a single slot keeps only the later frame id: the earlier teardown then
   *  survives the unmount that was meant to cancel it and runs against a plate
   *  that is no longer there. */
  const pendingRef = useRef(new Set<{ frame: number }>());
  useEffect(
    () => () => {
      for (const pending of pendingRef.current) {
        cancelAnimationFrame(pending.frame);
      }
      pendingRef.current.clear();
    },
    [],
  );

  return useCallback((teardown: () => void) => {
    // A token of our own rather than the frame id, because a test that runs
    // frames synchronously runs the callback inside the request: keyed on the
    // id, the delete would run before the add and leave the set growing by an
    // entry per blur. The id is read out of the token when the cleanup
    // cancels, by which time the request has returned either way.
    const pending: { frame: number } = { frame: 0 };
    pendingRef.current.add(pending);
    pending.frame = requestAnimationFrame(() => {
      pendingRef.current.delete(pending);
      teardown();
    });
  }, []);
}
