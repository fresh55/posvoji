"use client";

import Image from "next/image";
import {
  AnimatePresence,
  m,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { AdoptionStatus } from "@posvoji/schema";
import { thumbnailUrl } from "@/lib/animal-images";
import { cn } from "@/lib/utils";

// The wash is the photo itself, blurred past recognition, so the surface it
// sits on carries the colour of whatever is on show. It is meant to be felt
// rather than seen, which is why every value here is small.

// The share of the dialog the fan stands in: full bleed on a phone, a
// centered band from sm. The stage wash has to be laid out against the same
// box, and it no longer lives in the same file as the fan, so the width is
// stated once here and read from both.
export const STAGE_WIDTH = "w-full sm:w-[80%]";

// The radius is half the box, so the gradient runs out exactly where the clip
// does. A radius wider than the box ends the fade early and leaves the wash
// standing as a rectangle that only softens at its corners.
export const WASH_MASK =
  "radial-gradient(50% 50% at 50% 50%, black 65%, transparent 100%)";

// One animal's colour fading into the next one's. Inside an animal there is no
// fade left to run: the layers are blended off the fan's own walk, and that
// blend is what the crossfade used to stand in for. Opacity carries no
// momentum worth preserving, so this stays a fixed length rather than the
// fan's spring, and the length is where that spring has settled.
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

export function washTone(status: AdoptionStatus): string {
  return status === "adopted" || status === "hold" ? QUIET_TONE : STAGE_TONE;
}

/** One photo the stage wash is holding, and how far its print stands from the
 *  front of the fan right now: 0 is the photo on show, ±1 its neighbours. */
export type WashLayer = { offset: number; source: string };

/**
 * How far forward a print this far from the front is standing, from 0 (a whole
 * step away or more) to 1 (in front).
 *
 * The wash blends its layers on this curve and the fan deepens the front
 * photo's shadow on the same one, so the light and the depth change together
 * as a print is pulled in.
 */
export function frontness(offset: number, progress: number): number {
  return Math.max(0, Math.min(1, 1 - Math.abs(offset - progress)));
}

/** One photo of the stage wash, at the weight its print's place in the fan
 *  gives it. Every layer is drawn at once and the blend between them is what
 *  makes the light move: at rest only the front one is visible, and mid-drag
 *  the two either side of the gesture are mixed exactly the way the prints
 *  themselves are walking. */
function StageWashLayer({
  offset,
  source,
  tone,
  progress,
}: {
  offset: number;
  source: string;
  tone: string;
  /** How far the fan has been walked, in photos. */
  progress: MotionValue<number>;
}) {
  // A commit re-seats the window, so this layer's offset changes under it.
  // useTransform recomputes during the render that hands it a new function, so
  // building the closure fresh every render is what keeps a re-seated layer
  // honest without waiting for the next move of the progress.
  const opacity = useTransform(progress, (walked) => frontness(offset, walked));

  return (
    <m.div
      data-wash-offset={offset}
      className="absolute inset-0"
      style={{ opacity }}
    >
      <Image
        src={thumbnailUrl(source)}
        alt=""
        fill
        sizes={WASH_SIZES}
        className={cn("scale-125 object-cover blur-2xl", tone)}
      />
    </m.div>
  );
}

/**
 * The wash behind the fan. It is mounted above the fan's own remount, so
 * stepping to another animal crossfades one animal's colour into the next
 * while the fan itself still starts over and cascades back in.
 *
 * Within one animal nothing crossfades: the layers are held together and
 * blended off the fan's own progress, so the colour changes while a print is
 * being pulled in rather than after it lands.
 */
export function StageWash({
  layers,
  progress,
  status,
  animalId,
}: {
  /** The print on show at offset 0 and the one either side of it, which is as
   *  far out as a layer is ever worth drawing. Empty for an animal with
   *  nothing to show. */
  layers: WashLayer[];
  /** The fan's walk, mirrored out of whichever layout is on screen. */
  progress: MotionValue<number>;
  status: AdoptionStatus;
  /** What a crossfade is between. Everything inside one animal is a blend. */
  animalId: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const tone = washTone(status);

  return (
    // Both layouts run a fan now, so both get the same wash behind it.
    <div className="pointer-events-none absolute inset-0">
      {/* The stage's own box, so the wash keeps the geometry it had when it
          lived inside the fan. Under sm the stage is the whole screen and the
          wash's 12% overhang each side reaches past it, so it clips on that one
          axis, the same choice the fan makes in photo-spread.tsx. Clipping one
          axis leaves the overhang above and below intact. From sm the stage is
          a centered band with room to spare and the wash is drawn in full. */}
      <div
        className={cn(
          "relative mx-auto h-full overflow-x-clip sm:overflow-x-visible",
          STAGE_WIDTH,
        )}
      >
        <div
          data-slot="photo-wash"
          aria-hidden
          // It reaches past the stage, because the part behind the photos is
          // the part nobody can see, and stops at the card's top edge, which
          // is where the card starts painting over it anyway.
          className="pointer-events-none absolute -inset-x-[12%] -top-6 bottom-4 z-0 overflow-hidden"
          style={{ maskImage: WASH_MASK, WebkitMaskImage: WASH_MASK }}
        >
          <AnimatePresence>
            {layers.length > 0 && (
              // Keyed by the animal, not by the photo: the whole set of layers
              // belongs to one animal, and stepping to the next is the only
              // thing here that is a fade rather than a blend.
              <m.div
                key={animalId}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : WASH_FADE}
              >
                {layers.map((layer) => (
                  <StageWashLayer
                    key={layer.source}
                    offset={layer.offset}
                    source={layer.source}
                    tone={tone}
                    progress={progress}
                  />
                ))}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/**
 * Behind the lightbox photo, on the scrim rather than on the page, crossfading
 * whenever the source changes.
 *
 * One photo at a time. The stage holds the front print and its two neighbours
 * and blends between them instead; this is the lightbox's shape, where the only
 * photo that exists is the one on screen.
 */
export function LightboxWash({ source }: { source: string | undefined }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      data-slot="photo-lightbox-wash"
      aria-hidden
      // Its edges are the screen's edges, so there is nothing to fade into and
      // no mask over it, unlike the stage's.
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <AnimatePresence>
        {source && (
          // Keyed by the photo, not by its place in a list. Two slots that hold
          // the same file have nothing to fade between.
          <m.div
            key={source}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : WASH_FADE}
          >
            {/* A heavier blur than the stage's blur-2xl: this one is spread
                over the whole screen, and the same radius on that much ground
                reads as a photograph rather than a colour. */}
            <Image
              src={thumbnailUrl(source)}
              alt=""
              fill
              sizes={WASH_SIZES}
              className={cn("scale-125 object-cover blur-3xl", LIGHTBOX_TONE)}
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
