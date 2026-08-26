"use client";

import { useEffect, useState } from "react";
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
// run-off from the same number. From lg the dock is gone and the button drops
// to the corner it would have had all along.
const PLACEMENT =
  "fixed right-4 bottom-(--back-to-top-bottom) z-40 lg:right-6 lg:bottom-6";

export function BackToTop() {
  const { messages } = useI18n();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
    };
    // Coalesced into a frame: scroll fires far more often than this answer
    // can change, and the listener runs over a very long document.
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <Button
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
