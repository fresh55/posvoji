"use client";

import { useEffect, useId, useRef } from "react";
import { commitLocation, subscribeToLocation } from "@/lib/location-search";

/** Whether the entry the visitor is standing on is one a layer pushed.
 *
 *  Exported for the species write, which pushes an entry of its own on the
 *  page and must not do so from inside an open sheet: the entry under the
 *  sheet's marker is the one its back gesture pops to, and a push from inside
 *  stacks a second entry carrying the same marker, so back then spends one
 *  press undoing the species and a second closing the sheet
 *  (use-animal-filters.ts). */
export function standsOnLayerEntry(): boolean {
  return typeof window.history.state?.locationPicker === "string";
}

/**
 * The scroll restoration the page itself runs with, read before any layer
 * changed it, so every layer puts back the same thing however they overlap.
 */
let pageRestoration: ScrollRestoration | null = null;

/** Sets history.scrollRestoration where it can be set, which is every
 *  browser the site runs in but not jsdom: it implements only the getter. */
function setRestoration(mode: ScrollRestoration): void {
  try {
    history.scrollRestoration = mode;
  } catch {
    // Nothing a pop could restore either.
  }
}

/**
 * Pushes a layer's entry over an entry that will not restore its scroll.
 *
 * Closing a layer pops back to the entry under it, and the browser then puts
 * that entry's scroll back where it was when the layer opened. A filter
 * picked in the layer has taken the page to the top of its results by then
 * (scrollToResults), so the pop threw the visitor back into the old list:
 * measured at 390x844 with the page at 3000, the sheet's close restored 3000
 * about 50ms after the tap, and the return to the results ran again only once
 * the sheet was gone, a 2,750px jump on a bare page.
 *
 * The mode belongs to the entry, and a push copies it onto the new one, so it
 * is switched off on the entry underneath just before the push and set back
 * on the layer's own entry just after. A link followed from inside the layer
 * still returns to a page whose scroll comes back.
 */
function pushLayerEntry(key: string): void {
  pageRestoration ??= history.scrollRestoration;
  setRestoration("manual");
  history.pushState(
    { ...history.state, locationPicker: key },
    "",
    window.location.href,
  );
  setRestoration(pageRestoration);
}

/**
 * Hands the entry under a closed layer its restoration back, once the pop has
 * landed on it.
 *
 * A task later and not in the pop's own listener. Chrome reads the mode before
 * it fires popstate (set back inside the listener, it still restored
 * nothing), but the spec reads it after the event, and an entry left on
 * manual for one more task costs nothing.
 */
function restoreAfterPop(): void {
  window.setTimeout(() => {
    if (pageRestoration) setRestoration(pageRestoration);
  }, 0);
}

/** Work waiting for the next layer to close (whenLayerCloses). */
const closing = new Set<() => void>();

/**
 * Runs `settle` once, in the first frame after a layer starts to close.
 *
 * That is the last moment the page under it can change unseen: the layer
 * still covers it on its way out, and from the next frames on it is what the
 * visitor looks at. A frame and not the close itself, because on iOS vaul
 * puts the page's own scroll back in a frame it asks for as the drawer
 * closes, and work asked for after that runs after it. Returns a function
 * that withdraws `settle` again.
 */
export function whenLayerCloses(settle: () => void): () => void {
  closing.add(settle);
  return () => {
    closing.delete(settle);
  };
}

function layerClosing(): void {
  if (closing.size === 0) return;
  requestAnimationFrame(() => {
    const due = [...closing];
    closing.clear();
    for (const settle of due) settle();
  });
}

/** One temporary history entry lets a phone's Back gesture dismiss the map.
 * Filter changes made in it are retained when returning to the results.
 *
 * The name is the first caller, not the contract: this serves any layer a back
 * gesture should dismiss instead of leaving the page. The filter sheet and the
 * photo lightbox use it too, and layers stack, because each caller pushes and
 * pops its own keyed entry, so two open layers peel one press at a time.
 *
 * The page under a layer keeps the scroll it has when the layer closes: the
 * pop back to it restores nothing (pushLayerEntry), and whatever a layer
 * left for the page to do runs while the layer still covers it
 * (whenLayerCloses). */
export function usePickerHistory(open: boolean, close: () => void) {
  const id = useId();
  const serial = useRef(0);
  const closeRef = useRef(close);
  const mounted = useRef(false);
  // Whether the layer was open the last time the effect below looked, so a
  // close is told apart from a layer that was never opened.
  const shown = useRef(false);
  const visit = useRef<{ key: string; url: URL; popping: boolean } | null>(null);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    mounted.current = true;
    const record = () => {
      if (visit.current && history.state?.locationPicker === visit.current.key) {
        visit.current.url = new URL(window.location.href);
      }
    };
    const unsubscribe = subscribeToLocation(record);
    const popped = () => {
      const current = visit.current;
      if (!current || history.state?.locationPicker === current.key) return;
      visit.current = null;
      // Restore before the filter store's bubbling popstate subscribers read.
      commitLocation(
        current.url.pathname,
        current.url.search.slice(1),
        "replace",
      );
      restoreAfterPop();
      if (mounted.current) closeRef.current();
    };
    window.addEventListener("popstate", popped, true);
    return () => {
      mounted.current = false;
      unsubscribe();
      window.removeEventListener("popstate", popped, true);
      queueMicrotask(() => {
        if (mounted.current || !visit.current) return;
        if (history.state?.locationPicker !== visit.current.key) {
          visit.current = null;
          restoreAfterPop();
          return;
        }
        window.addEventListener("popstate", popped, {
          capture: true,
          once: true,
        });
        if (!visit.current.popping) {
          visit.current.popping = true;
          history.back();
        }
      });
    };
  }, [id]);

  useEffect(() => {
    if (open) {
      shown.current = true;
      if (!visit.current) {
        visit.current = { key: `${id}:${++serial.current}`, url: new URL(window.location.href), popping: false };
        pushLayerEntry(visit.current.key);
      }
      return;
    }
    if (!shown.current) return;
    shown.current = false;
    // Whichever way it closed: the button, Escape, or the back gesture that
    // has already popped the entry by the time this runs.
    layerClosing();
    if (visit.current && !visit.current.popping) {
      visit.current.popping = true;
      if (history.state?.locationPicker === visit.current.key) history.back();
      else {
        visit.current = null;
        restoreAfterPop();
      }
    }
  }, [open, id]);
}
