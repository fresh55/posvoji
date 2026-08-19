"use client";

import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { AdoptionStatus } from "@posvoji/schema";
import { thumbnailUrl } from "@/lib/animal-images";
import { cn } from "@/lib/utils";

// The wash is the photo itself, blurred past recognition, so the surface it
// sits on carries the colour of whatever is on show. It is meant to be felt
// rather than seen, which is why every value here is small.

// The share of the dialog the fan stands in. The stage wash has to be laid out
// against the same box, and it no longer lives in the same file as the fan, so
// the width is stated once here and read from both.
export const STAGE_WIDTH = "w-[80%]";

// The radius is half the box, so the gradient runs out exactly where the clip
// does. A radius wider than the box ends the fade early and leaves the wash
// standing as a rectangle that only softens at its corners.
export const WASH_MASK =
  "radial-gradient(50% 50% at 50% 50%, black 65%, transparent 100%)";

// Under the phone's thumb strip the wash only has to carry the hero's colour a
// little way down, so it fades out rather than ringing.
const STRIP_MASK = "linear-gradient(to bottom, black 10%, transparent 100%)";

// Opacity carries no momentum worth preserving, so the wash crossfades on a
// fixed length rather than the fan's spring. That also bounds the pile-up:
// however fast the photos are walked, no more layers can overlap than the fade
// is long. The length is where FAN_SPRING has settled.
const WASH_FADE = { duration: 0.22, ease: "easeOut" } as const;

// The thumb is a fixed 112px file, so there is nothing wider to pick even if
// image optimization is turned on later.
const WASH_SIZES = "112px";

// Flattened before it is saturated: pulling the photo towards a mid tone first
// is what keeps every animal's wash to the same weight, and what keeps the
// saturation that follows from clipping a channel. What is left to tell one
// animal from another is hue, which is the part worth keeping.
//
// Each tier is measured against the surface it sits on. The same wash that is
// felt on white is a lamp on near black, so the stage carries two opacities;
// the lightbox sits on a dark scrim in both themes and needs only one.
const STAGE_TONE =
  "opacity-[0.22] contrast-50 saturate-[440%] dark:opacity-[0.14]";

// Adopted and hold are over, and the stage light agrees with the badge: the
// colour drains and the weight halves, so the fan reads as lit by something
// that has moved on. Reserved is still a maybe and keeps the warm tier.
const QUIET_TONE =
  "opacity-[0.12] contrast-50 saturate-[110%] dark:opacity-[0.08]";

// The lightbox ground is the scrim, which is near black whichever theme is on.
const LIGHTBOX_TONE = "opacity-[0.10] contrast-50 saturate-[440%]";

// The phone has no room around the photo, so the wash only bridges the seam
// between the hero and the strip below it. Quieter again, because the thumbs
// have to stay readable on top of it.
const STRIP_TONE =
  "opacity-[0.11] contrast-50 saturate-[440%] dark:opacity-[0.08]";

export function washTone(status: AdoptionStatus): string {
  return status === "adopted" || status === "hold" ? QUIET_TONE : STAGE_TONE;
}

/**
 * The blurred photo, crossfading whenever the source changes. Callers own the
 * box it fills, what clips it, and how heavy it reads.
 */
function Wash({
  slot,
  source,
  tone,
  blur,
  mask,
  className,
}: {
  slot: string;
  source: string | undefined;
  tone: string;
  blur: string;
  mask?: string;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      data-slot={slot}
      aria-hidden
      className={cn("pointer-events-none overflow-hidden", className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <AnimatePresence>
        {source && (
          // Keyed by the photo, not by its place in a list. Two slots that
          // hold the same file have nothing to fade between.
          <m.div
            key={source}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : WASH_FADE}
          >
            <Image
              src={thumbnailUrl(source)}
              alt=""
              fill
              sizes={WASH_SIZES}
              className={cn("scale-125 object-cover", blur, tone)}
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The wash behind the fan. It is mounted above the fan's own remount, so
 * stepping to another animal crossfades one animal's colour into the next
 * while the fan itself still starts over and cascades back in.
 */
export function StageWash({
  source,
  status,
}: {
  source: string | undefined;
  status: AdoptionStatus;
}) {
  return (
    // The phone gets its own, smaller echo under the thumb strip instead.
    <div className="pointer-events-none absolute inset-0 hidden sm:block">
      {/* The stage's own box, so the wash keeps the geometry it had when it
          lived inside the fan. */}
      <div className={cn("relative mx-auto h-full", STAGE_WIDTH)}>
        <Wash
          slot="photo-wash"
          source={source}
          tone={washTone(status)}
          blur="blur-2xl"
          mask={WASH_MASK}
          // It reaches past the stage, because the part behind the photos is
          // the part nobody can see, and stops at the card's top edge, which
          // is where the card starts painting over it anyway.
          className="absolute -inset-x-[12%] -top-6 bottom-4 z-0"
        />
      </div>
    </div>
  );
}

/** The same echo on a phone, bridging the hero and the thumb strip. */
export function StripWash({ source }: { source: string | undefined }) {
  return (
    <Wash
      slot="photo-strip-wash"
      source={source}
      tone={STRIP_TONE}
      // A phone pays for every blurred pixel, and the band is short, so the
      // radius is smaller than the stage's.
      blur="blur-xl"
      mask={STRIP_MASK}
      className="absolute inset-x-0 top-0 bottom-0 z-0"
    />
  );
}

/** Behind the lightbox photo, on the scrim rather than on the page. */
export function LightboxWash({ source }: { source: string | undefined }) {
  return (
    <Wash
      slot="photo-lightbox-wash"
      source={source}
      tone={LIGHTBOX_TONE}
      blur="blur-3xl"
      // Its edges are the screen's edges, so there is nothing to fade into.
      className="absolute inset-0"
    />
  );
}
