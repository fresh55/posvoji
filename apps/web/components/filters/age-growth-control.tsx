"use client";

import { Leaf } from "lucide-react";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
  type Transition,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import { memo, useEffect, useId, useState, type ReactNode } from "react";
import {
  AGE_WILT,
  AgeStageIcon,
  ageDrawSeconds,
  type AgeStage,
} from "@/components/filters/age-stage-icon";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardTail,
  SIDEBAR_LABEL_CLASS,
  countClass,
  filterCardVariants,
  sidebarLabelInk,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  NOTE_TYPE,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  resetDelayStyle,
  useFilterCardGestures,
  useOneShotCelebration,
  useResetStagger,
  waitThen,
  type FilterCardGestureHandlers,
  type Pose,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FilterOption, Unanswered } from "@/lib/filters";
import { groupLabel } from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Keyframes = { values: number[]; times: number[]; duration: number };

/** A pose over time: degrees times the plant's lean, px times the same, and
 *  a vertical squash, all on one clock. */
type Gesture = {
  rotate: number[];
  x: number[];
  scaleY: number[];
  times: number[];
  duration: number;
};

function still(length: number, value: number): number[] {
  return Array.from({ length }, () => value);
}

// Each stage grows at its own tempo, the way each paw in Velikost lands with
// its own weight. The sprout shoots up past its height and flutters; the
// sapling springs up and swings three times, each swing slower and smaller
// than the sprout's; the shrub rises and sways once; the tree comes up slowly,
// barely overshoots, and swings long and deep enough to shake a leaf loose.
type Growth = {
  /** scaleY from the base while the paths draw. scaleX gives back what scaleY
   *  takes, so the plant reads as one body stretching rather than a picture
   *  being resized. */
  rise: Keyframes & { widths: number[] };
  /** Degrees, times the wind's direction. The first keyframe pair holds still
   *  until the plant has grown enough to be pushed. */
  sway: Keyframes;
  /** When the row's check confirms: once the plant has its leaves, not while
   *  the stem is still drawing. */
  checkDelay: number;
  /** What it does when it is unpicked, each in its own register: the sprout
   *  wilts and folds its leaves (the icon folds them on AGE_WILT's clock),
   *  the sapling whips over and springs back past upright, the shrub
   *  shivers, the tree gives a little as its leaf lets go. */
  farewell: Gesture;
  /** Degrees a reset's gust bends it: the sprout furthest, the tree least. */
  gust: number;
  /** Degrees the row's plant leans from its base toward a mouse or keyboard
   *  focus, on the spring it comes back on: the sprout bends furthest and
   *  wobbles, the tree gives a little and settles slowly. */
  lean: number;
  spring: { stiffness: number; damping: number; mass: number };
  /** The row's plant's height while it is held down, tucked toward its base.
   *  A tree gives the least. */
  tuck: number;
};

type Stage = {
  /** The grove size in px and the class that spells it. */
  grovePx: number;
  groveClassName: string;
  rowClassName: string;
  /** Where the plant's lowest stroke ends, in the icon's 24-unit box, with the
   *  sprout's soil left out the way the grove leaves it out. */
  base: number;
  rangeKey: Extract<TranslationKey, `ageRange${string}`>;
  captionKey: Extract<TranslationKey, `ageCaption${string}`>;
  growth: Growth;
};

