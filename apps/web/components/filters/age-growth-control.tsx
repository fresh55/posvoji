"use client";

import { Leaf } from "lucide-react";
import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AGE_WILT,
  AgeStageIcon,
  ageDrawSeconds,
  type AgeStage,
} from "@/components/filters/age-stage-icon";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
  FilterCardMark,
  FilterCardTail,
  SIDEBAR_LABEL_CLASS,
  countClass,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FilterOption, Unanswered } from "@/lib/filters";
import { groupLabel } from "@/lib/filters";
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
// its own weight. The sprout shoots up past its height and flutters; the shrub
// rises and sways once; the tree comes up slowly, barely overshoots, and swings
// long and deep enough to shake a leaf loose.
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
   *  the shrub shivers, the tree gives a little as its leaf lets go. */
  farewell: Gesture;
  /** Degrees a reset's gust bends it: the sprout furthest, the tree least. */
  gust: number;
};

type Stage = {
  /** The grove size in px and the class that spells it. */
  grovePx: number;
  groveClassName: string;
  rowClassName: string;
  /** Where the plant's lowest stroke ends, in the icon's 24-unit box, with the
   *  sprout's soil left out the way the grove leaves it out. */
  base: number;
  rangeKey: "ageRangeYoung" | "ageRangeAdult" | "ageRangeSenior";
  captionKey: "ageCaptionYoung" | "ageCaptionAdult" | "ageCaptionSenior";
  growth: Growth;
};

const STAGES: Record<AgeStage, Stage> = {
  mladicek: {
    grovePx: 28,
    groveClassName: "size-7",
    rowClassName: "size-5",
    base: 21,
    rangeKey: "ageRangeYoung",
    captionKey: "ageCaptionYoung",
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
    },
  },
};

// The grove's colours come from --grove-* in globals.css, which is where the
// dark values and the contrast measurements live. Every canopy is leaf and
// every trunk is wood: drawn in wood alone, the shrub and the tree were two
// brown clouds, which reads as autumn rather than as an older animal.
const LEAF_CLASS = "text-grove-leaf";
const WOOD_CLASS = "text-grove-wood";

const STANDARD_EASE = [0.16, 1, 0.3, 1] as const;
const CELEBRATION_GUARD_MS = 80;
const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;
// Half the icon's 1.7 stroke, in the same 24-unit box as STAGES[].base.
const HALF_STROKE = 0.85;
// The plant box's bottom padding, and the ground line's 1px inside it.
const PLANT_PADDING_PX = 4;
const GROUND_PX = 1;

// The section body folds inside an `AnimatePresence initial={false}`, which
// tells Motion the fold is already present on first paint. Motion applies that
// to everything under the fold rather than to the fold alone, and it keeps
// applying it: whatever mounts in there later counts as already present, so
// its mount animation is skipped and it is written straight to the pose it
// should have ended on. The sway and the ground line are unharmed because they
// animate on update. The two below exist only to be mounted and watched, so
// each needs a presence boundary of its own, carrying the default `initial`,
// or it never plays.
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
 * and they are drawn at three sizes, so one padding left the trees standing a
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

// A reset is a gust through the grove from the left: each plant bends with it
// in turn and springs back, the way Velikost's reset walks its paws off.
const GUST = {
  shape: [0, 1, -0.35, 0.12, 0],
  times: [0, 0.3, 0.6, 0.82, 1],
  duration: 0.7,
  // Slower than the reset's own 0.045s turn-taking, so it reads as wind
  // crossing the row rather than three plants moving together.
  stagger: 0.09,
};
const STAGE_COUNT = Object.keys(STAGES).length;
const GUST_HOLD_MS =
  ((STAGE_COUNT - 1) * GUST.stagger + GUST.duration) * 1000 +
  CELEBRATION_GUARD_MS;
const FAREWELL_HOLD_MS =
  Math.max(
    ...Object.values(STAGES).map(({ growth }) => growth.farewell.duration),
  ) *
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

