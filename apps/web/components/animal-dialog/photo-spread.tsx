"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  animate,
  m,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import type { EnergyLevel } from "@posvoji/schema";
import {
  PhotoLightbox,
  SHEET_FROM,
} from "@/components/animal-dialog/photo-lightbox";
import {
  STAGE_WIDTH,
  frontness,
  type WashLayer,
} from "@/components/animal-dialog/photo-wash";
import { useWheelStep } from "@/components/animal-dialog/use-wheel-step";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-provider";
import {
  GALLERY_BUTTON_CLASS,
  PhotoGallery,
} from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientAnimal } from "@/lib/animal";
import {
  FAN_PHOTO_SIZES,
  PRINT_ASPECT,
  type PermittedPhoto,
} from "@/lib/animal-images";
import { clampPhotoIndex } from "@/lib/animal-path";
import { preloadPhotos } from "@/lib/preload-photos";
import {
  MIN_SWIPE_PX,
  SWIPE_DISTANCE_RATIO,
  SWIPE_SPAN_RATIO,
  WHEEL_SETTLE_MS,
  declareAxis,
  releasePointer,
  swipeVerdict,
} from "@/lib/swipe";
import { cn } from "@/lib/utils";

// Five photos is where a fan still reads as a fan. Past that the window walks
// the rest into view as the visitor steps through them.
const FAN_LIMIT = 5;

const ENTRANCE_STAGGER = 0.04;

// A fixed nudge per photo keeps the fan from looking machine cut. It is picked
// by position, never at random, so the same animal always fans out the same.
const TILT_NUDGE = [0, -1.2, 0.8, -0.6, 1.4];

// A flick this much harder than the one that turns a photo carries two of
// them. The fan's own number, and the one thing about its swipe that no other
// surface shares: well past the SWIPE_VELOCITY_PX_MS that commits a step, so
// it is a gesture somebody meant rather than an ordinary swipe that ran fast.
// Two and never more: past that a flick would be a scrub, and the fan has no
// scrub. Only for a set the fan cannot show at once, because on a short one
// two steps walk past the whole thing and back.
const FLICK_TWO_PX_MS = 1.4;

// What a hover does to a photo from the stack: bigger, lifted, and most of the
// way back to straight, so it reads as the thing a click would pick.
const HOVER_SCALE = 1.08;
const HOVER_LIFT_PX = 4;
// Not all the way to zero. A photo pulled fully upright reads as already
// chosen, and the fan then has two photos claiming the front.
const HOVER_STRAIGHTEN = 0.7;

// What one tier back costs a print in light, and what a hover hands back. Two
// tiers is as deep as the fan goes, so the furthest print loses a tenth of its
// light and the front loses none. It is read off the walk rather than switched
// by a class on the non-active prints, so a print dims as it is pushed back
// under the finger instead of switching when the step lands.
//
// Drawn as the opacity of a black layer over the picture rather than as a
// brightness filter on the print: opacity is composited, while the filter had
// the browser repaint all five photographs on every frame of a drag. Reduced
// motion is untouched: this is a function of where the fan stands, not an
// animation.
const DIM_PER_TIER = 0.05;

/** One tier of the fan: where a photo this far from the front stands.
 *
 *  `peek` is how much of this photo shows past the outer edge of the photo in
 *  front of it, as a share of its own visible width. An overlap stated that
 *  way is the same overlap whatever shape the print is, which a distance from
 *  the middle of the stage cannot be: a portrait print is narrower, so a seat
 *  measured from the middle left it floating beside the front instead of
 *  tucked under it. */
type FanDepth = { peek: number; drop: number; tilt: number; scale: number };

/** The two seats a photo stands in behind the front one, near tier first. */
type FanDepths = readonly [FanDepth, FanDepth];

/** How wide each seat's print is, as a share of the standard 4:3 print's
 *  width, keyed by the offset the seat stands at. The seats chain off one
 *  another, so where a print lands depends on the shapes of the prints
 *  between it and the front. */
export type FanFactors = Record<number, number>;

// Everything but x, which is seatCentre's: the front print has no peek.
const REST_DEPTH: Omit<FanDepth, "peek"> = { drop: 0, tilt: 0, scale: 1 };

// The two layouts run the same recipe and differ only in numbers. The desktop
// fan stands in a centered box with air either side; the phone fan is full
// bleed, its photos take more of the stage, and the outermost ones run off
// the screen edges, which is what says "there are more" without a strip of
// thumbnails saying it again.
//
// The peeks are the fan's old seats read back as overlaps, so a fan of 4:3
// prints stands where it always did. A tier's visible width is its scale, the
// front print's outer edge is at 0.5 of a print's width from the middle, and
// the two tiers put theirs at 0.855 and 0.93; peek is the step from one edge
// to the next over the tier's own visible width: (0.855 - 0.5) / 0.55 and
// (0.93 - 0.855) / 0.42.
//
// The second tier is the one exception, raised from that derived 0.179 to 0.28
// on purpose: the strip it showed was too thin to read as a photograph at all,
// which is the same complaint the paper margin answers from the other side.
export const DESKTOP_DEPTHS: FanDepths = [
  { peek: 0.645, drop: 6, tilt: 4.5, scale: 0.55 },
  { peek: 0.28, drop: 10, tilt: 7, scale: 0.42 },
];

// The same reading of the phone's old seats, whose outer edges were at 0.85
// and 0.92: (0.85 - 0.5) / 0.58 and (0.92 - 0.85) / 0.44. The second tier is
// raised from the derived 0.159 to 0.25 for the same reason the desktop's is.
export const PHONE_DEPTHS: FanDepths = [
  { peek: 0.603, drop: 7, tilt: 5, scale: 0.58 },
  { peek: 0.25, drop: 12, tilt: 8, scale: 0.44 },
];

// The desktop boxes: every photo box is the same height and is pulled into
// place by transforms, so the fan scales with the dialog instead of with a
// pixel guess.
//
// What the class states is --print-w, the width of a 4:3 print at this
// breakpoint. The print itself is sized inline off that, because a photo that
// is not 4:3 is drawn narrower (see printBox) and a media query cannot be
// written into an inline style.
const DESKTOP_PHOTO_BOX = "absolute bottom-0 left-1/2 [--print-w:58%]";
// A lone photo has no fan to sit in the middle of, so it takes more of the
// stage rather than floating there at fan size.
const DESKTOP_SOLO_BOX = "absolute bottom-0 left-1/2 [--print-w:72%]";
const DESKTOP_STAGE_ASPECT = "aspect-[2.3/1]";
const DESKTOP_SOLO_STAGE_ASPECT = "aspect-[1.85/1]";

// The phone's boxes come in two sizes: the compact tier for short phones,
// where every stage pixel is a card pixel not shown, and a taller tier from
// 760px of viewport up, where the card fits on screen either way and the
// photo may as well take the room. 760 splits the small phones from the rest:
// an SE-class 667 stays compact, anything iPhone X-shaped and up gets the
// large fan.
// Written out in full rather than composed from a shared prefix: Tailwind
// reads classes out of the raw source, and a name built through interpolation
// is one it never generates.
const PHONE_PHOTO_BOX =
  "absolute bottom-2 left-1/2 [--print-w:66%] [@media(min-height:47.5rem)]:[--print-w:80%]";
const PHONE_SOLO_BOX =
  "absolute bottom-2 left-1/2 [--print-w:76%] [@media(min-height:47.5rem)]:[--print-w:88%]";
const PHONE_STAGE_ASPECT =
  "aspect-[1.6/1] [@media(min-height:47.5rem)]:aspect-[1.22/1]";
const PHONE_SOLO_STAGE_ASPECT =
  "aspect-[1.5/1] [@media(min-height:47.5rem)]:aspect-[1.35/1]";

/**
 * How wide a print of this shape is drawn, as a share of the standard 4:3
 * print's width.
 *
 * Rounded because the number ends up in the CSS, and a ten-thousandth of a
 * print is a long way under a pixel. The seats read the same rounded number,
 * so where a print is drawn and where it is seated cannot drift apart.
 */
function printFactor(aspect: number) {
  return Math.round((aspect / PRINT_ASPECT) * 10000) / 10000;
}

/**
 * The box one print is drawn in, at the photo's own shape.
 *
 * The height of the standard 4:3 box is what stays fixed and the width gives
 * way, so a portrait print is a narrower card of the same height: the same
 * sheet of paper turned upright, rather than a bigger or smaller one. The
 * stage's own size is therefore untouched by what shape the photos are. Where
 * they stand is not, which is what seatCentre works out.
 */
function printBox(aspect: number) {
  return {
    width: `calc(var(--print-w) * ${printFactor(aspect)})`,
    aspectRatio: aspect,
  };
}

