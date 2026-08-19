"use client";

import { useEffect, useRef } from "react";

// Past this remainder the edge counts as reached, so the fade never blocks the
// last few pixels of content.
const EDGE_SLACK_PX = 8;

/** Drives the fade-scroll utility: sets --scroll-fade-top and
    --scroll-fade-bottom to 1 only on edges with content beyond them, so a
    container that fits never dims and a scrolled one says which way holds
    more. */
export function useScrollEdgeFades<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const fadeTop = el.scrollTop > EDGE_SLACK_PX;
      const fadeBottom =
        el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_SLACK_PX;
      el.style.setProperty("--scroll-fade-top", fadeTop ? "1" : "0");
      el.style.setProperty("--scroll-fade-bottom", fadeBottom ? "1" : "0");
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    // Sections folding open and closed change the scroll height without a
    // scroll event, so the children are watched too. Guarded for jsdom.
    if (typeof ResizeObserver === "undefined") {
      return () => el.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    const observeChildren = () => {
      observer.disconnect();
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    };
    observeChildren();
    const mutations = new MutationObserver(() => {
      observeChildren();
      update();
    });
    mutations.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return ref;
}
