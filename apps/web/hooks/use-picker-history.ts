"use client";

import { useEffect, useId, useRef } from "react";
import { commitLocation, subscribeToLocation } from "@/lib/location-search";

/** One temporary history entry lets a phone's Back gesture dismiss the map.
 * Filter changes made in it are retained when returning to the results. */
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