// The paper's margin, the width of the border a real print leaves around the
// picture. It belongs to the prints behind and not to the one in front: the
// front print is the photograph being looked at, and the grid card it was
// opened from has no paper round it either, so there the picture runs to the
// paper's own edge. Behind it the paper is what makes a strip legible as a
// stacked print: the second tier shows a narrow band of itself past the front,
// and with the picture running to the edge that band read as a photograph cut
// off rather than as a sheet peeking out from under another one.
//
// Six pixels at the front print's own size, reached a whole tier back. Stated
// once here and handed to the seat as a custom property the walk writes, so
// the well's clip and the corner it rounds to read the same number and the
// margin grows as a print is pushed back, on the same curve the shadow and the
// wash already run on. The seat carries the fan's scale transform, so a print
// at the second tier gets the same margin in proportion rather than the same
// margin in pixels.
const PRINT_MARGIN_PX = 6;

// A photo edge has to read against the photo, not against the surface behind
// it, so the border is drawn from the foreground: dark on light, light on
// dark.
//
// This is the paper alone: three layers down from the button, because each of
// them owns something the others must not touch. The seat holds MotionValues a
// drag writes every frame; the hover layer scales and straightens the photo
// without writing to them; and the paper clips the print, which is why the
// shadow that deepens as a photo comes forward is drawn beside it rather than
// on it.
const PHOTO_FRAME_CLASS =
  "origin-bottom overflow-hidden rounded-ui border border-foreground/10 bg-background";
// The picture's own well. Its ground is the one the blur placeholder paints
// over, so it is this and not the paper that fills while a photo is on its
// way, and it is a tint of the foreground rather than bg-muted: muted is near
// white on the light theme, so a print whose photo had not arrived read as a
// blank card. A ground clearly darker than the paper reads as a photograph
// coming.
//
// The margin is a clip, not an inset. The well fills the paper and the clip
// hides the outer band of the picture; inset by the margin instead, the well
// was re-laid-out as the margin was written, which measured 1.7 layouts per
// pointer move. At six pixels on a print this size it is the same picture,
// a hair larger under object-cover. The corner the clip rounds to follows the
// paper's, less the margin, which is what keeps the two curves concentric
// instead of leaving a fat wedge at each corner.
const PHOTO_WELL_CLASS =
  "absolute inset-0 bg-foreground/8 [clip-path:inset(var(--print-margin)_round_calc(var(--radius-ui)_-_var(--print-margin)))]";
// The seat: where the fan puts this photo, and where the focus ring is drawn.
//
// Pinned as a composited layer of its own, and told that nothing inside it can
// affect the layout outside. Measured on a drag at 4x CPU throttle: the pin
// took the long tasks from three to one and a third off the paint events, and
// halved the raster time. It costs a few hundred KB of GPU memory per print,
// which for the five the fan draws is a fair price.
const PHOTO_SEAT_CLASS =
  "origin-bottom rounded-ui outline-none will-change-transform contain-layout focus-visible:ring-2 focus-visible:ring-ring";

// The dialog counts photos where the grid card shows dots: the card is a
// thumbnail whose gallery is incidental, and this is the surface someone came
// to to look through them, where "4 / 12" is the useful answer.
//
// A fixed inset: the badge only ever sits on the front print, whose paper
// margin is zero, so reading that margin would leave it flush in the corner.
//
// A solid ground rather than a backdrop filter. What it stands on is a
// photograph the fan moves every frame, and a backdrop filter is re-sampled on
// every one of them by a real GPU. At 90% the count reads over any photo,
// which is all the blur was ever there for.
const PHOTO_BADGE_CLASS =
  "absolute right-1.5 bottom-1.5 h-5 bg-background/90 px-1.5 text-3xs tabular-nums shadow-xs";

/** How a fan settles, and how far a gesture may pull it past a step. */
export type FanTempo = {
  spring: { type: "spring"; stiffness: number; damping: number; mass: number };
  /** The finger can pull a little past the next photo, and the spring brings
   *  it back: the give is what says "you are at the step", the way a notch
   *  does. */
  overshoot: number;
};

const BALANCED_TEMPO: FanTempo = {
  spring: { type: "spring", stiffness: 420, damping: 26, mass: 0.5 },
  overshoot: 1.15,
};

/**
 * The fan's tempo, read off the animal's own energy.
 *
 * The same register as the Energija filter, whose three icons are a tempo
 * scale rather than a rating: tempo as identity. A calm animal's fan settles
 * softer and slower with no bounce, a lively one snaps and gives one small
 * bounce, and everything else keeps the numbers the fan has always had. The
 * ranges are deliberately narrow, so this reads as character rather than as a
 * gimmick, and reduced motion skips all of it the same as before.
 */
