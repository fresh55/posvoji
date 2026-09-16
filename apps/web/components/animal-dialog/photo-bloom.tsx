"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { DialogPhotoRect } from "@/components/animal-dialog/animal-dialog";
import { AnimalPhoto } from "@/components/animal-photo";
import type { PermittedPhoto } from "@/lib/animal-images";
import { CARD_PHOTO_RATIO, CARD_PHOTO_SIZES } from "@/lib/card-grid";

// The travel is a tween rather than a spring: it has to hand over to the fan's
// own entrance, and a fixed length is what lets the two be lined up.
const BLOOM_TRAVEL = { duration: 0.36, ease: [0.22, 1, 0.36, 1] } as const;
// The fan's active photo is up by about 210ms, so the copy is faded out across
// that window. The two crossfade rather than one replacing the other, which is
// also what covers the last few pixels of the landing.
const BLOOM_FADE = { delay: 0.18, duration: 0.2 } as const;

// When the fan is told it may draw its own front print again: as the copy
// starts to fade, so the print's entrance and the copy's fade are one
// crossfade at one spot. The print comes in on a spring of 150 to 200ms,
// against the 200ms the copy takes to go.
//
// Not the end of the copy's animation, which is far too late to be the signal:
// the re-aim below restarts the travel, so the animation reports itself over
// long after there is anything left to see. Measured on the built export at
// 1280x800, the copy was at zero opacity at +764ms and the report came at
// +920ms, which left the front seat empty for about 190ms. The report is kept
// as a fallback for the case where this timer never runs.
const RELEASE_MS = BLOOM_FADE.delay * 1000;

// The dialog's own zoom runs for 200ms and the fan cascades in behind it, so
// the slot measured on the first frame is a moving target: it read about 20px
// low. The slot is read again once both have stopped and the copy re-aims at
// the real one, which happens while it is already fading out.
const SETTLE_MS = 220;

// The fan mounts one stage for the breakpoint it read, under one of two slot
// names; the copy lands on the active photo of whichever is there. Named the
// way frontPrintOf names it: data-print is on every print and aria-current on
// the one in front.
const SLOT =
  '[data-slot="photo-fan"] button[data-print][aria-current="true"], [data-slot="photo-spread"] button[data-print][aria-current="true"]';

function slotRect() {
  for (const slot of document.querySelectorAll(SLOT)) {
    const rect = slot.getBoundingClientRect();
    if (rect.width) return rect;
  }
  return undefined;
}

/**
 * The card's photo carried into the fan's active slot when the dialog opens.
 * It is a copy that dissolves into the real photo, not the photo itself: the
 * fan is inside the dialog's own zoom, and nothing positioned against the
 * viewport can live inside a transform and still land where it was aimed.
 */
