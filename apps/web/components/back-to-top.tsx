"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The grid is unpaginated: every match renders, which at 503 animals two to a
// row is about 67,000px of page. The header is not sticky and the dock holds
// only the filters and the map, so the way home was a flick that took longer
// than most people will spend. This is the way back up.

// Two screens down is where the header is well out of sight and a scroll back
// has stopped being plausible. Below that the button would be noise.
const SHOW_AFTER_SCREENS = 2;

// Clear of the dock, with a gap above it, so the two read as a stack rather
// than a collision. The distance itself is --back-to-top-bottom in globals.css,
// because the footer has to clear this button in turn and derives its own
// run-off from the same number, and that token is retuned at lg where there is
// no dock left to clear.
//
// From lg the button also stops at the top of the footer rather than riding
// over it. The button is pinned to the viewport's right edge and the footer's
// links to the container's, and the container is max-w-7xl and centred, so the
// two are the same edge exactly when the viewport is about as wide as the
// container: measured at 1024 and 1280 the button covered the right half of the
// last link and won the hit test for it. Moving it horizontally is not open to
// us, which is worth writing down so it is not proposed again: pinning to the
// container's inner edge puts the button on the links' own edge at every width,
// and there is only room outside the container above about 1400px. So it goes
// up instead.
//
// Below lg this is left out of the CSS and the variable goes unread, because
// the clearance there is the footer's `docked` padding, which reserves a strip
// for this button rather than moving it. Lifting as well would be that same
// clearance counted twice. That does mean a page mounting BackToTop without a
// docked footer has no clearance below lg, so every mount has to pass it:
// animal-filters.tsx mounts this for the homepage grid and shelters-page.tsx
// for the register, and both of their footers are docked.
// Both distances are tokens in globals.css, retuned there at lg. The right one
// carries the safe-area inset the bottom one had all along; see
// --back-to-top-right for why the two compose their insets differently.
const PLACEMENT =
  "fixed right-(--back-to-top-right) bottom-(--back-to-top-bottom) z-40 lg:bottom-[calc(var(--back-to-top-bottom)+var(--back-to-top-lift,0px))]";

export function BackToTop() {
  const { messages } = useI18n();
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let frame = 0;
    // Resolved once. The footer is a sibling of the tree this button is
    // mounted in, so there is no ref to pass down, but it is in the same
    // commit and so is already in the document by the time an effect runs.
    const footer = document.querySelector("footer");
    const read = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
      // How much of the footer is on screen, which is exactly how far the
      // button has to come up to sit on top of it: the inset it already holds
      // off the viewport's bottom edge becomes the gap above the footer. Zero
      // for the whole length of the grid, and written straight onto the node
      // rather than held in state, so the frames where it does change cost no
      // render.
      const overlap = footer
        ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
        : 0;
      ref.current?.style.setProperty("--back-to-top-lift", `${overlap}px`);
    };
    // Coalesced into a frame: these events fire far more often than the
    // answers can change, and the listener runs over a very long document.
    const onViewportChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onViewportChange, { passive: true });
    // Resizing moves the footer under a button that has not scrolled, and at
    // the end of the document it changes how much of the footer is on screen
    // without firing a scroll at all.
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("resize", onViewportChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="icon"
      data-slot="back-to-top"
      aria-label={messages.backToTop}
      // Hidden from everything, not just from view: a control that cannot be
      // reached should not be the next tab stop either, and a screen reader
      // has no use for a scroll shortcut it cannot act on yet.
      aria-hidden={!shown}
      tabIndex={shown ? undefined : -1}
      onClick={() => {
        // Instant, with no reduced-motion branch to make: a smooth ride from
        // 60,000px is not a transition, it is a wait, so nobody gets one.
        window.scrollTo({ top: 0, behavior: "auto" });
        // The header is where the visitor was sent, so that is what should
        // take focus next rather than leaving it on a button that has just
        // disappeared out from under the finger.
        document.querySelector<HTMLElement>("header a")?.focus();
      }}
      className={cn(
        PLACEMENT,
        "size-11 rounded-full bg-background/90 shadow-lg backdrop-blur-sm transition-opacity duration-200 hover:bg-background",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ArrowUp className="size-4" aria-hidden />
    </Button>
  );
}
