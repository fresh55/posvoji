"use client";

import { useEffect, useId, useRef } from "react";
import { commitLocation, subscribeToLocation } from "@/lib/location-search";

/** One temporary history entry lets a phone's Back gesture dismiss the map.
 * Filter changes made in it are retained when returning to the results.
 *
 * The name is the first caller, not the contract: this serves any layer a back
 * gesture should dismiss instead of leaving the page. The filter sheet and the
 * photo lightbox use it too, and layers stack, because each caller pushes and
 * pops its own keyed entry, so two open layers peel one press at a time. */
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

export function usePickerHistory(open: boolean, close: () => void) {
  const id = useId();
  const serial = useRef(0);
  const closeRef = useRef(close);
  const mounted = useRef(false);
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
    if (open && !visit.current) {
      visit.current = { key: `${id}:${++serial.current}`, url: new URL(window.location.href), popping: false };
      history.pushState(
        { ...history.state, locationPicker: visit.current.key },
        "",
        window.location.href,
      );
    } else if (!open && visit.current && !visit.current.popping) {
      visit.current.popping = true;
      if (history.state?.locationPicker === visit.current.key) history.back();
      else visit.current = null;
    }
  }, [open, id]);
}
