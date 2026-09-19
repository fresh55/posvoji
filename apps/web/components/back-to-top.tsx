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

// How far down the button appears: two screens, capped at 700px, and never
// before one screen.
//
// Two screens alone was a screen-height measurement of something that is not
// about the screen's height. What it was meant to say is that the header is
// well out of sight and a scroll back has stopped being plausible, and 700px
// of scroll says that on every screen: the header is 73px tall and the
// toolbar under it is the last of the page's chrome. On a phone held sideways
// (844x390) the species toolbar goes static and scrolls away at about 270px,
// and two screens put this button at 780, so between 270 and 780 there was
// nothing on screen that changed the species and nothing that went back up.
//
// The cap bites where the screen is short: a 390px landscape phone shows the
// button at 700 rather than 780. The one-screen floor is for the screens the
// cap would otherwise reach too early: a 900px desktop shows it at 900 and an
// 844px portrait phone at 844, one full screen down, not at 700 with the hero
// barely gone. 700px is past the first row of cards at every width (the
// tallest card row is 431px), so the disc still arrives after the page has
// moved rather than sitting in the corner of the landing screen. The
// two-screen term only decides anything below 350px of viewport, which is a
// window that has barely scrolled at all.
const SHOW_AFTER_SCREENS = 2;
const SHOW_AFTER_MAX_PX = 700;

function showAfter(innerHeight: number): number {
  return Math.max(
    innerHeight,
    Math.min(innerHeight * SHOW_AFTER_SCREENS, SHOW_AFTER_MAX_PX),
  );
}

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
// animal-filters.tsx mounts this for the homepage grid, shelters-page.tsx for
// the register and shelter-detail-page.tsx for one shelter's animals, and all
// three of those footers are docked.
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
      setShown(window.scrollY > showAfter(window.innerHeight));
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
      //
      // inert rather than a hand-written tabIndex={-1} beside the
      // aria-hidden. The two have to say the same thing and nothing held them
      // to it; inert says both halves in one expression and cannot come apart
      // from itself. It also takes the pointer, which this button has already
      // given up below (pointer-events-none), so nothing else changes.
      // aria-hidden stays for the browsers that do not read inert yet, the
      // same pairing cat-model.tsx carries and for the same reason.
      inert={!shown}
      aria-hidden={!shown}
      onClick={() => {
        // Instant, with no reduced-motion branch to make: a smooth ride from
        // 60,000px is not a transition, it is a wait, so nobody gets one.
        window.scrollTo({ top: 0, behavior: "auto" });
        // The header is where the visitor was sent, so that is what should
        // take focus next rather than leaving it on a button that has just
        // disappeared out from under the finger.
        //
        // The brand by name and not the header's first anchor: that is the
        // skip link now (site-header.tsx), and focusing it drew it over the
        // logo on every press.
        document.querySelector<HTMLElement>("header a[data-brand]")?.focus();
      }}
      className={cn(
        PLACEMENT,
        // The plate and its edge, both stated twice because the outline
        // variant states them for dark itself and tailwind-merge keeps a
        // dark: class beside an unprefixed one: the variant carries
        // dark:bg-input/30 and dark:hover:bg-input/50, and the dark variant
        // resolves to :is(:root:not(.light) *), so its specificity wins
        // whatever the merge does with the plain class. Without the two dark
        // halves below this disc was white at 4.5% alpha in dark mode, which
        // over a photo is not a plate at all: the arrow measured 1.24:1 over a
        // light photo at 1280 and 2.00:1 at 390, against 8.9:1 on the page
        // ground (2026-09-17 audit). From 1024 to 1279 the button overlaps the
        // last card column by 36px, which is how it comes to stand on photos.
        "size-11 rounded-full bg-background/90 shadow-lg backdrop-blur-sm transition-opacity duration-200 hover:bg-background dark:bg-background/90 dark:hover:bg-background",
        shown ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ArrowUp className="size-4" aria-hidden />
    </Button>
  );
}
