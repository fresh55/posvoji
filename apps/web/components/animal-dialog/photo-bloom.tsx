"use client";

import { useEffect, useState } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { DialogPhotoRect } from "@/components/animal-dialog/animal-dialog";
import { AnimalPhoto } from "@/components/animal-photo";
import type { PermittedPhoto } from "@/lib/animal-images";
import { CARD_PHOTO_SIZES } from "@/lib/card-grid";

// The travel is a tween rather than a spring: it has to hand over to the fan's
// own entrance, and a fixed length is what lets the two be lined up.
const BLOOM_TRAVEL = { duration: 0.36, ease: [0.22, 1, 0.36, 1] } as const;
// The fan's active photo is up by about 210ms, so the copy is faded out across
// that window. The two crossfade rather than one replacing the other, which is
// also what covers the last few pixels of the landing.
const BLOOM_FADE = { delay: 0.18, duration: 0.2 } as const;

// The dialog's own zoom runs for 200ms and the fan cascades in behind it, so
// the slot measured on the first frame is a moving target: it read about 20px
// low. The slot is read again once both have stopped and the copy re-aims at
// the real one, which happens while it is already fading out.
const SETTLE_MS = 220;

// Both stages are in the tree and CSS shows one per breakpoint, so the slot
// is whichever active photo actually has a box.
const SLOT =
  '[data-slot="photo-fan"] button[aria-pressed="true"], [data-slot="photo-spread"] button[aria-pressed="true"]';

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
}: {
  /** Where the card's photo was standing, or nothing for a deep link. */
  from: DialogPhotoRect | undefined;
  photo: PermittedPhoto | undefined;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [to, setTo] = useState<DialogPhotoRect | undefined>(undefined);
  // Where the slot really ended up, as an offset from where it first looked.
  const [aim, setAim] = useState({ x: 0, y: 0, scale: 1 });
  const [landed, setLanded] = useState(false);

  // The fan lands where the dialog's zoom puts it, so the slot is measured
  // rather than worked out from the layout: once to set off towards, and again
  // once everything has stopped moving.
  useEffect(() => {
    if (!from || shouldReduceMotion) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const first = slotRect();
      if (!first) return;
      setTo({
        left: first.left,
        top: first.top,
        width: first.width,
        height: first.height,
      });
      settle = setTimeout(() => {
        const rest = slotRect();
        if (!rest) return;
        setAim({
          x: rest.left + rest.width / 2 - (first.left + first.width / 2),
          y: rest.top + rest.height / 2 - (first.top + first.height / 2),
          scale: rest.width / first.width,
        });
      }, SETTLE_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (settle) clearTimeout(settle);
    };
  }, [from, shouldReduceMotion]);

  if (!from || !to || !photo || shouldReduceMotion || landed) return null;

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
        onAnimationComplete={() => setLanded(true)}
      >
        {/* The card's sizes, not this copy's own box. This is the card's
            photograph being carried, and asking for the rung the card already
            has is what keeps the trip a cache hit instead of a second
            download starting under a 360ms animation. */}
        <AnimalPhoto
          photo={photo}
          alt=""
          sizes={CARD_PHOTO_SIZES}
          // Already on screen and already decoded, since the card it left is
          // still behind the dialog.
          eager
          className="object-cover"
        />
      </m.div>
    </LazyMotion>
  );
}
