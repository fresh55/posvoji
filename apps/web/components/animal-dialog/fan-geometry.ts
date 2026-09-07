import { PRINT_ASPECT, type PermittedPhoto } from "@/lib/animal-images";
import type { EnergyLevel } from "@posvoji/schema";

// Five photos is where a fan still reads as a fan. Past that the window walks
// the rest into view as the visitor steps through them.
export const FAN_LIMIT = 5;

/** One tier of the fan: where a photo this far from the front stands.
 *
 *  `peek` is how much of this photo shows past the outer edge of the photo in
 *  front of it, as a share of its own visible width. An overlap stated that
 *  way is the same overlap whatever shape the print is, which a distance from
 *  the middle of the stage cannot be: a portrait print is narrower, so a seat
 *  measured from the middle left it floating beside the front instead of
 *  tucked under it. */
export type FanDepth = {
  peek: number;
  drop: number;
  tilt: number;
  scale: number;
};

/** The two seats a photo stands in behind the front one, near tier first. */
export type FanDepths = readonly [FanDepth, FanDepth];

/** How wide each seat's print is, as a share of the standard 4:3 print's
 *  width, keyed by the offset the seat stands at. The seats chain off one
 *  another, so where a print lands depends on the shapes of the prints
 *  between it and the front. */
export type FanFactors = Record<number, number>;

// Everything but x, which is seatCentre's: the front print has no peek.
export const REST_DEPTH: Omit<FanDepth, "peek"> = {
  drop: 0,
  tilt: 0,
  scale: 1,
};

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

/**
 * How wide a print of this shape is drawn, as a share of the standard 4:3
 * print's width.
 *
 * Rounded because the number ends up in the CSS, and a ten-thousandth of a
 * print is a long way under a pixel. The seats read the same rounded number,
 * so where a print is drawn and where it is seated cannot drift apart.
 */
export function printFactor(aspect: number) {
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
export function printBox(aspect: number) {
  return {
    width: `calc(var(--print-w) * ${printFactor(aspect)})`,
    aspectRatio: aspect,
  };
}

/** How a fan settles, and how far a gesture may pull it past a step. */
export type FanTempo = {
  spring: { type: "spring"; stiffness: number; damping: number; mass: number };
  /** The finger can pull a little past the next photo, and the spring brings
   *  it back: the give is what says "you are at the step", the way a notch
   *  does. */
  overshoot: number;
};

export const BALANCED_TEMPO: FanTempo = {
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

export function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

// Where a photo stands on a continuous offset from the front, in everything
// but x: between the whole offsets the pose is read off the line between the
// tiers, so a photo halfway through a drag stands halfway between its two
// seats. Clamped at the second tier, which is as far out as a photo ever goes.
// x is seatCentre's, because it depends on the shapes of the prints as well as
// on the tier.
export function continuousPose(offset: number, depths: FanDepths) {
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
export function factorAt(factors: FanFactors, offset: number) {
  return factors[offset] ?? 1;
}

// The shape standing at a fractional offset, read off the line between the two
// whole ones either side of it. Mid-walk the front is half one print and half
// the next, and so is every tier behind it; interpolating is what keeps the
// stack from jumping when the front changes shape under a drag.
export function factorNear(factors: FanFactors, at: number) {
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
export function tierCentre(
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
  return (
    side * lerp(first, tierCentre(2, own, front, inside, depths), depth - 1)
  );
}

// The window walks around the list, so the active photo is always in the
// middle and every photo stays reachable however many there are.
export function fanSlots(
  count: number,
  active: number,
): { index: number; offset: number }[] {
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
export function enteringSlots(count: number, active: number): number[] {
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
export function fanShapes(
  slots: readonly { index: number; offset: number }[],
  images: readonly PermittedPhoto[],
): FanFactors {
  const held: FanFactors = {};
  for (const { index, offset } of slots) {
    held[offset] = printFactor(images[index].aspect ?? PRINT_ASPECT);
  }
  return held;
}