export function fanTempo(energy: EnergyLevel | undefined): FanTempo {
  if (energy === "calm") {
    return {
      spring: { type: "spring", stiffness: 300, damping: 30, mass: 0.6 },
      overshoot: 1.08,
    };
  }
  if (energy === "lively") {
    return {
      spring: { type: "spring", stiffness: 520, damping: 22, mass: 0.45 },
      overshoot: 1.22,
    };
  }
  return BALANCED_TEMPO;
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

// Where a photo stands on a continuous offset from the front, in everything
// but x: between the whole offsets the pose is read off the line between the
// tiers, so a photo halfway through a drag stands halfway between its two
// seats. Clamped at the second tier, which is as far out as a photo ever goes.
// x is seatCentre's, because it depends on the shapes of the prints as well as
// on the tier.
function continuousPose(offset: number, depths: FanDepths) {
  const side = offset < 0 ? -1 : 1;
  const depth = Math.min(Math.abs(offset), 2);
  const from = depth <= 1 ? REST_DEPTH : depths[0];
  const to = depth <= 1 ? depths[0] : depths[1];
  const t = depth <= 1 ? depth : depth - 1;
  return {
    drop: lerp(from.drop, to.drop, t),
    tilt: side * lerp(from.tilt, to.tilt, t),
    scale: lerp(from.scale, to.scale, t),
  };
}

// A photo the window has not reached yet is taken for a standard print: past
// the far edge there is no shape to know.
function factorAt(factors: FanFactors, offset: number) {
  return factors[offset] ?? 1;
}

// The shape standing at a fractional offset, read off the line between the two
// whole ones either side of it. Mid-walk the front is half one print and half
// the next, and so is every tier behind it; interpolating is what keeps the
// stack from jumping when the front changes shape under a drag.
function factorNear(factors: FanFactors, at: number) {
  const from = Math.floor(at);
  return lerp(factorAt(factors, from), factorAt(factors, from + 1), at - from);
}

/**
 * Where one print's centre sits at a whole tier, in units of the standard
 * print's width, out from the middle of the stage. Unsigned: the side is the
 * caller's.
 *
 * The stack is walked outward from the front. Every print lays `peek` of its
 * own visible width past the outer edge of the print in front of it, so the
 * overlap is a share of the print rather than a distance, and a portrait print
 * tucks under its neighbour as far as a landscape one does.
 *
 * `own` is this print's width, `front` the front print's, and `inside` the
 * widths of the prints between the two, innermost first.
 */
function tierCentre(
  tier: number,
  own: number,
  front: number,
  inside: readonly number[],
  depths: FanDepths,
) {
  let edge = front / 2;
  for (let t = 1; t < tier; t++) {
    edge += depths[t - 1].peek * inside[t - 1] * depths[t - 1].scale;
  }
  const visible = own * depths[tier - 1].scale;
  return edge + depths[tier - 1].peek * visible - visible / 2;
}

/**
 * Where the print at `offset` stands once the fan has been walked to `walk`:
 * its centre's distance from the middle of the stage, in units of the standard
 * print's width, negative on the left. Between the whole tiers the centre is
 * read off the line between the two seats, so a print halfway through a drag
 * stands halfway between them, and it is clamped at the second tier the same
 * way continuousPose clamps the rest of the pose.
 *
 * The seat is worked out for this print's own width, with the prints between
 * it and the front read off the window at the whole offsets on its side. At a
 * whole walk those are exactly the prints standing in the seats, which is what
 * lets the commit re-seat the window and zero the walk without anything
 * moving: a print one step out at walk 1 is the print at offset 1 once the
 * window has re-seated, and the two readings answer the same number.
 *
 * `own` is the print's own width where the caller knows it. A print stepping
 * into the window is seated off the window it is joining, whose record has no
 * entry for it yet, and the print itself is the one thing that knows its own
 * shape.
 */
export function seatCentre(
  offset: number,
  walk: number,
  depths: FanDepths,
  factors: FanFactors,
  own = factorAt(factors, offset),
) {
  const away = offset - walk;
  const side = away < 0 ? -1 : 1;
  const depth = Math.min(Math.abs(away), 2);
  const front = factorNear(factors, walk);
  const first = tierCentre(1, own, front, [], depths);
  if (depth <= 1) return side * lerp(0, first, depth);
  const inside = [factorAt(factors, offset - side)];
  return side * lerp(first, tierCentre(2, own, front, inside, depths), depth - 1);
}

// The window walks around the list, so the active photo is always in the
// middle and every photo stays reachable however many there are.
function fanSlots(count: number, active: number): { index: number; offset: number }[] {
  // Two photos have no middle to walk around. Wrapping put the other one on
  // the right both times, which read as a mistake; keeping it on the side it
  // belongs on by number means it swaps sides as you switch, and the pair
  // stays balanced whichever one you are looking at.
  if (count === 2) {
    return [
      { index: 0, offset: 0 - active },
      { index: 1, offset: 1 - active },
    ];
  }
  const span = Math.min(count, FAN_LIMIT);
  const half = Math.floor((span - 1) / 2);
  const slots = [];
  for (let offset = -half; offset <= span - 1 - half; offset++) {
    slots.push({ index: (active + offset + count) % count, offset });
  }
  return slots;
}

/** The photos outside the window that a step is about to mount: both edges one
 *  step out, and both edges two, because a hard flick walks two photos at once
 *  and reaches one tier further than a single step does. Empty while the whole
 *  set is already on stage, because then there is nothing to bring in. */
function enteringSlots(count: number, active: number): number[] {
  if (count <= FAN_LIMIT) return [];
  const onStage = new Set(fanSlots(count, active).map((slot) => slot.index));
  const edge = Math.floor((FAN_LIMIT - 1) / 2) + 1;
  // Six or seven photos wrap the far pair back onto photos the fan is already
  // holding, and both edges can land on the same index. Warming either twice
  // is a second Image for a file already requested.
  return [
    ...new Set(
      [edge, -edge, edge + 1, -(edge + 1)]
        .map((offset) => (((active + offset) % count) + count) % count)
        .filter((index) => !onStage.has(index)),
    ),
  ];
}

/** What the window is holding, by shape: the print at each offset, as a share
 *  of the standard print's width. A seat is measured off the outer edge of the
 *  seat inside it, so a print's place depends on how wide the prints between it
 *  and the front are, and the fan is the only thing that knows which photo is
 *  in which seat. */
function fanShapes(
  slots: readonly { index: number; offset: number }[],
  images: readonly PermittedPhoto[],
): FanFactors {
  const held: FanFactors = {};
  for (const { index, offset } of slots) {
    held[offset] = printFactor(images[index].aspect ?? PRINT_ASPECT);
  }
  return held;
}

/** What one layout of the fan is, beyond the recipe both layouts share. */
type FanGeometry = {
  /** Names the layout for the tests and for anything reading the DOM. */
  slot: string;
  depths: FanDepths;
  photoBox: string;
  soloBox: string;
  stageAspect: string;
  soloStageAspect: string;
  /** What the layout adds around the stage. Neither side of the breakpoint is
   *  stated in CSS: only one geometry is ever mounted. */
  stageClass: string;
  /** Chevrons are a pointer affordance, and the phone has no pointer. */
  chevrons: boolean;
};

const PHONE_FAN: FanGeometry = {
  slot: "photo-fan",
  depths: PHONE_DEPTHS,
  photoBox: PHONE_PHOTO_BOX,
  soloBox: PHONE_SOLO_BOX,
  stageAspect: PHONE_STAGE_ASPECT,
  soloStageAspect: PHONE_SOLO_STAGE_ASPECT,
  // overflow-x-clip and not hidden: the neighbours have to clip at the screen
  // edge or they would hand the dialog's scroller a horizontal scrollbar, but
  // the drop still hangs the side photos a few pixels past the stage's bottom
  // and clip on one axis is the one combination that leaves the other visible.
  stageClass: "w-full overflow-x-clip",
  chevrons: false,
};

const DESKTOP_FAN: FanGeometry = {
  slot: "photo-spread",
  depths: DESKTOP_DEPTHS,
  photoBox: DESKTOP_PHOTO_BOX,
  soloBox: DESKTOP_SOLO_BOX,
  stageAspect: DESKTOP_STAGE_ASPECT,
  soloStageAspect: DESKTOP_SOLO_STAGE_ASPECT,
  stageClass: `mx-auto ${STAGE_WIDTH}`,
  chevrons: true,
};

// Tailwind's sm, the line the two geometries were drawn either side of. Read
// rather than left to CSS because the fan used to mount both layouts and hide
// one of them: 38 nodes, five eager images and fifty MotionValues idling for a
// fan nobody could see.
const DESKTOP_FAN_QUERY = "(min-width: 640px)";

function subscribeToFanQuery(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_FAN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readFanQuery() {
  return window.matchMedia(DESKTOP_FAN_QUERY).matches;
}

// Never drawn: the dialog only exists once an animal is open, and the animal
// comes from a location store whose own server snapshot is empty. The answer
// still has to be a constant, because React reads it while hydrating.
function fanQueryOnServer() {
  return false;
}

/** Which geometry the fan stands in, live: a resize across the breakpoint
 *  swaps it. */
function useDesktopFan() {
  return useSyncExternalStore(
    subscribeToFanQuery,
    readFanQuery,
    fanQueryOnServer,
  );
}

/** The print at the front of this stage, or null while there is no stage.
 *
 *  The chevrons and the count live on the stage too, and neither of them is a
 *  print: aria-pressed is what only a print carries, and only the front print
 *  carries it true. Three callers ask this question, for focus on the way in,
 *  for the rectangle the contact sheet grows out of, and for focus on the way
 *  back from the lightbox. */
function frontPrintOf(stage: HTMLElement | null) {
  return stage?.querySelector<HTMLElement>('button[aria-pressed="true"]') ?? null;
}

// Keyboard focus straightens a photo the same way a hover does, but only the
// kind of focus that is meant to be seen. jsdom does not implement the
// selector, and a photo that cannot answer the question simply does not lift.
function isFocusVisible(element: Element) {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * One photo of the fan. Its pose is a pure function of how far it stands from
 * the front minus how far the gesture has walked, so the whole fan moves under
 * a drag as one thing, every frame, without a re-render.
 *
 * Memoised, and every prop the fan hands it is stable across a render that
 * does not concern this print. Without that, anything that re-rendered the fan
 * rebuilt the ten MotionValues below for all five prints, which is what the
 * press at the start of a drag used to cost.
 *
 * Where a print stands is a MotionValue for the same reason: a commit moves
 * every seat, and as a number it re-rendered all five prints at the end of
 * every step. What actually changes at a commit is which two prints trade the
 * front, and only those two are handed a different prop.
 */
const FanPhoto = memo(function FanPhoto({
  photo,
  index,
  offset,
  count,
  progress,
  depths,
  factors,
  box,
  nudge,
  entrance,
  tempo,
  label,
  active,
  hoverable,
  onSelect,
  onOpenLightbox,
}: {
  photo: PermittedPhoto;
  index: number;
  /** How far this print stands from the front, in photos. A value rather than
   *  a number: a commit re-seats every print, and only the two trading the
   *  front have anything else to re-render for. */
  offset: MotionValue<number>;
  count: number;
  /** How far the fan has been walked, in photos: +1 is one step forward. */
  progress: MotionValue<number>;
  depths: FanDepths;
  /** The shapes of the whole window, because this print's seat is measured off
   *  the edges of the prints between it and the front. A ref and not the
   *  record itself: it is rebuilt at every commit, so as a prop it would
   *  re-render all five prints. A transform re-runs whenever the offset or the
   *  walk changes, and the commit jumps both, so what it reads is always the
   *  record the commit has just written. */
  factors: RefObject<FanFactors>;
  box: string;
  nudge: number;
  /** Whether this mount should cascade in, and with how much delay. */
  entrance: number | false;
  tempo: FanTempo;
  label: string;
  active: boolean;
  /** Whether a pointer on this photo should lift and straighten it. */
  hoverable: boolean;
  /** Walks this print to the front. It is told which print and where that
   *  print is standing, so the fan can build one callback for all five rather
   *  than a closure per seat. */
  onSelect: (index: number, offset: number) => void;
  /** Opens the print in front, from the box it is standing in. */
  onOpenLightbox: (from: DOMRect) => void;
}) {
  const aspect = photo.aspect ?? PRINT_ASPECT;
  // The seat is a distance in standard print widths and x is a percentage of
  // this element's own width, which is that same standard scaled by the
  // print's factor. A narrower print therefore travels more of itself to stand
  // in the same place, in exactly the proportion it is narrower by.
  const factor = printFactor(aspect);
  // Every pose below is read off the pair: where this print is seated and how
  // far the fan has been walked. A commit changes both in one paint, and the
  // difference between them is what a print is drawn from, so it lands where
  // it already stood.
  const x = useTransform(
    [offset, progress],
    ([o, p]: number[]) =>
      `${-50 + (seatCentre(o, p, depths, factors.current, factor) / factor) * 100}%`,
  );
  const y = useTransform([offset, progress], ([o, p]: number[]) =>
    continuousPose(o - p, depths).drop,
  );
  const rotate = useTransform([offset, progress], ([o, p]: number[]) => {
    const at = o - p;
    // The nudge belongs to the stack: it fades in as the photo leaves the
    // front, so the one being looked at always hangs straight.
    return continuousPose(at, depths).tilt + nudge * Math.min(Math.abs(at), 1);
  });
  const scale = useTransform([offset, progress], ([o, p]: number[]) =>
    continuousPose(o - p, depths).scale,
  );
  // Rounded, because z-index has no halves: the order swaps exactly when two
  // photos cross, which is when they visually trade places.
  const zIndex = useTransform([offset, progress], ([o, p]: number[]) =>
    Math.round(20 - Math.min(Math.abs(o - p), 3)),
  );
  // The softer, wider shadow belongs to the photo in front. It used to be
  // switched on at the commit, which made it the last thing in the fan that
  // snapped rather than walked; read off the same curve the wash blends its
  // light on, it deepens as a print is pulled forward.
  const depth = useTransform([offset, progress], ([o, p]: number[]) =>
    frontness(o, p),
  );
  // The paper follows the same curve from the other end: no margin at the
  // front, the whole of it a tier back and further.
  //
  // Rounded to a half pixel, and the coarseness is the point rather than a
  // tidy-up. The well below clips itself to this margin, so every distinct
  // value re-rasterises the clipped photograph; at a hundredth of a pixel that
  // was a new value on nearly every frame of a drag, for a difference nobody
  // can see. Half-pixel steps make the whole walk thirteen values.
  const printMargin = useTransform([offset, progress], ([o, p]: number[]) => {
    const back = Math.min(Math.abs(o - p), 1);
    return `${Math.round(PRINT_MARGIN_PX * back * 2) / 2}px`;
  });

  // 0 at rest, 1 while a mouse or a visible focus is on this photo. The three
  // hover effects are all read off it, on a layer of their own: the seat above
  // is holding four MotionValues that a drag writes every frame, and a hover
  // animating the same numbers would be two owners for one transform. The
  // straighten is derived from the tilt the seat is holding rather than from a
  // remembered one, so it stays correct mid-drag.
  const hover = useMotionValue(0);
  const hoverRun = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => () => hoverRun.current?.stop(), []);
  const hoverScale = useTransform(hover, (h) => 1 + (HOVER_SCALE - 1) * h);
  const hoverLift = useTransform(hover, (h) => -HOVER_LIFT_PX * h);
  const hoverRotate = useTransform(
    [rotate, hover],
    ([tilt, level]: number[]) => -HOVER_STRAIGHTEN * tilt * level,
  );
  // Light falls off with depth, and a hover hands one tier of it back: the
  // print under the pointer is the one a click would pick, so it comes back up
  // towards the front's own light. Two tiers is as far back as the fan goes,
  // the same clamp continuousPose makes, and nothing is dimmed below zero,
  // which is what the floor is for.
  //
  // Rounded to a hundredth for the same reason the margin is rounded to a half
  // pixel: a thousandth of a stop is a value nobody can see and a style write
  // the browser still has to make. Two tiers is a tenth of light in total, so
  // hundredths are ten steps across the whole fall-off.
  const dim = useTransform(
    [offset, progress, hover],
    ([o, walked, level]: number[]) => {
      const back = Math.min(Math.abs(o - walked), 2);
      const shade = Math.max(0, DIM_PER_TIER * back - DIM_PER_TIER * level);
      return Math.round(shade * 100) / 100;
    },
  );

  function setHover(on: boolean) {
    if (on && !hoverable) return;
    hoverRun.current?.stop();
    hoverRun.current = animate(hover, on ? 1 : 0, tempo.spring);
  }

  // A side photo picked with the mouse still over it arrives at the front
  // lifted, and the front is not hoverable, so no leave would ever put it
  // down. Losing the right to hover is what puts it down.
  useEffect(() => {
    if (hoverable || hover.get() === 0) return;
    hoverRun.current?.stop();
    hoverRun.current = animate(hover, 0, tempo.spring);
  }, [hoverable, hover, tempo]);

  return (
    <m.button
      type="button"
      // Which of the two a press means is the print's own to decide, off
      // `active`: the one in front opens, the rest walk here.
      onClick={(event) => {
        if (!active) {
          onSelect(index, offset.get());
          return;
        }
        // Where it is standing right now, so the lightbox can grow out of it
        // rather than appear over it.
        onOpenLightbox(event.currentTarget.getBoundingClientRect());
      }}
      // Touch never hovers: a tap would otherwise leave a photo lifted with
      // nothing to take the hover off it again.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHover(false);
      }}
      onFocus={(event) => {
        if (isFocusVisible(event.currentTarget)) setHover(true);
      }}
      onBlur={() => setHover(false)}
      aria-pressed={active}
      aria-label={label}
      // The margin is stated on the seat rather than on the paper, because the
      // well it insets is under here and because it is read off the same walk
      // the seat's own transforms are. motion writes a MotionValue custom
      // property through style.setProperty, so it changes with the drag rather
      // than with a render. The cast is React's missing key for a CSS
      // variable, nothing more.
      style={
        {
          x,
          y,
          rotate,
          scale,
          zIndex,
          ...printBox(aspect),
          "--print-margin": printMargin,
        } as MotionStyle
      }
      className={cn(
        box,
        PHOTO_SEAT_CLASS,
        // The one in front opens; the rest are there to be pulled across. The
        // grabbing hand is the whole stage's while a mouse drag is running,
        // this photo included, because the cursor sits over a photo the entire
        // time and the stage's own rule cannot reach through it.
        active ? "cursor-zoom-in" : count > 1 && "cursor-grab",
        count > 1 && "group-data-dragging:cursor-grabbing",
      )}
      initial={entrance === false ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        entrance === false
          ? { duration: 0 }
          : { ...tempo.spring, delay: entrance }
      }
    >
      {/* The hover layer carries transforms and nothing else. It cannot clip,
          because the shadow below is drawn outside the frame's own edges. */}
      <m.div
        className="absolute inset-0 origin-bottom"
        style={{ scale: hoverScale, y: hoverLift, rotate: hoverRotate }}
      >
        {/* The front photo's deeper shadow, under the frame and outside it:
            the frame is opaque, so all that shows of this is the spill. */}
        <m.div
          aria-hidden
          className="absolute inset-0 rounded-ui shadow-sm"
          style={{ opacity: depth }}
        />
        {/* The paper. It carries no MotionValue of its own: the margin it
            shows is the seat's custom property, and the light is the layer
            over the picture below. */}
        <div
          data-slot="photo-print"
          className={cn("absolute inset-0 shadow-xs", PHOTO_FRAME_CLASS)}
        >
          <div data-slot="photo-well" className={PHOTO_WELL_CLASS}>
            {/* Decorative on purpose: the button around it is already named
                "PokaĹľi fotografijo 2" / "Odpri fotografijo 2 ...", and an alt
                here would say the same photo twice. The lightbox this opens is
                where the picture gets its own alternative. */}
            <AnimalPhoto
              photo={photo}
              alt=""
              // What the fan's photos really measure. On a phone the stage is
              // full bleed and the front photo takes 66-80% of it; on a desktop
              // the dialog caps at 48rem, the stage takes 80% of that and a
              // photo 58% of the stage, which is about 22rem. The wash behind
              // the fan runs off the thumb and carries its own.
              //
              // No AVIF here, deliberately: the fan draws five photos, four of
              // them scaled to under 60%, and the AVIF sibling only exists at
              // the cached copy's full width. Serving it would hand the whole
              // fan the largest file there is.
              sizes={FAN_PHOTO_SIZES}
              // Every print the fan draws is on stage the moment the dialog
              // opens, so none of them is a candidate for deferring: a
              // neighbour that opened as an empty card was the most visible
              // thing the paper margin made worse, and the browser's lazy
              // heuristic has no reason to hold back images that are already
              // on the screen. The front print asks for the front of the queue
              // as well, because it is the one being looked at.
              eager={active}
              loading="eager"
              className="object-cover"
            />
            {/* Depth in light, over the picture and inside the well, so the
                paper keeps its own colour. A layer's opacity is composited;
                the brightness filter this replaces repainted the photograph
                itself on every frame of a drag. */}
            <m.div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: dim }}
            />
          </div>
        </div>
      </m.div>
      {/* The count sits on the photo being looked at, and it is what tells
          you how many there are in total. Outside the hover layer, so it is
          not scaled with the picture.

          A mark and nothing else, so it is hidden from assistive technology:
          the live line at the bottom of the stage already says which photo of
          how many is on show. Past SHEET_FROM the count is also the way into
          the whole set, and a control cannot be nested inside this button; the
          fan draws it over this print instead. */}
      {active && count > 1 && count < SHEET_FROM && (
        <Badge aria-hidden variant="secondary" className={PHOTO_BADGE_CLASS}>
          {index + 1} / {count}
        </Badge>
      )}
    </m.button>
  );
});