export function PhotoBloom({
  from,
  photo,
  onFlightEnd,
}: {
  /** Where the card's photo was standing, or nothing for a deep link. */
  from: DialogPhotoRect | undefined;
  /** The card's photograph, read as the copy sets off and not again. */
  photo: PermittedPhoto | undefined;
  /**
   * That the fan may draw its own front print again. It is said once, as the
   * copy begins to fade (RELEASE_MS), and in every case where the copy is not
   * going to fly at all: no card to leave from, no photograph to carry, no
   * slot to carry it to, or motion turned down. The end of the copy's
   * animation says it too, as the fallback for a timer that never ran.
   */
  onFlightEnd?: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  // The photograph the copy sets off with, kept from the render it left in.
  // The visitor can step to the next animal while it is still in the air, and
  // that changes this prop underneath it: the copy flew on with the next
  // animal's picture inside it, over that animal's own front print. What is in
  // the air belongs to the animal it left.
  // State rather than a ref, because it is read while rendering: it is the
  // first value of this one, kept, and never set again.
  const [carried] = useState(photo);
  const [to, setTo] = useState<DialogPhotoRect | undefined>(undefined);
  // Where the slot really ended up, as an offset from where it first looked.
  const [aim, setAim] = useState({ x: 0, y: 0, scale: 1 });
  const [landed, setLanded] = useState(false);
  // The copy makes one trip per opening, so the end of it is said once. The
  // latch is a ref rather than state because nothing here is drawn from it,
  // and because it has to hold across the effect below re-running.
  const ended = useRef(false);
  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onFlightEnd?.();
  }, [onFlightEnd]);

  // The fan lands where the dialog's zoom puts it, so the slot is measured
  // rather than worked out from the layout: once to set off towards, and again
  // once everything has stopped moving.
  //
  // A layout effect, reading the slot there and then. The fan is put in the
  // document in the same commit as this component, so the copy can be laid out
  // in the paint the fan first appears in rather than a frame and a render
  // later: measured on the built export at 4x CPU, the fan was on screen at
  // +683ms and the copy only at +764ms, with the fan's own entrance already
  // running underneath it. The frame below is what the commit where the fan is
  // not there yet falls back to, which is what this used to do in every case.
  useLayoutEffect(() => {
    if (ended.current) return;
    if (!from || !carried || shouldReduceMotion) {
      end();
      return;
    }
    let settle: ReturnType<typeof setTimeout> | undefined;
    let release: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;

    const setOff = (first: DOMRect) => {
      setTo({
        left: first.left,
        top: first.top,
        width: first.width,
        height: first.height,
      });
      // Timed from the copy being placed, which is the moment its own fade is
      // timed from: see RELEASE_MS.
      release = setTimeout(end, RELEASE_MS);
      settle = setTimeout(() => {
        const rest = slotRect();
        if (!rest) return;
        setAim({
          x: rest.left + rest.width / 2 - (first.left + first.width / 2),
          y: rest.top + rest.height / 2 - (first.top + first.height / 2),
          scale: rest.width / first.width,
        });
      }, SETTLE_MS);
    };

    const measured = slotRect();
    if (measured) {
      setOff(measured);
    } else {
      frame = requestAnimationFrame(() => {
        const late = slotRect();
        if (late) setOff(late);
        // No slot in that frame either, so there is no trip to make and
        // nothing is waiting on one.
        else end();
      });
    }

    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
      if (release) clearTimeout(release);
    };
  }, [from, carried, shouldReduceMotion, end]);

  if (!from || !to || !carried || shouldReduceMotion || landed) return null;

  return (
    // Its own features, because this sits beside the dialog's content rather
    // than inside it, and an m element with no LazyMotion above it renders
    // where it was told to and then never moves.
    <LazyMotion features={domAnimation}>
      {/* Laid out on the slot and carried in by transform, so nothing here
          animates a layout property. */}
      <m.div
        aria-hidden
        data-slot="photo-bloom"
        // No breakpoint gate any more: the phone has a fan slot of its own to
        // land in now, so the card's photo makes the trip on every layout.
        className="pointer-events-none fixed z-[55] overflow-hidden rounded-ui"
        style={{
          left: to.left,
          top: to.top,
          width: to.width,
          height: to.height,
        }}
        initial={{
          x: from.left + from.width / 2 - (to.left + to.width / 2),
          y: from.top + from.height / 2 - (to.top + to.height / 2),
          scale: from.width / to.width,
          opacity: 1,
        }}
        animate={{ ...aim, opacity: 0 }}
        transition={{ ...BLOOM_TRAVEL, opacity: BLOOM_FADE }}
        onAnimationComplete={() => {
          setLanded(true);
          end();
        }}
      >
        {/* The card's sizes, not this copy's own box. This is the card's
            photograph being carried, and asking for the rung the card already
            has is what keeps the trip a cache hit instead of a second
            download starting under a 360ms animation. */}
        <AnimalPhoto
          photo={carried}
          alt=""
          sizes={CARD_PHOTO_SIZES}
          // The card's crop too, for the same reason: this is the card's
          // photograph leaving, and a different window on it would jump.
          frame={CARD_PHOTO_RATIO}
          // Already on screen and already decoded, since the card it left is
          // still behind the dialog.
          eager
          className="object-cover"
        />
      </m.div>
    </LazyMotion>
  );
}
