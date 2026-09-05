"use client";

import { useCallback, useEffect, useRef } from "react";

// deltaMode 1 counts lines rather than pixels, which is what a real wheel
// reports on Firefox. One line is about one line of text.
const WHEEL_DELTA_LINE = 1;
const WHEEL_LINE_PX = 16;

/**
 * What a surface asks of a horizontal wheel gesture.
 *
 * The numbers are ratios of the element's own width rather than pixels, so one
 * trackpad swipe means the same thing on a phone-width stage and on a desktop
 * one. lib/swipe.ts holds the values every surface here shares.
 */
export type WheelStepOptions = {
  /** Off while there is nowhere to step. A disabled gesture is left entirely
   *  alone: nothing is prevented, so the browser still does what it would. */
  enabled: boolean;
  /** The share of the width the travel crosses to commit one step. */
  commitRatio: number;
  /** The share of the width one whole step is worth, which is what `onTravel`
   *  reports against. Usually wider than `commitRatio`: the thing being pulled
   *  in starts more than half a width away, and matching the two would make
   *  the gesture feel geared down. Belongs with `onTravel` and is read only
   *  alongside it, so a surface with nothing to move under the gesture leaves
   *  both out. */
  spanRatio?: number;
  /** How quiet it has to go before the gesture is over. The browser keeps
   *  sending deltas while the inertia decays, so once a step is spent
   *  everything up to this much silence belongs to the same swipe rather than
   *  turning four pages on one flick. */
  settleMs: number;
  /** How far the gesture has travelled, in steps: -1 is one whole step back.
   *  Called on every event until a step is spent, and never after it. Left out
   *  by a surface with nothing to move under the gesture. */
  onTravel?: (fraction: number) => void;
  onStep: (direction: -1 | 1) => void;
  /** The settle window closing, and whether the gesture turned a step. A
   *  caller that moved something under `onTravel` puts it back when it did
   *  not; a spent gesture has already handed that over to the step. */
  onSettle?: (spent: boolean) => void;
};

/**
 * One horizontal trackpad swipe over the returned element is one step.
 *
 * Spread the return value as an element's `ref`. It is a ref callback rather
 * than a ref object the hook is handed, because a ref object is still empty
 * when an effect would first look inside a portal: Radix mounts a portal's
 * children a commit later, and the component holding the ref does not render
 * again when they arrive, so an effect watching that ref would attach nothing
 * and never look twice. A callback ref is called when the element itself shows
 * up, whenever that is, and the listener is attached there and torn down by
 * the cleanup the callback returns. Holding the element in state instead, the
 * way this used to, cost the consumer a second render on every mount: once for
 * the element arriving, once for everything below it.
 *
 * The listener is native and non-passive, because React registers its own
 * onWheel passive and a passive listener may not preventDefault: without the
 * prevent, two fingers on a Mac trackpad are the browser's back gesture and
 * the visitor leaves the site instead of seeing the next photo.
 */
export function useWheelStep(options: WheelStepOptions) {
  // The gesture's own state, in refs rather than state: none of it is drawn,
  // and a re-render per wheel event would be one per frame of an inertia tail.
  const travel = useRef(0);
  const spent = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  // The width the ratios are measured against, read once where the gesture is
  // recognised rather than on every event. A layout read taken while the same
  // gesture still has transform writes pending is a forced synchronous layout,
  // and a viewport cannot usefully change mid-swipe. The pointer path makes
  // the same assumption, and caches its width on the press.
  const width = useRef(1);

  // Held in a ref so the listener below is attached once per element.
  // Re-attaching it per render would take the settle timer down with it every
  // time a step commits, and the tail of one gesture would arrive as a fresh
  // one.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // Stable across renders, so React never detaches and reattaches the element
  // for it.
  return useCallback((element: HTMLElement | null) => {
    if (!element) return;
    // A parameter stays mutable to TypeScript, so the guard above does not
    // narrow it inside the handler below. The const does.
    const stage = element;

    function settleWheel() {
      settle.current = undefined;
      const wasSpent = spent.current;
      spent.current = false;
      travel.current = 0;
      latest.current.onSettle?.(wasSpent);
    }

    function handleWheel(event: WheelEvent) {
      const { enabled, commitRatio, spanRatio, settleMs, onTravel, onStep } =
        latest.current;
      if (!enabled) return;
      const lines = event.deltaMode === WHEEL_DELTA_LINE;
      const dx = lines ? event.deltaX * WHEEL_LINE_PX : event.deltaX;
      const dy = lines ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
      // Anything not dominantly horizontal belongs to whatever scrolls around
      // this element, and returning without preventing is what leaves it be.
      if (Math.abs(dx) <= Math.abs(dy)) return;
      event.preventDefault();
      // The first event of a gesture is where the width is taken, because a
      // read here costs nothing the gesture has not already paid for, and a
      // read on every event would interleave layout with the transform writes
      // the same swipe is making.
      if (settle.current === undefined) width.current = stage.clientWidth || 1;
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(settleWheel, settleMs);
      if (spent.current) return;

      travel.current += dx;
      const travelled = travel.current;
      if (Math.abs(travelled) > width.current * commitRatio) {
        spent.current = true;
        onStep(travelled > 0 ? 1 : -1);
        return;
      }
      if (onTravel && spanRatio) {
        onTravel(travelled / (width.current * spanRatio));
      }
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
      window.clearTimeout(settle.current);
    };
  }, []);
}