const STAGES: Record<AgeStage, Stage> = {
  mladicek: {
    grovePx: 28,
    groveClassName: "size-7",
    rowClassName: "size-5",
    base: 21,
    rangeKey: "ageRangeBaby",
    captionKey: "ageCaptionBaby",
    growth: {
      rise: {
        values: [0.4, 1.16, 0.93, 1.03, 1],
        widths: [1, 0.92, 1.05, 0.99, 1],
        times: [0, 0.42, 0.64, 0.84, 1],
        duration: 0.5,
      },
      sway: {
        values: [0, 0, 9, -6, 3, 0],
        times: [0, 0.34, 0.52, 0.7, 0.86, 1],
        duration: 0.66,
      },
      checkDelay: 0.3,
      farewell: {
        rotate: [0, 7, 5, 0],
        x: still(4, 0),
        scaleY: [1, 0.88, 0.91, 1],
        ...AGE_WILT,
      },
      gust: 10,
      lean: 7,
      spring: { stiffness: 420, damping: 11, mass: 0.4 },
      tuck: 0.9,
    },
  },
  // Every number here sits between the sprout's and the shrub's: a young
  // tree is springier than a bush and steadier than a shoot. The row's plant
  // stays at the sprout's size-5, where the sapling's own height already
  // stands it between the two (18px against 16.4 and 19).
  mlad: {
    grovePx: 30,
    groveClassName: "size-7.5",
    rowClassName: "size-5",
    base: 22,
    rangeKey: "ageRangeYoung",
    captionKey: "ageCaptionYoung",
    growth: {
      rise: {
        values: [0.48, 1.11, 0.955, 1.015, 1],
        widths: [1, 0.94, 1.03, 0.995, 1],
        times: [0, 0.48, 0.72, 0.87, 1],
        duration: 0.53,
      },
      sway: {
        values: [0, 0, 7.5, -4, 1.5, 0],
        times: [0, 0.36, 0.55, 0.74, 0.88, 1],
        duration: 0.75,
      },
      checkDelay: 0.33,
      // A whip: bent over fast, it springs back past upright and each swing
      // back is slower and smaller than the one before.
      farewell: {
        rotate: [0, 6, -3.5, 1.5, -0.5, 0],
        x: still(6, 0),
        scaleY: still(6, 1),
        times: [0, 0.2, 0.44, 0.66, 0.84, 1],
        duration: 0.7,
      },
      gust: 8,
      lean: 6,
      spring: { stiffness: 380, damping: 12.5, mass: 0.5 },
      tuck: 0.91,
    },
  },
  odrasel: {
    grovePx: 36,
    groveClassName: "size-9",
    rowClassName: "size-5.5",
    base: 22,
    rangeKey: "ageRangeAdult",
    captionKey: "ageCaptionAdult",
    growth: {
      rise: {
        values: [0.55, 1.07, 0.98, 1],
        widths: [1, 0.96, 1.01, 1],
        times: [0, 0.55, 0.8, 1],
        duration: 0.56,
      },
      sway: {
        values: [0, 0, 6, -3, 0],
        times: [0, 0.38, 0.6, 0.82, 1],
        duration: 0.84,
      },
      checkDelay: 0.36,
      farewell: {
        rotate: [0, -1.6, 1.6, -1.2, 1.2, -0.6, 0.6, 0],
        x: [0, -0.4, 0.4, -0.3, 0.3, -0.15, 0.15, 0],
        scaleY: still(8, 1),
        times: [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.85, 1],
        duration: 0.5,
      },
      gust: 6,
      lean: 5,
      spring: { stiffness: 340, damping: 14, mass: 0.6 },
      tuck: 0.92,
    },
  },
  senior: {
    grovePx: 44,
    groveClassName: "size-11",
    rowClassName: "size-6",
    base: 22.5,
    rangeKey: "ageRangeSenior",
    captionKey: "ageCaptionSenior",
    growth: {
      rise: {
        values: [0.7, 1.03, 1],
        widths: [1, 0.99, 1],
        times: [0, 0.72, 1],
        duration: 0.7,
      },
      sway: {
        values: [0, 0, 6.5, -4, 1.8, 0],
        times: [0, 0.3, 0.52, 0.72, 0.88, 1],
        duration: 1.2,
      },
      checkDelay: 0.42,
      farewell: {
        rotate: [0, 1.2, -0.5, 0],
        x: still(4, 0),
        scaleY: still(4, 1),
        times: [0, 0.35, 0.7, 1],
        duration: 1,
      },
      gust: 4,
      lean: 3.5,
      spring: { stiffness: 260, damping: 17, mass: 0.9 },
      tuck: 0.94,
    },
  },
};

// The grove's colours come from --grove-* in globals.css, which is where the
// dark values and the contrast measurements live. Every canopy is leaf and
// every trunk is wood: drawn in wood alone, the shrub and the tree were two
// brown clouds, which reads as autumn rather than as an older animal. The rows
// wear them only while chosen, and the resting ink otherwise (RowPlant).
const LEAF_CLASS = "text-grove-leaf";
const WOOD_CLASS = "text-grove-wood";
const MUTED_CLASS = "text-muted-foreground";

// The phone sheet's four tiles: two rows of two until the screen takes four
// across. Four across at 320px left each tile 65px, and the check box in its
// corner ran into the plant, the tree by 1.3px and the shrub by 0.6px. At
// 360px the tiles are 75px and the nearest plant clears the box by 3.7px. In
// rem, so a larger text size, which grows everything inside a tile, keeps the
// two rows longer.
const SHEET_TILES_CLASS = "grid grid-cols-2 min-[22.5rem]:grid-cols-4";

const STANDARD_EASE = [0.16, 1, 0.3, 1] as const;
const CELEBRATION_GUARD_MS = 80;
// Half the icon's 1.7 stroke, in the same 24-unit box as STAGES[].base.
const HALF_STROKE = 0.85;
// The plant box's bottom padding, and the ground line's 1px inside it.
const PLANT_PADDING_PX = 4;
const GROUND_PX = 1;

