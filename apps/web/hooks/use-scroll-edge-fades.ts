"use client";

import { useCallback } from "react";

// Past this remainder the edge counts as reached, so the fade never blocks the
// last few pixels of content.
const EDGE_SLACK_PX = 8;

/** Drives the fade-scroll utility: sets --scroll-fade-top and
    --scroll-fade-bottom to 1 only on edges with content beyond them, so a
    container that fits never dims and a scrolled one says which way holds
    more.

    A callback ref rather than a ref object with an effect beside it. An effect
    can only wire up the element that exists in the commit it runs in, and a
    scroller inside a dialog is not in the tree for the whole life of the
    component holding it: the picker's list mounts in a later commit than the
    one that opens the dialog, so the effect ran against a null ref and the
    list came up unwired, never dimming however far it scrolled. A callback ref
    fires on the commit the node actually attaches in, whichever one that is,
    and React 19 runs the function it returns when the node goes away. Callers
    with an always-mounted scroller are unaffected; they hand it to the same
    ref= and never see the difference. */
export function useScrollEdgeFades<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
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
}

/** The same, measured across scrollLeft: drives the fade-scroll-x utility by
    setting --scroll-fade-start and --scroll-fade-end. For a strip that scrolls
    sideways and hides its scrollbar, where nothing else says there is more to
    find past either edge.

    Children are observed as well as the container, and so is the child list.
    A row of chips changes its scroll width without ever changing its own size:
    a filter comes off, the content shrinks inside a box that did not move, and
    a container-only ResizeObserver never fires. */
export function useScrollEdgeFadesX<T extends HTMLElement>() {
  return useCallback((el: T | null) => {
    if (!el) return;

    const update = () => {
      const fadeStart = el.scrollLeft > EDGE_SLACK_PX;
      const fadeEnd =
        el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_SLACK_PX;
      el.style.setProperty("--scroll-fade-start", fadeStart ? "1" : "0");
      el.style.setProperty("--scroll-fade-end", fadeEnd ? "1" : "0");
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

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
    mutations.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
}