/**
 * The front print's own box, laid over it.
 *
 * Two controls stand in it, the count and the chevrons, and neither may be
 * nested inside the print's button: one is a control of its own and the other
 * would be a button inside a button. Both have to take the front print's shape
 * rather than the standard one, or they end up out in the air beside a
 * portrait photograph instead of at its edges.
 *
 * Transparent to the pointer, so a drag started on the photograph still
 * reaches the stage under here; what wants presses takes them back for itself.
 */
function FrontPrintBox({
  box,
  photo,
  children,
}: {
  /** The layout's photo box, which is where the print itself stands. */
  box: string;
  /** The photo at the front, absent only for an index no photo answers. */
  photo: PermittedPhoto | undefined;
  children: ReactNode;
}) {
  return (
    <div
      style={printBox(photo?.aspect ?? PRINT_ASPECT)}
      className={cn(box, "pointer-events-none z-30 -translate-x-1/2")}
    >
      {children}
    </div>
  );
}

/**
 * The fan, in one of the two geometries. Which one is chosen from the
 * breakpoint above, so only that one is mounted. A gesture walks it live,
 * whichever gesture it is: a finger, a mouse held down, or two fingers on a
 * trackpad. Release either snaps the next photo home or puts everything back.
 */
function Fan({
  geometry,
  images,
  name,
  activeIndex,
  tempo,
  washProgress,
  stageRef,
  keptFocusRef,
  onSelect,
  onOpenLightbox,
  onOpenSheet,
}: {
  geometry: FanGeometry;
  images: PermittedPhoto[];
  /** Whose photos these are, for the name the stage announces itself by. */
  name: string;
  activeIndex: number;
  tempo: FanTempo;
  /** The stage element, held above this component so the lightbox can ask the
   *  fan where to hand focus back to. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Whether the fan the breakpoint has just replaced was holding the
   *  keyboard. Held above too, because the swap remounts this whole component
   *  and the answer has to survive it. */
  keptFocusRef: RefObject<boolean>;
  /** The wash's copy of the walk, mounted above the fan. */
  washProgress?: MotionValue<number>;
  onSelect: (index: number) => void;
  onOpenLightbox: (from: DOMRect) => void;
  /** Opens the lightbox on the contact sheet instead of on one photo. */
  onOpenSheet: (from: DOMRect) => void;
}) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const count = images.length;
  const solo = count === 1;
  const slots = useMemo(
    () => fanSlots(count, activeIndex),
    [count, activeIndex],
  );
  // Read once per window rather than once per render, and the memo is what
  // makes that true: two tests count the shapes the fan reads to tell a print
  // rendering again from the fan rendering around it, and rebuilding the
  // record on every render reads every photo on stage.
  const shapes = useMemo(() => fanShapes(slots, images), [slots, images]);
  // Handed to the prints as a ref rather than as a prop. Every print reads the
  // whole record to find its seat, and the record is rebuilt at every commit,
  // so as a prop it would re-render all five of them, which is the render this
  // arrangement exists to avoid. A print's transforms re-run whenever its
  // offset or the walk changes, and the commit effect below jumps both, so
  // what they read is always the record of the window they are standing in.
  //
  // Written by that effect, alongside the jumps, and not during the render:
  // until the commit lands, every offset still counts from the old window, and
  // the old record is the one those offsets are right against. A print
  // stepping into the window builds its first pose during the render, before
  // the effect, off the old record and its old-window offset, which agree; the
  // one thing the old record cannot tell it is its own width, so the print
  // hands seatCentre that itself.
  const factors = useRef(shapes);

  // One MotionValue per print on stage, holding how far it stands from the
  // front. Keyed by the photo, so a print keeps the same value for as long as
  // it is on stage and its offset can be re-seated without React hearing about
  // it. Made on the render that first mounts the print and dropped by the
  // commit effect when it leaves.
  //
  // A print that steps into the window is made in the commit's own render,
  // while the walk still reads the step it just took and before the effect
  // below zeroes it. Its pose is offset minus walk, so a seat made at the bare
  // offset would draw it a whole step too close, on top of its neighbour, for
  // the first paint, and the re-seating that follows was measured to miss the
  // print that had only just mounted. Made at offset plus walk instead, it
  // stands where it belongs from its first paint, and the effect's jump to the
  // bare offset with the walk at zero is the same pose again: nothing it shows
  // depends on being told.
  const seats = useRef(new Map<number, MotionValue<number>>());
  function seatOf(index: number, offset: number) {
    const held = seats.current.get(index);
    if (held) return held;
    const made = motionValue(offset + progress.get());
    seats.current.set(index, made);
    return made;
  }

  // The stage itself. What a mouse drag changes is the cursor and the text
  // selection, twice a gesture, and it is written straight onto the element:
  // as React state a press re-rendered all five prints and rebuilt every
  // MotionValue in them, and the attribute arriving through React invalidated
  // the style of every descendant with it. Between them they were the two
  // longest tasks in the drag's trace, both at the start of the gesture.
  function setDragging(on: boolean) {
    const element = stageRef.current;
    if (!element) return;
    if (on) element.dataset.dragging = "true";
    else delete element.dataset.dragging;
  }

  // Whether the keyboard is standing on one of this stage's prints. Asked
  // before a commit rather than after it, because a commit is what unmounts
  // the print focus is on and by then the answer is gone. Any print and not
  // just the front one, so the attribute is read rather than its value; see
  // frontPrintOf for why aria-pressed is the thing to read.
  function focusOnPrint() {
    const stage = stageRef.current;
    const held = document.activeElement;
    return Boolean(
      stage &&
        held instanceof HTMLElement &&
        stage.contains(held) &&
        held.hasAttribute("aria-pressed"),
    );
  }

  // Puts the keyboard back on the print in front. Only ever called where it
  // was on a print already, so it never takes focus from anything else.
  function focusFrontPrint() {
    frontPrintOf(stageRef.current)?.focus({ preventScroll: true });
  }

  // Set at a commit, read once the new window is in the tree. A walk past the
  // second seat takes the print focus was on out of the window and unmounts
  // it, which used to drop focus to the dialog: three arrows in, the fan
  // stopped answering the keyboard and Enter no longer opened the photo on
  // show.
  const refocusFront = useRef(false);

  // The two geometries are separate fans and the breakpoint swaps them by
  // remounting (see the key on <Fan>), so a print holding focus goes with the
  // old one. Read on the way out, while the button is still in the document,
  // and answered by the fan that replaces it.
  useLayoutEffect(() => {
    if (keptFocusRef.current) {
      keptFocusRef.current = false;
      focusFrontPrint();
    }
    return () => {
      keptFocusRef.current = focusOnPrint();
    };
    // Mount and unmount only: the print in front is where focus lands either
    // way, and nothing this reads is a render's to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  const progress = useMotionValue(0);
  const snap = useRef<ReturnType<typeof animate> | null>(null);
  // A snap that outlives the fan would keep a frame loop alive.
  useEffect(() => () => snap.current?.stop(), []);

  // The wash reads the same walk, so its light changes while a print is being
  // pulled in rather than after it lands. The jump that commits a step is a
  // change too, so the wash lands with the photos.
  const mirrorWash = useCallback(
    (walked: number) => washProgress?.set(walked),
    [washProgress],
  );
  useMotionValueEvent(progress, "change", mirrorWash);

  // The walk commits by re-seating the window and zeroing the progress in the
  // same breath. The zero has to wait for the new window to be in the tree, or
  // one frame would draw the old seats at rest; a layout effect runs between
  // the two paints, which is exactly the gap it must land in.
  //
  // Both halves are jumps here, and nothing moves through either: a print's
  // pose is its offset minus the walk, so the print at offset 1 with the walk
  // at 1 stands at the front, and so does the same print at offset 0 with the
  // walk back at 0. The two jumps land in the same paint, which is what lets
  // the three prints that only change seats sit out the commit entirely.
  //
  // The offsets go first, because the walk is what the prints are measured
  // against. The reduced-motion path commits with no walk to zero and needs
  // the same re-seating.
  const pendingReset = useRef(false);
  useLayoutEffect(() => {
    // The record first, because the jumps below are what make the prints read
    // it, and they have to find the window they are being seated into.
    factors.current = shapes;
    for (const { index, offset } of slots) {
      seats.current.get(index)?.jump(offset);
    }
    // A print that has left the window takes its seat with it.
    const onStage = new Set(slots.map((slot) => slot.index));
    for (const index of seats.current.keys()) {
      if (!onStage.has(index)) seats.current.delete(index);
    }
    if (pendingReset.current) {
      pendingReset.current = false;
      progress.jump(0);
    }
    // After the re-seat, so the print it lands on is the one now in front.
    if (refocusFront.current) {
      refocusFront.current = false;
      focusFrontPrint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, shapes, progress]);

  // Where the walk in flight is going, in seats, and 0 once it has landed or
  // while nothing is walking. It outlives the animation on purpose: a press
  // stops the walk so a finger can catch the fan, and if that press turns
  // into nothing the fan has to carry on to where it was going rather than
  // sit where it was caught, with one print at the front and another named
  // by the count. A step taken while a walk is in flight adds to this too.
  //
  // Seats and photos are the same number the whole way round the window, so
  // adding a step to this and reading the photo off the sum is sound however
  // short the gallery is; which of the two the number means only matters
  // where the fan has to travel it.
  const heading = useRef(0);

  // Walks the fan `delta` seats and then commits `target` as the new front.
  // Also the reduced-motion path, where the walk is skipped and the commit is
  // instant.
  //
  // The target is a photo and not a callback, because whether the fan is going
  // anywhere at all is what decides how the walk is put away. A walk that
  // lands back on the photo it started from re-seats nothing: the slots come
  // out the same, React bails out of the identical state update, and the
  // layout effect that zeroes the walk never runs. The fan was then left
  // holding a walk of two with nothing at its front. Landing has to put the
  // progress back itself in that case, and only a real change of front may
  // wait for the commit, or a frame paints the old seats at rest.
  function walkTo(delta: number, target: number) {
    snap.current?.stop();
    heading.current = delta;
    const reseats = target !== activeIndex;
    const land = () => {
      heading.current = 0;
      if (!reseats) {
        progress.jump(0);
        return;
      }
      refocusFront.current = focusOnPrint();
      pendingReset.current = true;
      onSelect(target);
    };
    if (shouldReduceMotion) {
      land();
      return;
    }
    const run = animate(progress, delta, tempo.spring);
    snap.current = run;
    run.then(() => {
      // A superseded walk must not also commit: only the one still holding
      // the slot gets to.
      if (snap.current !== run) return;
      land();
    });
  }

  // The latest walk, for the callback the prints hold. That callback has to
  // be the same function from render to render or the prints could not be
  // memoised, and walkTo is not: it closes over the tempo and the reduced
  // motion setting. So the prints are handed a function that never changes
  // and reads the current walk out of here when it is pressed.
  const latestWalk = useRef(walkTo);
  useLayoutEffect(() => {
    latestWalk.current = walkTo;
  });

  // One callback for all five prints, rather than a closure per seat: which
  // print was pressed and where it stands are what the print itself knows, so
  // it says both and this stays the same function from render to render.
  const selectPhoto = useCallback(
    (index: number, offset: number) => {
      latestWalk.current(offset, index);
    },
    [],
  );

  // As far as a print can be walked from: the window holds two seats either
  // side of the front, and there is nothing further out to travel from.
  function clampWalk(delta: number) {
    return Math.max(-2, Math.min(2, delta));
  }

  // How far the fan walks to bring `target` to the front, when the caller was
  // going to travel `away` seats to reach it.
  //
  // The two are not the same number on a short gallery, which is what used to
  // snap the prints into place at the commit: fanSlots keeps a pair of photos
  // on their numbered sides, so stepping right from the second of two walks
  // left, and a walk of two on a gallery of three or four seats its target at
  // -1 while the fan walks +2 through seats that do not exist. The seat the
  // photo is actually standing in is what the fan has to travel, so it is
  // looked up rather than assumed. A photo outside the window has no seat and
  // falls back to what the caller asked for.
  function walkFor(target: number, away: number) {
    return slots.find((slot) => slot.index === target)?.offset ?? away;
  }

  // Walks `delta` photos on from the front the window is seated on. A delta
  // that nets to nothing, and a short gallery where the walk wraps back onto
  // the photo already in front, are both the fan going back to where it stood.
  function walkBy(delta: number) {
    const clamped = clampWalk(delta);
    const target = (activeIndex + clamped + count) % count;
    if (clamped === 0 || target === activeIndex) {
      springBack();
      return;
    }
    walkTo(walkFor(target, clamped), target);
  }

  // Two quick presses are two photos: a step taken while a walk is in flight
  // adds to where it is going rather than replacing it, which used to lose
  // the second press.
  //
  // Unless the two together only wrap back onto the photo the walk in flight
  // is leaving, which is what a second arrow the same way is on a gallery of
  // two. Walking two seats to arrive where the fan is already going reads as
  // the fan breaking, so the press is dropped and the walk in flight lands;
  // the next press starts from there. A press that nets to zero is a different
  // thing, the cancel walkBy answers with a spring back, and it goes through.
  function step(direction: -1 | 1) {
    if (count < 2) return;
    const next = clampWalk(heading.current + direction);
    if (next !== 0 && (activeIndex + next + count) % count === activeIndex) {
      return;
    }
    walkBy(next);
  }

  // What a press that turned into nothing hands back. A walk it caught goes
  // on to where it was going; a drag let go short of anywhere, or a fan that
  // was caught between seats with no destination left, goes to the nearest
  // seat, which for anything under half a step is where it stood.
  function settleWalk() {
    if (heading.current !== 0) {
      walkBy(heading.current);
      return;
    }
    const at = progress.get();
    if (at === 0) return;
    walkBy(Math.round(at));
  }

  // Where Home and End land. The longest gallery in the register runs to
  // fourteen photos, which is a long walk one arrow at a time, and the card
  // gallery answers both keys already.
  //
  // The fan walks rather than jumps, because the walk is what says the stack
  // moved. A photo the window is holding is walked the offset it stands at, so
  // it travels to the front from where it was standing. A photo outside the
  // window has no seat to travel from, so the fan takes one step the short way
  // round and commits straight to it: the stack still moves, and it moves the
  // way the photo lies.
  function walkToIndex(target: number) {
    if (target === activeIndex) return;
    const forward = (target - activeIndex + count) % count;
    walkTo(walkFor(target, 2 * forward <= count ? 1 : -1), target);
  }

  // Not far, not fast: the fan goes back to where it stood.
  function springBack() {
    heading.current = 0;
    if (shouldReduceMotion) return;
    snap.current?.stop();
    snap.current = animate(progress, 0, tempo.spring);
  }

  function clampToOvershoot(value: number) {
    return Math.max(-tempo.overshoot, Math.min(tempo.overshoot, value));
  }

  // The swipe's own state. A single slot: the fan walks one step per
  // gesture, so there is nothing for a second finger to do but be ignored.
  const swipeStart = useRef<{
    x: number;
    y: number;
    time: number;
    width: number;
    pointerId: number;
    mouse: boolean;
  } | null>(null);
  const swipeAxis = useRef<"x" | "y" | null>(null);
  // A gesture that committed to the horizontal is the fan's, whether or not
  // it went far enough to turn the page. The click the browser still fires at
  // whatever photo the pointer ended on must not also select or open it.
  const suppressTap = useRef(false);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    suppressTap.current = false;
    if (count < 2) return;
    // Only the primary button drags. A right or middle press opens a menu or
    // starts an autoscroll, neither of which ends with a pointerup the fan
    // will see, so the gesture it began would never be put down.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A second finger has nothing to do. A mouse has no second pointer, so a
    // start still held here is a press that was released off the stage before
    // the drag declared its axis and took the capture: stale, and overwritten.
    if (swipeStart.current && !swipeStart.current.mouse) return;
    snap.current?.stop();
    snap.current = null;
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      width: event.currentTarget.clientWidth || 1,
      pointerId: event.pointerId,
      mouse: event.pointerType === "mouse",
    };
    swipeAxis.current = null;
    if (event.pointerType === "mouse") setDragging(true);
  }

  // Every one of these three answers only to the pointer that started the
  // gesture. A second finger on the stage sends its own moves and its own
  // release through the same handlers, and measured from the first finger's
  // origin they walked or ended a gesture that was not theirs.
  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (swipeAxis.current === null) {
      // The vertical belongs to the dialog, whose scroll and dismiss gesture
      // both ask for vertical dominance and so can never claim the gesture
      // this fan takes.
      swipeAxis.current = declareAxis(dx, dy);
      // Still short of the slop, so it could yet turn out to be a tap.
      if (swipeAxis.current === null) return;
      // The finger has the fan now, and where a caught walk was going is no
      // longer anyone's business but the finger's.
      if (swipeAxis.current === "x") heading.current = 0;
      // The capture waits for the axis, and only a mouse ever gets one. Taken
      // on the press it would retarget the click the browser fires afterwards
      // to this stage, and a plain click on a photo would never reach the
      // photo. By the time a gesture has declared itself horizontal it is no
      // longer a click, its tap is suppressed below either way, and the
      // capture is what keeps the drag alive once the cursor leaves the stage.
      //
      // Touch never gets one, on purpose. A touch pointer is implicitly
      // captured to the photo it pressed and those events bubble through this
      // stage; an explicit capture would fight the dialog's dismiss gesture
      // over the same pointer, and whoever called last would win.
      if (start.mouse && swipeAxis.current === "x") {
        // Optional call: jsdom has no pointer capture, and a drag that cannot
        // be captured still works, it just stops tracking a cursor that leaves.
        event.currentTarget.setPointerCapture?.(start.pointerId);
      }
    }
    if (swipeAxis.current !== "x" || shouldReduceMotion) return;
    // The fan under the pointer, live. Dragging left pulls the next photo in,
    // which is the fan walking forward.
    progress.set(clampToOvershoot(-dx / (start.width * SWIPE_SPAN_RATIO)));
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const axis = swipeAxis.current;
    releasePointer(event.currentTarget, start.pointerId);
    swipeStart.current = null;
    swipeAxis.current = null;
    setDragging(false);
    // A press that never became a drag: a tap, a click on a print, or a hand
    // that caught the fan and let it go. Whatever it stopped carries on.
    if (axis !== "x") {
      settleWalk();
      return;
    }
    suppressTap.current = true;

    const dx = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.time);
    const verdict = swipeVerdict({ dx, elapsed, width: start.width });
    if (verdict === 0) {
      springBack();
      return;
    }
    // A hard flick carries two photos, so a long set can be got through
    // without one gesture per picture. The verdict above has already said the
    // gesture commits and which way; how hard it was thrown is the fan's own
    // question, and nothing else asks it. See FLICK_TWO_PX_MS.
    const two =
      count > FAN_LIMIT &&
      Math.abs(dx) / elapsed > FLICK_TWO_PX_MS &&
      Math.abs(dx) > MIN_SWIPE_PX;
    if (two) {
      // Not through step: a flick replaces where the fan was going rather
      // than adding to it, and the axis already cleared the heading.
      walkBy(2 * verdict);
      return;
    }
    step(verdict);
  }

  // A cancelled pointer is not a decision, and it ends with no click to
  // suppress. The fan settles the same way it does after a press that went
  // nowhere: a caught walk carries on, a drag goes to the nearest seat.
  function cancelSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== start.pointerId) return;
    releasePointer(event.currentTarget, start.pointerId);
    swipeStart.current = null;
    swipeAxis.current = null;
    suppressTap.current = false;
    setDragging(false);
    settleWalk();
  }

  function swallowSwipedTap(event: MouseEvent<HTMLDivElement>) {
    if (!suppressTap.current) return;
    suppressTap.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // One horizontal trackpad swipe is one photo: the travel accumulates until
  // it crosses the same threshold a drag does, and everything after that
  // belongs to the inertia rather than to a second decision. The gesture is
  // the hook's; the fan supplies its own numbers and what to do with them.
  const attachWheel = useWheelStep({
    enabled: count > 1,
    commitRatio: SWIPE_DISTANCE_RATIO,
    spanRatio: SWIPE_SPAN_RATIO,
    settleMs: WHEEL_SETTLE_MS,
    // Not while a walk is in flight: the wheel writing the same number the
    // spring is animating would have the two fighting over the fan. A swipe
    // that reaches a step still adds one through onStep.
    onTravel: (fraction) => {
      if (shouldReduceMotion || heading.current !== 0) return;
      progress.set(clampToOvershoot(fraction));
    },
    onStep: step,
    // A gesture that turned a photo has already handed the fan to the walk.
    // One that did not puts back what it moved, or lets a walk it found in
    // flight finish.
    onSettle: (spent) => {
      if (spent) return;
      if (heading.current !== 0) settleWalk();
      else springBack();
    },
  });

  // The element has two owners: the wheel hook attaches its own non-passive
  // listener to it as it arrives, and the drag writes data-dragging on it.
  // Stable, or React would take the listener down and put it back up on every
  // render.
  const stage = useCallback(
    (element: HTMLDivElement | null) => {
      stageRef.current = element;
      attachWheel(element);
    },
    [attachWheel, stageRef],
  );

  return (
    <div
      ref={stage}
      data-slot={geometry.slot}
      // A group, not a listbox or a tablist, and named the same way the card
      // gallery names its own: nothing here is chosen or selected, the visitor
      // is walking one picture at a time, and which one is showing is the live
      // line at the bottom of this stage. The keys were answered in silence
      // until now, so the shortcuts are stated where a reader can find them.
      role="group"
      aria-label={t("photoAltSingle", { name })}
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      // Arrows walk the fan one photo and Home and End walk it to the ends,
      // while focus is anywhere inside it. The page must not scroll out from
      // under the visitor doing either.
      onKeyDown={(event) => {
        // A lone photo has nowhere to walk, and swallowing the key would take
        // the page's own scroll with it.
        if (count < 2) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        if (event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        walkToIndex(event.key === "Home" ? 0 : count - 1);
      }}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onClickCapture={swallowSwipedTap}
      // The browser's own image drag would otherwise start a ghost of the
      // photograph the moment a mouse drag passes the slop, and the fan would
      // be walking under a picture stuck to the cursor.
      onDragStart={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      // touch-pan-y touch-pinch-zoom, same grammar as the card gallery: the
      // fan owns the horizontal, the dialog keeps its scroll, and the pinch
      // stays for whoever needs the photo bigger.
      // Static, all of it: what a drag switches is data-dragging on the element
      // itself, which the variants below read without a render.
      className={cn(
        "group relative touch-pan-y touch-pinch-zoom",
        geometry.stageClass,
        solo ? geometry.soloStageAspect : geometry.stageAspect,
        count > 1 &&
          "cursor-grab data-dragging:cursor-grabbing data-dragging:select-none",
      )}
    >
      {/* Empty paper frames used to stand behind the outermost photos for a
          set the fan cannot show at once. They read as blank cards rather than
          as the rest of a stack, so what says there are more photos is the
          count in the corner, which opens the whole set. */}
      {slots
        .slice()
        .sort((a, b) => a.index - b.index)
        // Two refs are read here on purpose. The cascade is chosen from the
        // mount marker above, which has to be read where the transition is
        // built, and a print's seat value is looked up or made where the print
        // is built, because the print's transforms take it on their first
        // render. Both reads are idempotent, so a re-render cannot land on a
        // different answer, which is what the rule is guarding against.
        // eslint-disable-next-line react-hooks/refs
        .map(({ index, offset }) => {
          const active = offset === 0;
          return (
            <FanPhoto
              key={index}
              photo={images[index]}
              index={index}
              offset={seatOf(index, offset)}
              count={count}
              progress={progress}
              depths={geometry.depths}
              factors={factors}
              box={solo ? geometry.soloBox : geometry.photoBox}
              nudge={shouldReduceMotion ? 0 : TILT_NUDGE[index % TILT_NUDGE.length]}
              entrance={
                shouldReduceMotion || entered.current
                  ? false
                  : Math.abs(offset) * ENTRANCE_STAGGER
              }
              tempo={tempo}
              label={
                active
                  ? t("viewPhotoLarge", { n: index + 1 })
                  : t("showPhoto", { n: index + 1 })
              }
              active={active}
              hoverable={!active && !shouldReduceMotion}
              onSelect={selectPhoto}
              onOpenLightbox={onOpenLightbox}
            />
          );
        })}

      {/* On a set the fan cannot show at once, "4 / 12" is the one thing on
          the stage that names the whole gallery, so it is also the way into
          it. That makes it a control, and a control cannot be nested inside
          the print's own button: it used to sit in there aria-hidden, which
          left the only way to the contact sheet invisible to a screen reader
          and unreachable by tab.

          Drawn over the front print rather than in it, the way the chevrons
          already are, so the mark itself is unchanged. It is named for what it
          does and carries the count, because "Vse fotografije" alone would not
          say how many there are; the number it shows says which photo is on
          top, which the live line below states in words.

          The hit area grows and the mark does not: 20px of badge is under half
          the 44px a thumb is measured against, and a bigger chip on the
          photograph is the wrong answer. */}
      {count >= SHEET_FROM && (
        <FrontPrintBox box={geometry.photoBox} photo={images[activeIndex]}>
          <Badge
            asChild
            variant="secondary"
            className={cn(
              PHOTO_BADGE_CLASS,
              // The badge clips its own children, and the hit area below is
              // drawn outside its edges. Nothing else in here overflows.
              "pointer-events-auto cursor-pointer overflow-visible",
              "after:absolute after:-inset-2",
            )}
          >
            <button
              type="button"
              title={messages.allPhotos}
              aria-label={`${messages.allPhotos} (${count})`}
              onClick={(event) => {
                // The sheet grows out of the photograph, not out of the mark
                // in its corner.
                const stage = stageRef.current;
                const front = frontPrintOf(stage);
                onOpenSheet(
                  (front ?? stage ?? event.currentTarget).getBoundingClientRect(),
                );
              }}
            >
              {activeIndex + 1} / {count}
            </button>
          </Badge>
        </FrontPrintBox>
      )}

      {/* Over the active photo, in the same box it occupies. Hidden until
          the fan is hovered or focused, exactly like the card gallery. */}
      {geometry.chevrons && count > 1 && (
        <FrontPrintBox box={geometry.photoBox} photo={images[activeIndex]}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => step(-1)}
            aria-label={messages.previousPhoto}
            className={`${GALLERY_BUTTON_CLASS} pointer-events-auto left-1.5`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => step(1)}
            aria-label={messages.nextPhoto}
            className={`${GALLERY_BUTTON_CLASS} pointer-events-auto right-1.5`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </FrontPrintBox>
      )}

      {/* Lives inside the stage, with the photos it is counting. */}
      {count > 1 && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {t("photoCount", { current: activeIndex + 1, total: count })}
        </span>
      )}
    </div>
  );
}

/**
 * The dialog's photographs: the fan, and the lightbox it opens into.
 *
 * Memoised, and every prop the dialog hands it is already stable. Without it
 * every step through the photos rendered this whole subtree twice: the stage
 * wash above holds its layers in state, this component's layout effect writes
 * them, and the render that answers came back down through here.
 */
export const PhotoSpread = memo(function PhotoSpread({
  animal,
  initialIndex = 0,
  onIndexChange,
  washProgress,
  onWashWindow,
}: {
  animal: ClientAnimal;
  /** Which photo to open on. A shared link can name one; anything out of
   *  range falls back to the first, the same as no link at all. */
  initialIndex?: number;
  /** Reports the photo on show, so the share link can name it. */
  onIndexChange?: (index: number) => void;
  /**
   * The wash's copy of the fan's walk. Written by the fan, read by the wash
   * above.
   */
  washProgress?: MotionValue<number>;
  /**
   * The photos the stage wash should be holding, and where each of them stands
   * in the fan. The wash is mounted above this component so it outlives the
   * remount, which is the only way one animal's colour can fade into the next
   * one's.
   */
  onWashWindow?: (layers: WashLayer[]) => void;
}) {
  const { messages } = useI18n();
  // Already resolved and already filtered to what may be drawn.
  const images = animal.images;
  const [activeIndex, setActiveIndex] = useState(() =>
    clampPhotoIndex(initialIndex, images.length),
  );
  useEffect(() => {
    onIndexChange?.(activeIndex);
  }, [onIndexChange, activeIndex]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<DOMRect | undefined>(
    undefined,
  );
  // Which view the next visit opens on. The lightbox reads it on every open
  // and holds the visitor's own switching itself, so this only has to say what
  // was clicked to get there.
  const [lightboxView, setLightboxView] = useState<"photo" | "sheet">("photo");
  // One object per animal, because the fan's effects read it as a dependency.
  const tempo = useMemo(() => fanTempo(animal.energy), [animal.energy]);
  // Which set of numbers the fan stands in. One fan, not two: the geometry is
  // read here rather than left to sm:hidden, so the layout that is not on
  // screen is not in the document either.
  const geometry = useDesktopFan() ? DESKTOP_FAN : PHONE_FAN;
  // Both of these outlive the fan on purpose. The stage, because the lightbox
  // below has to ask it where focus belongs on the way out; the marker,
  // because the breakpoint remounts the fan and a print holding focus goes
  // with it.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const keptFocusRef = useRef(false);

  // Held across renders so the prints below can be memoised: a print handed a
  // fresh way into the lightbox on every render is a print that re-renders on
  // every render.
  const openLightbox = useCallback(
    (from: DOMRect, view: "photo" | "sheet" = "photo") => {
      setLightboxOrigin(from);
      setLightboxView(view);
      setLightboxOpen(true);
    },
    [],
  );
  const openSheet = useCallback(
    (from: DOMRect) => openLightbox(from, "sheet"),
    [openLightbox],
  );

  // Where the lightbox hands focus back when the print it was opened from has
  // left the fan's window. The front print is the answer, and there is always
  // one: this component draws the gallery instead when there are no photos at
  // all. Nothing is returned if it somehow is not there, which leaves the
  // restore to the lightbox's own dialog rather than sending focus to an
  // element that cannot take it.
  const returnFocusToFan = useCallback(
    () => frontPrintOf(stageRef.current),
    [stageRef],
  );

  // The fan is remounted per animal, and a walk the step interrupted would
  // otherwise leave the shared progress standing where it was abandoned.
  useLayoutEffect(() => {
    washProgress?.jump(0);
  }, [washProgress]);

  // Reported rather than read from above, because which photos are on stage is
  // this component's business. An animal with nothing to show reports nothing
  // and the wash goes out with it.
  // The wash runs off the 112px thumb, which is derived from the cached copy
  // and named after it, so it is the photo's own src the wash needs.
  //
  // The front photo and its two neighbours, and not the whole window: every
  // layer is a blurred image, which is the most expensive thing on the stage,
  // and the two outer offsets only ever showed during a two-step walk. There
  // the colour now arrives when the step lands rather than while it runs.
  const washLayers = useMemo(
    () =>
      fanSlots(images.length, activeIndex)
        .filter(({ offset }) => Math.abs(offset) <= 1)
        .map(({ index, offset }) => ({
          offset,
          source: images[index].src,
        })),
    [images, activeIndex],
  );
  // A layout effect, not an effect. A step commits by re-seating the fan and
  // jumping its progress to zero in one paint, and layers arriving a paint
  // later would put the old photo's wash back at full weight for a frame.
  // React flushes a state update made in a layout effect before the browser
  // paints, which is what closes that gap.
  useLayoutEffect(() => {
    onWashWindow?.(washLayers);
  }, [onWashWindow, washLayers]);

  // Only the five on stage are mounted, so a step past the edge used to pop a
  // blank frame in and fill it afterwards. Everything a gesture could bring in
  // is fetched as soon as the front changes, a hard flick's two steps
  // included: enteringSlots reaches one tier further out than a single step
  // does. That is why there is nothing to warm when a gesture starts. The set
  // keeps a photo from being asked for twice.
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    preloadPhotos(
      enteringSlots(images.length, activeIndex).map((index) => images[index]),
      FAN_PHOTO_SIZES,
      preloaded.current,
    );
  }, [images, activeIndex]);

  if (images.length === 0) {
    return (
      <PhotoGallery
        images={images}
        name={animal.name}
        sizes="(max-width: 639px) 100vw, 24rem"
        className="relative aspect-[4/3] w-full overflow-hidden bg-muted sm:mx-auto sm:w-[58%] sm:rounded-ui sm:border"
      />
    );
  }

  return (
    <>
      {/* One recipe, two sets of numbers, and the breakpoint above picks which
          it is drawn in. Wider screens get the whole set at once: the chosen
          one large in the middle, the rest tilted and tucked behind it. The
          phone used to get a full-width hero with a thumbnail strip, which
          spent 365px saying what the fan says in less: which photo is on show,
          that there are more, and where you are among them. The wash that used
          to sit here is mounted by the dialog now, so it survives this
          component being remounted for the next animal.

          Keyed on the geometry: a resize across the breakpoint remounts the
          fan rather than re-seating five prints under a new set of numbers.
          The entrance cascade replays when that happens, which is accepted;
          the photo on show does not change, because the index is held here. */}
      <Fan
        key={geometry.slot}
        geometry={geometry}
        images={images}
        name={animal.name ?? messages.unnamed}
        activeIndex={activeIndex}
        tempo={tempo}
        washProgress={washProgress}
        stageRef={stageRef}
        keptFocusRef={keptFocusRef}
        onSelect={setActiveIndex}
        onOpenLightbox={openLightbox}
        onOpenSheet={openSheet}
      />

      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        title={animal.name ?? messages.unnamed}
        originRect={lightboxOrigin}
        initialView={lightboxView}
        // Stepping inside the lightbox walks the fan behind it, so the print
        // it was opened from can be two seats out and unmounted by the time
        // it closes. The print now in front is where focus belongs then.
        returnFocusFallback={returnFocusToFan}
      />
    </>
  );
});
