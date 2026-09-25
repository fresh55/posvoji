"use client";

import { useEffect, useRef } from "react";
import { DESKTOP_QUERY } from "@/lib/viewport-queries";

// Kept here for the callers that already import it with the hook; the string
// lives in lib/viewport-queries.ts, where the picker's split query is built on
// it.
export { DESKTOP_QUERY };

/** Vaul portals a drawer straight to <body>, so a mobile filter drawer stays
 *  open and floating over the page if the viewport crosses into the desktop
 *  layout while it is open (a resize, or a phone rotated to landscape past
 *  the lg breakpoint) -- nothing about the drawer itself is responsive, only
 *  the trigger that opened it. This closes a controlled drawer the moment
 *  that happens.
 *
 *  Only listens while `open` is true: a closed drawer has nothing to react
 *  to. `onClose` is read through a ref rather than depended on, because
 *  callers pass a fresh closure every render and depending on it tore the
 *  listener down and set it up again on every one of them. The ref is kept
 *  current by its own effect, so the listener always calls the callback from
 *  the latest committed render. */
export function useDesktopBreakpointClose(
  open: boolean,
  onClose: () => void,
  closeOn: "desktop" | "mobile" | "either" = "desktop",
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      if (closeOn === "either" || event.matches === (closeOn === "desktop"))
        onCloseRef.current();
    };

    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [open, closeOn]);
}