// The two one-shots below exist only to be mounted and watched, so each sits
// in a presence boundary of its own, carrying the default `initial`: a parent
// presence saying initial={false} would hand them "already present" and write
// them straight to the pose they should end on (CollapsibleBody in
// filter-section-header.tsx says how the fold avoids that for itself).
//
// Named for what it does to its child rather than for the shape of the
// animation: "one shot" is already taken in this codebase by
// useOneShotCelebration, which is a different thing (a celebration that fires
// once per selection), and a wrapper sharing that word read as its JSX form.
function PlaysOnMount({ children }: { children: ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}

// The celebration is held for the whole of its longest part, or the tail of
// the sway snaps to rotate 0 when the state clears.
function celebrationSeconds(stage: AgeStage, reduceMotion: boolean) {
  if (reduceMotion) return 0;
  const { rise, sway } = STAGES[stage].growth;
  return Math.max(ageDrawSeconds(stage, false), rise.duration, sway.duration);
}

/**
 * How far a plant's box is lowered so its lowest stroke sits on the middle of
 * its ground line. Each mark ends at a different height in its 24-unit box
 * and they are drawn at four sizes, so one padding left the trees standing a
 * pixel above the ground and the sprout on a strip of soil of its own.
 */
export function groundSink(stage: AgeStage): number {
  const { base, grovePx } = STAGES[stage];
  const gap = ((24 - base - HALF_STROKE) * grovePx) / 24;
  return gap - GROUND_PX / 2;
}

// The tree drops a leaf from the edge of its canopy into open air, beside it
// rather than down its face: falling inside the outline, a leaf in the tree's
// own colour was lost in the drawing. Offsets are from the foot of the column
// to the leaf's centre, in px; side mirrors them. The canopy's shoulder is at
// (18.24, 10.19) in the 24-unit box, 11px out and 25px up at the grove's 44px,
// and its widest bulge 15px out, so the leaf leaves from 13px, half its own
// width on the canopy, and swings no nearer than 19px once it has let go.
const LEAF_SHOULDER = { x: 13, y: -25 };
// Where the leaf comes to rest: its centre 2.5px over the ground line.
const LEAF_REST_Y = -2.5;
const LEAF_FALL = {
  duration: 1.6,
  times: [0, 0.1, 0.3, 0.52, 0.75, 0.88, 1],
  // Out, back and out again as it drops: the swing of a leaf, not a stone.
  x: [0, 4, 10, 6, 12, 12, 12],
  // How much of the drop is behind it at each time.
  drop: [0, 0.08, 0.32, 0.6, 1, 1, 1],
  rotate: [-10, 0, 32, -12, 62, 62, 62],
  opacity: [0, 1, 1, 1, 1, 1, 0],
  // The green copy on top fades as it falls, so the leaf browns on the way
  // down. Two layers rather than a colour tween, because the tokens are
  // oklch and a crossfade is exact in any colour space.
  green: [1, 1, 0.8, 0.4, 0, 0, 0],
};
// When the tree lets go on a pick: at the top of its first swing.
const SHED_AT =
  STAGES.senior.growth.sway.times[2] * STAGES.senior.growth.sway.duration;
// The scale a plant outside the selection is drawn at, which a tree being
// unpicked is shrinking to as the leaf leaves it.
const WILTED_SCALE = 0.84;

type FallingLeaf = { id: number; delay: number; scale: number; side: number };
type Farewell = { stage: AgeStage; wait: number };

// A reset is a gust through the grove from the left: each plant bends with it
// in turn and springs back, the way Velikost's reset walks its paws off.
const GUST = {
  shape: [0, 1, -0.35, 0.12, 0],
  times: [0, 0.3, 0.6, 0.82, 1],
  duration: 0.7,
  // Slower than the reset's own 0.045s turn-taking, so it reads as wind
  // crossing the row rather than the plants moving together.
  stagger: 0.09,
};
// How long a plant still moving from a pick (its own growth, or its lean away
// from another's) takes to come upright before its farewell (waitThen's
// settle). The tree's lean is the slowest gesture an unpick can cut short,
// and at 0.24s the plant comes back no faster than it.
const FAREWELL_SETTLE = 0.24;
const STAGE_COUNT = Object.keys(STAGES).length;
const GUST_HOLD_MS =
  ((STAGE_COUNT - 1) * GUST.stagger + GUST.duration) * 1000 +
  CELEBRATION_GUARD_MS;
const FAREWELL_HOLD_MS =
  (FAREWELL_SETTLE +
    Math.max(
      ...Object.values(STAGES).map(({ growth }) => growth.farewell.duration),
    )) *
    1000 +
  CELEBRATION_GUARD_MS;

// When the gust reaches the plant at this index and bends it furthest.
function gustPeakAt(index: number): number {
  return index * GUST.stagger + GUST.times[1] * GUST.duration;
}

// Neighbours answer the grown plant's first push, not the click.
function swayStart(stage: AgeStage): number {
  const { sway } = STAGES[stage].growth;
  return sway.times[1] * sway.duration;
}

/**
 * Which way a plant leans when it moves by itself: right, except the last in
 * the row, which leans into the grove rather than off its edge.
 */
export function leanOf(index: number, lastIndex: number): 1 | -1 {
  return index === lastIndex ? -1 : 1;
}

const REST = { rotate: 0, x: 0, scaleX: 1, scaleY: 1 };
const SETTLE: Transition = { duration: 0.16 };

// A pose that only turns the plant, with the rest of its body at rest.
function turning({ keyframes, transition }: ReturnType<typeof waitThen>) {
  return {
    animate: { ...REST, rotate: keyframes },
    transition: { default: SETTLE, rotate: transition },
  };
}

export type PlantCue = {
  stage: AgeStage;
  index: number;
  lastIndex: number;
  reduceMotion: boolean;
  /** This plant was just picked. */
  growing: boolean;
  /** This plant was just unpicked. */
  leaving: boolean;
  /** How long its farewell waits for it to come upright first. The caller
   *  knows whether a pick was still moving it when the unpick came; this
   *  function sees only the pose it is in now. */
  farewellWait: number;
  /** A reset is blowing through the grove. */
  gusting: boolean;
  /** Another plant was just picked, and where it stands. */
  grown: { stage: AgeStage; index: number } | null;
};

/**
 * What a plant's body does now, as Motion's target and its timing. One place
 * decides between the gestures, so a pick outranks a gust, a gust outranks a
 * farewell, and a farewell outranks leaning away from a neighbour.
 *
 * Keyframed values get a transition of their own and everything else settles
 * on SETTLE: a flat transition carrying `times` would be applied to values
 * that have only a start and an end.
 *
 * Every gesture starts from wherever the plant is, because any of them can
 * cut another short, and a first keyframe written out, or held through a
 * delay, would draw a plant caught mid-swing straight in one frame.
 */
export function plantMotion(cue: PlantCue): Pose {
  if (cue.reduceMotion) return { animate: REST, transition: { duration: 0 } };

  const { growth } = STAGES[cue.stage];
  const lean = leanOf(cue.index, cue.lastIndex);

  if (cue.growing) {
    const rise = {
      duration: growth.rise.duration,
      times: growth.rise.times,
      ease: "easeOut" as const,
    };
    // The sway's first keyframe pair holds still until the plant is grown
    // enough to be pushed. With no wait of its own, that hold is where a
    // moving plant comes upright.
    const sway = waitThen(
      0,
      growth.sway.values.map((degrees) => lean * degrees),
      {
        duration: growth.sway.duration,
        times: growth.sway.times,
        ease: "easeInOut",
        settle: 0,
      },
    );
    return {
      animate: {
        ...REST,
        scaleY: growth.rise.values,
        scaleX: growth.rise.widths,
        rotate: sway.keyframes,
      },
      transition: {
        default: SETTLE,
        scaleY: rise,
        scaleX: rise,
        rotate: sway.transition,
      },
    };
  }

  if (cue.gusting) {
    // A plant still swaying comes upright over its turn's wait, on a linear
    // settle, which is the slowest pace a turn this short allows. One
    // stagger is too short even for that while the reset redraws the list
    // under it, so that plant holds where it is and the gust takes it from
    // there.
    const wait = cue.index * GUST.stagger;
    return turning(
      waitThen(wait, GUST.shape.map((share) => share * growth.gust), {
        duration: GUST.duration,
        times: GUST.times,
        ease: "easeInOut",
        settle: wait > GUST.stagger ? wait : 0,
        settleEase: "linear",
      }),
    );
  }

  if (cue.leaving) {
    const { farewell } = growth;
    const track = (keyframes: number[]) =>
      waitThen(cue.farewellWait, keyframes, {
        duration: farewell.duration,
        times: farewell.times,
        ease: "easeInOut",
        settle: cue.farewellWait,
      });
    const rotate = track(farewell.rotate.map((degrees) => lean * degrees));
    const clock = rotate.transition;
    return {
      animate: {
        ...REST,
        rotate: rotate.keyframes,
        x: track(farewell.x.map((px) => lean * px)).keyframes,
        scaleY: track(farewell.scaleY).keyframes,
      },
      transition: { default: SETTLE, rotate: clock, x: clock, scaleY: clock },
    };
  }

  if (cue.grown) {
    // Neighbours lean away from the plant that just grew, and one still
    // moving comes upright over the wait first.
    const away = Math.sign(cue.index - cue.grown.index) || 1;
    const wait =
      swayStart(cue.grown.stage) +
      Math.abs(cue.index - cue.grown.index) * 0.06;
    return turning(
      waitThen(wait, [0, away * 2.2, 0], {
        duration: 0.42,
        ease: "easeInOut",
        settle: wait,
      }),
    );
  }

  return { animate: REST, transition: SETTLE };
}

// How fast a held plant tucks down. The way back up is the stage's spring.
const TUCK_DURATION = 0.1;

export type RowPlantCue = {
  stage: AgeStage;
  /** A mouse is over the row, or keyboard focus is on it. */
  leaning: boolean;
  /** A pointer is held down on the row. */
  tucked: boolean;
  reduceMotion: boolean;
};

/**
 * What the row's plant does under the pointer, on two elements of its own,
 * so the two never write one property and the pick's rise runs inside both.
 *
 * The lean is the grove's own gesture brought down to the row: the plant bends
 * from its base toward the label as a mouse or the keyboard reaches it, where
 * every other row lifts its icon. A shear about the foot rather than a turn,
 * so the sprout's strip of soil stays level and only the plant above it bends;
 * turned, the whole drawing tipped over like a picture knocked askew. The tuck
 * is what a press gets, and the one gesture a phone gets before the pick: the
 * plant draws down toward its base, giving back in width what it loses in
 * height. A pick wipes the plant and grows it again from the ground while the
 * tuck springs back up under it, so the rise grows out of the tuck rather than
 * out of a plant snapped upright first.
 *
 * Both are two-value targets from wherever the plant is, on springs or a
 * short tween, so a pick, a leave or a release that cuts one short carries it
 * on from where it was.
 */
export function rowPlantPose(cue: RowPlantCue): { lean: Pose; tuck: Pose } {
  if (cue.reduceMotion) {
    return {
      lean: { animate: { skewX: 0 }, transition: { duration: 0 } },
      tuck: { animate: { scaleX: 1, scaleY: 1 }, transition: { duration: 0 } },
    };
  }
  const { lean, spring, tuck } = STAGES[cue.stage].growth;
  const settle: Transition = { type: "spring", ...spring };
  return {
    // A negative skew carries the top to the right, toward the label.
    lean: { animate: { skewX: cue.leaning ? -lean : 0 }, transition: settle },
    tuck: cue.tucked
      ? {
          animate: { scaleY: tuck, scaleX: 1 + (1 - tuck) / 2 },
          transition: { duration: TUCK_DURATION, ease: "easeOut" },
        }
      : { animate: { scaleX: 1, scaleY: 1 }, transition: settle },
  };
}

function leafKeyframes(scale: number, side: number) {
  const startY = LEAF_SHOULDER.y * scale;
  return {
    opacity: LEAF_FALL.opacity,
    x: LEAF_FALL.x.map((dx) => side * (LEAF_SHOULDER.x * scale + dx)),
    y: LEAF_FALL.drop.map((p) => startY + (LEAF_REST_Y - startY) * p),
    rotate: LEAF_FALL.rotate.map((degrees) => side * degrees),
  };
}

// The first frame of a keyframe list, as the pose a leaf mounts in.
function firstFrame<T extends Record<string, number[]>>(keyframes: T) {
  return Object.fromEntries(
    Object.entries(keyframes).map(([key, values]) => [key, values[0]]),
  ) as { [Key in keyof T]: number };
}

function isAgeStage(value: string): value is AgeStage {
  return value in STAGES;
}

export function isAgeStageActive(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

// The grove answers a pointer with its hover and nothing else. A press tucks
// the row's plant, and the grove keeps the motion it has always had.
function hoverOnly({
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
}: FilterCardGestureHandlers) {
  return { onPointerEnter, onPointerLeave, onFocus, onBlur };
}

// The colour a row's plant changes with. Not while it regrows: a pick wipes
// the plant and draws it again, and the strokes come back in the grove's
// colours from their first pixel rather than washing from grey to green as
// they grow. motion-reduce, because the reduced pick lands at once.
const TONE_TRANSITION =
  "transition-colors duration-200 motion-reduce:transition-none";

/**
 * A row's plant: the same drawing as the grove's, in the muted ink every
 * other row's icon rests in, and in the grove's colours only while the row
 * is chosen. The grove above says how old each stage is whether or not it is
 * picked; the row says what is picked, and green means chosen across the
 * panel. A dead stage is never chosen, so it stays grey too.
 *
 * It grows with the grove's plant, so the growth starts under the finger that
 * asked for it and not only a hand's width above. It rises and draws; the
 * sway stays in the grove, where there is room for it.
 *
 * Memoised: every prop is a primitive, and the section renders again for
 * each hover and press on any row.
 */
const RowPlant = memo(function RowPlant({
  stage,
  checked,
  celebrating,
  leaning,
  tucked,
  reduceMotion,
  resetDelay,
}: {
  stage: AgeStage;
  checked: boolean;
  /** Just picked: the plant is wiped and grown again. */
  celebrating: boolean;
  leaning: boolean;
  tucked: boolean;
  reduceMotion: boolean;
  /** The row's turn in a reset, which the colour waits for as it leaves. */
  resetDelay: number;
}) {
  const { rowClassName, growth } = STAGES[stage];
  const { rise } = growth;
  const pose = rowPlantPose({ stage, leaning, tucked, reduceMotion });
  const tone = celebrating ? undefined : TONE_TRANSITION;

  return (
    <m.span
      className="flex origin-bottom items-end justify-center"
      data-leaning={leaning && !reduceMotion ? "" : undefined}
      initial={false}
      animate={pose.lean.animate}
      transition={pose.lean.transition}
    >
      <m.span
        className="flex origin-bottom items-end justify-center"
        data-tucked={tucked && !reduceMotion ? "" : undefined}
        initial={false}
        animate={pose.tuck.animate}
        transition={pose.tuck.transition}
      >
        <m.span
          className="flex origin-bottom items-end justify-center"
          initial={false}
          animate={
            celebrating && !reduceMotion
              ? { scaleY: rise.values, scaleX: rise.widths }
              : { scaleY: 1, scaleX: 1 }
          }
          transition={
            reduceMotion
              ? { duration: 0 }
              : celebrating
                ? {
                    duration: rise.duration,
                    times: rise.times,
                    ease: "easeOut",
                  }
                : { duration: 0.16 }
          }
        >
          <AgeStageIcon
            stage={stage}
            draw={celebrating}
            reduceMotion={reduceMotion}
            className={cn(
              checked ? LEAF_CLASS : MUTED_CLASS,
              tone,
              rowClassName,
            )}
            // The trunk takes its colour from a class of its own, so it
            // needs the transition too, and it reads the svg's delay rather
            // than a second copy of the row's turn.
            woodClassName={cn(
              checked ? WOOD_CLASS : MUTED_CLASS,
              tone,
              "delay-[inherit]",
            )}
            style={resetDelayStyle(checked, resetDelay)}
          />
        </m.span>
      </m.span>
    </m.span>
  );
});

export function AgeGrowthControl({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
  unanswered,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
  unanswered?: Unanswered;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const [celebration, setCelebration] = useState<{
    value: AgeStage;
    id: number;
  } | null>(null);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue: hoveredAge,
    previewing: previewingAge,
    settle,
    pressedValue: pressedAge,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures();
  const [fallingLeaf, setFallingLeaf] = useState<FallingLeaf | null>(null);
  const farewell = useOneShotCelebration<Farewell>(FAREWELL_HOLD_MS);
  const gust = useOneShotCelebration<"reset">(GUST_HOLD_MS);
  const celebratingAge = celebration?.value ?? null;

  useEffect(() => {
    if (!celebration) return;
    const ms =
      celebrationSeconds(celebration.value, shouldReduceMotion) * 1000 +
      CELEBRATION_GUARD_MS;
    const timer = window.setTimeout(() => setCelebration(null), ms);
    return () => window.clearTimeout(timer);
  }, [celebration, shouldReduceMotion]);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebratingAge,
  );
  const lastIndex = options.length - 1;
  const seniorIndex = options.findIndex(({ value }) => value === "senior");
  const parting = farewell.celebration?.value;

  function dropLeaf(delay: number, scale: number, side: number) {
    if (shouldReduceMotion) return;
    setFallingLeaf((current) => ({
      id: (current?.id ?? 0) + 1,
      delay,
      scale,
      side,
    }));
  }

  // The rows and the grove above them both land here, so a plant pressed in
  // the grove grows, confirms and counts exactly as its row would.
  function applySelection(nextSelected: string[]) {
    const changed = changedValue(selected, nextSelected);
    if (!changed) return;

    // Touch browsers can skip pointerleave when the finger slides off, so the
    // pick clears the press too. The plant stands up straight from the pick
    // until the pointer or focus leaves: it grows upright rather than leaning.
    releasePress(changed);
    settle(changed);

    if (
      nextSelected.length === options.length ||
      !nextSelected.includes(changed) ||
      !isAgeStage(changed)
    ) {
      setCelebration(null);
      // While a pick's celebration runs, its sway and its neighbours' lean
      // are still moving the plants, so the farewell waits for this one to
      // come upright. The leaf waits with it.
      const farewellWait = celebration ? FAREWELL_SETTLE : 0;
      if (isAgeStage(changed) && !nextSelected.includes(changed)) {
        farewell.celebrate({ stage: changed, wait: farewellWait });
      }
      if (changed === "senior" && !nextSelected.includes(changed)) {
        // An empty selection is every stage again, so the tree keeps its
        // size and only a narrower one shrinks away under the leaf.
        dropLeaf(
          farewellWait,
          nextSelected.length === 0 ? 1 : WILTED_SCALE,
          leanOf(seniorIndex, lastIndex),
        );
      }
    } else {
      setCelebration((current) => ({
        value: changed,
        id: (current?.id ?? 0) + 1,
      }));
      if (changed === "senior") {
        dropLeaf(SHED_AT, 1, leanOf(seniorIndex, lastIndex));
      }
    }
    onToggle(changed);
  }

  function toggleFromGrove(value: string) {
    applySelection(
      selected.includes(value)
        ? selected.filter((current) => current !== value)
        : [...selected, value],
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <section>
        <FilterSectionHeader
          label={groupLabel("age", locale)}
          hint={messages.ageFilterHint}
          active={selected.length > 0}
          onReset={() => {
            setCelebration(null);
            farewell.clear();
            beginReset();
            if (!shouldReduceMotion) gust.celebrate("reset");
            // The gust takes a leaf with it when the tree was among the
            // picks, the way unpicking the tree by hand drops one, and blows
            // it downwind rather than to the side the tree leans to.
            if (selected.includes("senior")) {
              dropLeaf(gustPeakAt(seniorIndex), 1, 1);
            } else {
              setFallingLeaf(null);
            }
            onToggleMany(selected);
          }}
          resetAriaLabel={messages.resetAgeFilters}
          collapse={collapse}
        />

        <CollapsibleBody collapse={collapse}>
          <p id={hintId} className="sr-only">
            {messages.ageFilterHint}
          </p>

          {/* The grove is a second way to press the rows below, for a mouse
              or a finger, and nothing else. It stays aria-hidden and holds
              no tab stop: a screen reader and the keyboard have the rows,
              which say the same thing with a name, a range and a count, so
              the plants are spans that take a click rather than buttons. */}
          <div
            aria-hidden="true"
            data-age-view="grove"
            className="relative mb-2 grid grid-cols-4 px-1"
          >
            {/* The ground line sits 5px above the plant boxes' foot, which is
                where each column's own green stretch of it is drawn. */}
            <span
              className={cn(
                "pointer-events-none absolute inset-x-3 h-px bg-border",
                layout === "sheet"
                  ? "top-[calc(3rem-5px)]"
                  : "top-[calc(3.5rem-5px)]",
              )}
            />
            {options.map(({ value }, index) => {
              if (!isAgeStage(value)) return null;

              const stage = STAGES[value];
              const active = isAgeStageActive(selected, value);
              const checked = selected.includes(value);
              const pressable = checked || (counts.get(value) ?? 0) > 0;
              const celebrating = celebratingAge === value && active;
              const leaving = parting?.stage === value;
              const farewellWait = leaving ? parting.wait : 0;
              const body = plantMotion({
                stage: value,
                index,
                lastIndex,
                reduceMotion: shouldReduceMotion,
                growing: celebrating,
                leaving,
                farewellWait,
                gusting: gust.celebration !== null,
                grown:
                  celebratingAge && !celebrating && celebrationIndex >= 0
                    ? { stage: celebratingAge, index: celebrationIndex }
                    : null,
              });
              const hovered = hoveredAge === value;
              // A reset wakes the columns in order rather than all at once.
              const settleDelay = resetDelayOf(index);
              const leafFall = fallingLeaf
                ? leafKeyframes(fallingLeaf.scale, fallingLeaf.side)
                : null;

              return (
                <span
                  key={value}
                  data-age-stage={value}
                  data-stage-active={active ? "true" : "false"}
                  className={cn(
                    "flex flex-col items-center",
                    pressable && "cursor-pointer",
                  )}
                  onClick={pressable ? () => toggleFromGrove(value) : undefined}
                  {...(pressable ? hoverOnly(gestureHandlers(value)) : {})}
                >
                  <span
                    className={cn(
                      "relative flex w-full items-end justify-center",
                      layout === "sheet" ? "h-12" : "h-14",
                    )}
                    style={{
                      paddingBottom: PLANT_PADDING_PX - groundSink(value),
                    }}
                  >
                    <m.span
                      // The alpha belongs to this line rather than to the
                      // token, which globals.css records; --grove-ground is
                      // registered as a Tailwind colour there, so the modifier
                      // works here.
                      className="absolute inset-x-2 bottom-1 h-px origin-center bg-grove-ground/55"
                      initial={false}
                      animate={{
                        opacity: active ? 1 : 0.12,
                        scaleX: active ? 1 : 0.25,
                      }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.18,
                              delay: settleDelay,
                              ease: STANDARD_EASE,
                            }
                      }
                    />
                    {celebrating && !shouldReduceMotion ? (
                      <span className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                        <PlaysOnMount>
                          <m.span
                            key={celebration?.id}
                            className="size-[3px] rounded-full bg-grove-ground"
                            initial={{ opacity: 0.65, scale: 0.5 }}
                            animate={{ opacity: 0, scale: 2.5 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                          />
                        </PlaysOnMount>
                      </span>
                    ) : null}
                    {value === "senior" && fallingLeaf && leafFall ? (
                      <span className="pointer-events-none absolute bottom-1 left-1/2 -mb-1.5 -ml-1.5 size-3">
                        <PlaysOnMount>
                          <m.span
                            key={fallingLeaf.id}
                            className="absolute inset-0"
                            initial={firstFrame(leafFall)}
                            animate={leafFall}
                            transition={{
                              duration: LEAF_FALL.duration,
                              times: LEAF_FALL.times,
                              delay: fallingLeaf.delay,
                              ease: "easeInOut",
                            }}
                            onAnimationComplete={() =>
                              setFallingLeaf((current) =>
                                current?.id === fallingLeaf.id ? null : current,
                              )
                            }
                          >
                            <Leaf
                              className={cn("absolute inset-0 size-3", WOOD_CLASS)}
                              strokeWidth={2}
                            />
                            <m.span
                              className="absolute inset-0"
                              initial={{ opacity: LEAF_FALL.green[0] }}
                              animate={{ opacity: LEAF_FALL.green }}
                              transition={{
                                duration: LEAF_FALL.duration,
                                times: LEAF_FALL.times,
                                delay: fallingLeaf.delay,
                              }}
                            >
                              <Leaf
                                className={cn("size-3", LEAF_CLASS)}
                                strokeWidth={2}
                              />
                            </m.span>
                          </m.span>
                        </PlaysOnMount>
                      </span>
                    ) : null}
                    <m.span
                      className="flex origin-bottom items-end justify-center"
                      initial={false}
                      animate={
                        active
                          ? { opacity: 1, scale: hovered ? 1.04 : 1, y: 0 }
                          : hovered
                            ? { opacity: 0.75, scale: 0.9, y: 1 }
                            : { opacity: 0.5, scale: WILTED_SCALE, y: 2 }
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.24,
                              delay: settleDelay,
                              ease: STANDARD_EASE,
                            }
                      }
                    >
                      <m.span
                        className="flex origin-bottom items-end justify-center"
                        initial={false}
                        animate={body.animate}
                        transition={body.transition}
                      >
                        <AgeStageIcon
                          stage={value}
                          draw={celebrating}
                          wilt={leaving}
                          wiltDelay={farewellWait}
                          soil={false}
                          reduceMotion={shouldReduceMotion}
                          className={cn(LEAF_CLASS, stage.groveClassName)}
                          woodClassName={WOOD_CLASS}
                        />
                      </m.span>
                    </m.span>
                  </span>
                  {/* What each plant stands for, printed where the choice is
                      made. The ranges used to be a hover tooltip on the rows,
                      which a phone never shows.

                      Full muted ink whether or not the stage is picked. The
                      captions of the stages left out used to drop to half
                      opacity, which measured 2.08:1 light and 2.68:1 dark at
                      11px: words nobody could read, saying what the faded,
                      shrunken plant above them already says. The notes' size
                      (NOTE_TYPE): in the phone's sheet the 12px its tiles
                      print their labels and counts in. */}
                  <span
                    className={`mt-1 leading-none whitespace-nowrap text-muted-foreground tabular-nums ${NOTE_TYPE}`}
                  >
                    {messages[stage.captionKey]}
                  </span>
                </span>
              );
            })}
          </div>

          <ToggleGroup
            type="multiple"
            value={selected}
            onValueChange={applySelection}
            aria-label={groupLabel("age", locale)}
            aria-describedby={hintId}
            orientation={layout === "sheet" ? "horizontal" : "vertical"}
            // Every other section is plain buttons, where each option is its
            // own tab stop. Radix's roving focus would make this group one
            // stop that arrow keys move inside, so the same panel would
            // answer Tab in two ways depending on which section you were in.
            rovingFocus={false}
            spacing={layout === "sheet" ? 1.5 : 1}
            className={cn(
              "w-full items-stretch",
              layout === "sheet" && SHEET_TILES_CLASS,
            )}
          >
            {options.map(({ value, label }, index) => {
              if (!isAgeStage(value)) return null;

              const stage = STAGES[value];
              const count = counts.get(value) ?? 0;
              const checked = selected.includes(value);
              const celebrating = celebratingAge === value && checked;
              // A reset takes the rows' colour and halos back in turn, the
              // way the grove's gust crosses the plants.
              const resetDelay = resetDelayOf(index);
              // Upright from the press, and from the pick until the pointer
              // or focus has left, so the plant grows straight. Upright for
              // the whole growth as well: a pick made with the page scrolled
              // past the results scrolls it back to them (scrollToResults),
              // which moves the sidebar under a resting pointer. The pointer
              // leaves the row and comes back, the leave ends the settle, and
              // the plant took up its lean again mid-growth.
              const plant = (
                <RowPlant
                  stage={value}
                  checked={checked}
                  celebrating={celebrating}
                  leaning={
                    previewingAge(value) && pressedAge !== value && !celebrating
                  }
                  // The tuck yields the moment the growth takes over.
                  tucked={pressedAge === value && !celebrating}
                  reduceMotion={shouldReduceMotion}
                  resetDelay={resetDelay}
                />
              );

              return (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  disabled={count === 0 && !checked}
                  {...gestureHandlers(value)}
                  aria-label={`${label}, ${messages[stage.rangeKey]}, ${animalCount(count, locale)}`}
                  className={filterCardVariants({
                    layout,
                    selected: checked,
                    // DEAD_OPTION_CLASS by hand, because this section spells
                    // its own box rather than going through
                    // filterCardLayoutClass. Age is also the one section that
                    // keeps its dead stages in the sidebar, so without this it
                    // was the only place left where a zero-count option still
                    // drew at half opacity, with its mark already hidden: a
                    // 2.08:1 label beside an empty box.
                    className: cn(
                      DEAD_OPTION_CLASS,
                      layout === "sheet"
                        ? "flex h-[4.75rem] flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 text-center"
                        : // The row's surface comes from the layout variant;
                          // only its grid is stated here, because this is the
                          // one section whose row is columns rather than a
                          // flex line. The columns are the icon, the label
                          // and the count. The mark is not among them: it is
                          // pinned to the right edge the way every other facet
                          // pins it, and pr-9 is the room it sits in. It used
                          // to have the first column instead, which left this
                          // the one section in the sidebar whose check was on
                          // the other side of the row from the rest.
                          //
                          // The count's column is auto, so its width is the
                          // count's own (countClass): the same minimum and the
                          // same growth as the count in every other row.
                          //
                          // The icon's column is the icon well's size-7.5 and
                          // the gap is the flex rows' gap-2.5, so the plant
                          // stands in the well every other row's icon stands
                          // in and the label starts where theirs do. A 1.5rem
                          // column with gap-2 put Starost's labels 8px left of
                          // Spol's and Velikost's, and had no room for a halo.
                          "grid h-10 w-full shrink grid-cols-[1.875rem_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 pr-9 text-left",
                    ),
                  })}
                >
                  {/* The shared mark, so the check's position and its two
                      layouts are stated once in filter-card.tsx rather than
                      again here. It stays first in the markup because it is
                      aria-hidden and absolutely positioned in both layouts, so
                      where it sits in the DOM decides nothing; the row's own
                      aria-pressed is what says it is chosen. */}
                  <FilterCardMark
                    layout={layout}
                    checked={checked}
                    appearDelay={stage.growth.checkDelay}
                  />
                  {/* A row stands its plant in the icon well, whose halo
                      lights when the row is chosen, the way every other row
                      in the column lights. A tile has no well, as Spol's and
                      Velikost's have none: its plant stands alone in the
                      middle of the card. It stands in a slot as tall as the
                      tallest plant, on the slot's floor, so the plants'
                      heights no longer push their labels and counts to
                      different lines (34, 35 and 36px down when there were
                      three). */}
                  {layout === "sheet" ? (
                    <span
                      aria-hidden
                      className="flex h-6 items-end justify-center"
                    >
                      {plant}
                    </span>
                  ) : (
                    <FilterCardIconWell
                      layout={layout}
                      checked={checked}
                      exitDelay={resetDelay}
                    >
                      {plant}
                    </FilterCardIconWell>
                  )}
                  {/* The tile is the shared tail, so Starost cannot drift
                      from the drawer around it again: it printed its label at
                      11px over a 10px count while every other tile printed 12
                      over 11, because the sizes were copied here by hand. The
                      row cannot use the tail, which is a flex line, so it
                      draws its own two grid cells in the tail's voice.

                      leading-tight is the tile's own: the count sits under a
                      label that is allowed two lines. */}
                  {layout === "sheet" ? (
                    <FilterCardTail
                      layout={layout}
                      label={label}
                      checked={checked}
                      renderCount={(className) => (
                        <CountRoll
                          value={count}
                          className={cn(className, "leading-tight")}
                        />
                      )}
                    />
                  ) : (
                    <>
                      <span
                        className={cn(
                          "min-w-0",
                          SIDEBAR_LABEL_CLASS,
                          sidebarLabelInk(checked),
                        )}
                      >
                        {label}
                      </span>
                      <CountRoll
                        value={count}
                        className={countClass(layout, checked)}
                      />
                    </>
                  )}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <UnansweredNote tally={unanswered} />
        </CollapsibleBody>
      </section>
    </LazyMotion>
  );
}