export type PlantCue = {
  stage: AgeStage;
  index: number;
  lastIndex: number;
  reduceMotion: boolean;
  /** This plant was just picked. */
  growing: boolean;
  /** This plant was just unpicked. */
  leaving: boolean;
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
 */
export function plantMotion(cue: PlantCue): {
  animate: TargetAndTransition;
  transition: Transition;
} {
  if (cue.reduceMotion) return { animate: REST, transition: { duration: 0 } };

  const { growth } = STAGES[cue.stage];
  const lean = leanOf(cue.index, cue.lastIndex);

  if (cue.growing) {
    const rise = {
      duration: growth.rise.duration,
      times: growth.rise.times,
      ease: "easeOut" as const,
    };
    return {
      animate: {
        ...REST,
        scaleY: growth.rise.values,
        scaleX: growth.rise.widths,
        rotate: growth.sway.values.map((degrees) => lean * degrees),
      },
      transition: {
        default: SETTLE,
        scaleY: rise,
        scaleX: rise,
        rotate: {
          duration: growth.sway.duration,
          times: growth.sway.times,
          ease: "easeInOut",
        },
      },
    };
  }

  if (cue.gusting) {
    return {
      animate: {
        ...REST,
        rotate: GUST.shape.map((share) => share * growth.gust),
      },
      transition: {
        default: SETTLE,
        rotate: {
          duration: GUST.duration,
          times: GUST.times,
          delay: cue.index * GUST.stagger,
          ease: "easeInOut",
        },
      },
    };
  }

  if (cue.leaving) {
    const { farewell } = growth;
    const clock = {
      duration: farewell.duration,
      times: farewell.times,
      ease: "easeInOut" as const,
    };
    return {
      animate: {
        ...REST,
        rotate: farewell.rotate.map((degrees) => lean * degrees),
        x: farewell.x.map((px) => lean * px),
        scaleY: farewell.scaleY,
      },
      transition: { default: SETTLE, rotate: clock, x: clock, scaleY: clock },
    };
  }

  if (cue.grown) {
    // Neighbours lean away from the plant that just grew.
    const away = Math.sign(cue.index - cue.grown.index) || 1;
    return {
      animate: { ...REST, rotate: [0, away * 2.2, 0] },
      transition: {
        default: SETTLE,
        rotate: {
          duration: 0.42,
          delay:
            swayStart(cue.grown.stage) +
            Math.abs(cue.index - cue.grown.index) * 0.06,
          ease: "easeInOut",
        },
      },
    };
  }

  return { animate: REST, transition: SETTLE };
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
  const [isResetting, setIsResetting] = useState(false);
  const { hoveredValue: hoveredAge, handlers: hoverHandlers } =
    useFilterCardHover();
  const [fallingLeaf, setFallingLeaf] = useState<FallingLeaf | null>(null);
  const farewell = useOneShotCelebration<AgeStage>(FAREWELL_HOLD_MS);
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

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebratingAge,
  );
  const lastIndex = options.length - 1;
  const seniorIndex = options.findIndex(({ value }) => value === "senior");

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

    if (
      nextSelected.length === options.length ||
      !nextSelected.includes(changed) ||
      !isAgeStage(changed)
    ) {
      setCelebration(null);
      if (isAgeStage(changed) && !nextSelected.includes(changed)) {
        farewell.celebrate(changed);
      }
      if (changed === "senior" && !nextSelected.includes(changed)) {
        // An empty selection is every stage again, so the tree keeps its
        // size and only a narrower one shrinks away under the leaf.
        dropLeaf(
          0,
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
            setIsResetting(true);
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
            className="relative mb-2 grid grid-cols-3 px-1"
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
              const leaving = farewell.celebration?.value === value;
              const body = plantMotion({
                stage: value,
                index,
                lastIndex,
                reduceMotion: shouldReduceMotion,
                growing: celebrating,
                leaving,
                gusting: gust.celebration !== null,
                grown:
                  celebratingAge && !celebrating && celebrationIndex >= 0
                    ? { stage: celebratingAge, index: celebrationIndex }
                    : null,
              });
              const hovered = hoveredAge === value;
              // A reset wakes the columns in order rather than all at once.
              const settleDelay = isResetting ? index * RESET_STAGGER : 0;
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
                  {...(pressable ? hoverHandlers(value) : {})}
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
                      which a phone never shows. */}
                  <span
                    className={cn(
                      "mt-1 text-2xs leading-none whitespace-nowrap text-muted-foreground tabular-nums transition-opacity duration-200 motion-reduce:transition-none",
                      !active && "opacity-50",
                    )}
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
            className="w-full items-stretch"
          >
            {options.map(({ value, label }) => {
              if (!isAgeStage(value)) return null;

              const stage = STAGES[value];
              const { rise } = stage.growth;
              const count = counts.get(value) ?? 0;
              const checked = selected.includes(value);
              const celebrating = celebratingAge === value && checked;

              return (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  disabled={count === 0 && !checked}
                  {...hoverHandlers(value)}
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
                          "grid h-10 w-full shrink grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-2 px-2.5 pr-9 text-left",
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
                  {/* The row's own plant grows with the grove's, so the
                      growth starts under the finger that asked for it and
                      not only a hand's width above. It rises and draws; the
                      sway stays in the grove, where there is room for it. */}
                  <m.span
                    className="origin-bottom"
                    initial={false}
                    animate={
                      celebrating && !shouldReduceMotion
                        ? { scaleY: rise.values, scaleX: rise.widths }
                        : { scaleY: 1, scaleX: 1 }
                    }
                    transition={
                      shouldReduceMotion
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
                      stage={value}
                      draw={celebrating}
                      reduceMotion={shouldReduceMotion}
                      className={cn(LEAF_CLASS, stage.rowClassName)}
                      woodClassName={WOOD_CLASS}
                    />
                  </m.span>
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
                          checked && "font-medium",
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
