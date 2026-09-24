"use client";

import { PawPrint } from "lucide-react";
import type { TargetAndTransition, Transition } from "motion/react";
import { domAnimation, m, useReducedMotion } from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import type { CSSProperties, ReactNode } from "react";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardTail,
  countClass,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  RESET_STAGGER,
  resetDelayStyle,
  useFilterCardGestures,
  useOneShotCelebration,
  waitThen,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import type { FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Spring = { stiffness: number; damping: number; mass: number };

// The paw's drawn size, in px, and the class that draws it at that size.
// Written out rather than built, because Tailwind generates only the class
// names it can read in the source.
type PawPx = 12 | 16 | 20;
const PAW_SIZE_CLASS: Record<PawPx, string> = {
  12: "size-3",
  16: "size-4",
  20: "size-5",
};

type Landing = {
  px: PawPx;
  // The height of the hop where the card has the room for it, in px. See
  // hopHeight.
  drop: number;
  // The hop, in seconds: up, down, and one rebound off the ground. A heavier
  // paw hangs longer and does not rebound at all.
  rise: number;
  fall: number;
  rebound: number;
  reboundTime: number;
  hoverSpring: Spring;
  // The paw stretches in the air and squashes against the ground.
  stretch: number;
  squash: number;
  // How long the squash takes to recover after the impact.
  settle: number;
  // How far the paw sinks while the pointer is held down. A heavier animal
  // sinks deeper, and the release is the push-off of the hop.
  crouch: number;
  shadowWeight: number;
  checkDelay: number;
  neighborShift: number;
  // How far this landing throws the other paws up, in px.
  neighborJolt: number;
  // How far this paw is thrown by another's landing, as a share of that
  // landing's jolt. A light paw is thrown higher by the same thud.
  jostle: number;
  // How far the toes spread under the weight at the impact, in the glyph's
  // 24-unit box.
  toeSpread: number;
  // How far the paw tips up onto its heel under the mouse, in degrees. A
  // light paw is quicker to lift its toes.
  hoverTip: number;
  dust: boolean;
  countJolt: boolean;
};

// Every size runs the same gesture; the timings carry the weight, so a small
// paw bounces off the ground and a large one lands and stays.
const LANDINGS: Record<string, Landing> = {
  small: {
    px: 12,
    drop: 6,
    rise: 0.07,
    fall: 0.08,
    rebound: 2,
    reboundTime: 0.14,
    hoverSpring: { stiffness: 640, damping: 13, mass: 0.32 },
    stretch: 1.03,
    squash: 0.05,
    settle: 0.28,
    crouch: 0.96,
    shadowWeight: 0.6,
    checkDelay: 0.2,
    neighborShift: 0,
    neighborJolt: 0,
    jostle: 1.5,
    toeSpread: 0.6,
    hoverTip: 12,
    dust: false,
    countJolt: false,
  },
  medium: {
    px: 16,
    drop: 10,
    rise: 0.09,
    fall: 0.11,
    rebound: 1,
    reboundTime: 0.12,
    hoverSpring: { stiffness: 420, damping: 22, mass: 0.55 },
    stretch: 1.05,
    squash: 0.07,
    settle: 0.3,
    crouch: 0.95,
    shadowWeight: 0.8,
    checkDelay: 0.3,
    neighborShift: 1,
    neighborJolt: 1,
    jostle: 1,
    toeSpread: 1.2,
    hoverTip: 8,
    dust: false,
    countJolt: false,
  },
  large: {
    px: 20,
    drop: 15,
    rise: 0.12,
    fall: 0.15,
    rebound: 0,
    reboundTime: 0,
    hoverSpring: { stiffness: 240, damping: 30, mass: 1.1 },
    stretch: 1.07,
    squash: 0.13,
    settle: 0.32,
    crouch: 0.93,
    shadowWeight: 1,
    checkDelay: 0.42,
    neighborShift: 3,
    neighborJolt: 2,
    jostle: 0.75,
    toeSpread: 1.8,
    hoverTip: 5,
    dust: true,
    countJolt: true,
  },
};

// When the ground reacts, measured from the start of the celebration.
function impactDelay(landing: Landing): number {
  return landing.rise + landing.fall;
}

// Lucide's PawPrint (lucide-react 1.45.0, ISC license), drawn here so the toes
// can move on their own: the lucide component draws in one piece.
// size-paw-cards.test.tsx fails if lucide redraws it.
const PAW_PAD =
  "M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z";
const PAW_TOE_RADIUS = 2;
// Roughly the middle of the pad: where the weight sits, and so what the toes
// spread away from.
const PAD_CENTRE = { x: 8, y: 15 };
const PAW_TOES = [
  { cx: 11, cy: 4 },
  { cx: 18, cy: 8 },
  { cx: 20, cy: 16 },
].map((toe) => {
  const dx = toe.cx - PAD_CENTRE.x;
  const dy = toe.cy - PAD_CENTRE.y;
  const length = Math.hypot(dx, dy);
  return { ...toe, away: { x: dx / length, y: dy / length } };
});

type ToeSpread = { id: number; distance: number; impact: number };

// The outline in screen pixels, the same at every size, so the three paws
// differ in size and not in ink. Lucide's 1.75 units scale with the icon: the
// small paw drew 0.875px lines, which at 1x antialias to a grey smudge, while
// the large drew 1.46px. 1.35 keeps the large paw at the weight of the other
// glyphs in the column without closing the small paw's toes into blobs, which
// 1.46 did at 12px.
const PAW_STROKE_PX = 1.35;

function PawGlyph({
  px,
  className,
  style,
  filled = false,
  spread,
}: {
  px: PawPx;
  className?: string;
  style?: CSSProperties;
  // A print rather than an outline: the shape the paw leaves in the ground.
  filled?: boolean;
  // Present only while a landing plays. The toes are plain circles at rest,
  // so six idle motion elements are not left on the page.
  spread?: ToeSpread;
}) {
  // The toes wait for the impact, open fast under the weight and close slowly.
  const toeTrack = (distance: number) =>
    waitThen(spread?.impact ?? 0, [0, distance, 0], {
      duration: TOE_SPREAD_OPEN + TOE_SPREAD_CLOSE,
      times: [0, TOE_SPREAD_OPEN / (TOE_SPREAD_OPEN + TOE_SPREAD_CLOSE), 1],
      ease: ["easeOut", "easeInOut"],
    });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      // The lucide classes stay: the drawing is lucide's, and the sheet's
      // watermark still is the lucide component.
      className={cn("lucide lucide-paw-print", PAW_SIZE_CLASS[px], className)}
      style={style}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={(24 * PAW_STROKE_PX) / px}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {spread ? (
        // Keyed on the landing, so a second pick replays the spread.
        <g key={spread.id}>
          {PAW_TOES.map(({ cx, cy, away }) => {
            const x = toeTrack(away.x * spread.distance);
            const y = toeTrack(away.y * spread.distance);
            return (
              <m.circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r={PAW_TOE_RADIUS}
                initial={false}
                animate={{ x: x.keyframes, y: y.keyframes }}
                transition={x.transition}
              />
            );
          })}
        </g>
      ) : (
        PAW_TOES.map(({ cx, cy }) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={PAW_TOE_RADIUS} />
        ))
      )}
      <path d={PAW_PAD} />
    </svg>
  );
}

// How high the paw lifts to step off the ground.
function stepHeight(distance: number): number {
  return distance * STEP_SHARE;
}

// The paw's own hop, small: up on an ease-out, down on an ease-in.
function stepTransition(landing: Landing, delay: number): Transition {
  return {
    duration: impactDelay(landing),
    delay,
    times: [0, landing.rise / impactDelay(landing), 1],
    ease: ["easeOut", "easeIn"],
  };
}

const warnedSizes = new Set<string>();

// An option outside LANDINGS would otherwise fail every guard below and leave
// the card inert. The medium landing is the neutral weight, so it stands in.
function landingFor(value: string): Landing {
  const landing = LANDINGS[value];
  if (landing) return landing;
  if (process.env.NODE_ENV !== "production" && !warnedSizes.has(value)) {
    warnedSizes.add(value);
    console.warn(
      `SizePawCards: no landing for size "${value}", using the medium landing.`,
    );
  }
  return LANDINGS.medium;
}

const SHADOW_SETTLE = 0.5;
const DUST_DURATION = 0.35;
const COUNT_JOLT_DURATION = 0.18;
const NEIGHBOR_LEAN_DURATION = 0.45;
const NEIGHBOR_JOLT_DURATION = 0.22;
// The thud reaches the far paw a beat after the near one.
const NEIGHBOR_JOLT_STAGGER = 0.06;
// How long a paw caught mid-hop by another's landing takes to come down.
const REACTION_FALL = 0.08;
// A step off the ground is a small share of the paw's own hop.
const STEP_SHARE = 0.3;
// On a reset the paw lifts its toes as it steps off, so the three paws walk
// out of the section rather than bob.
const STEP_TIP = 10;
// The toes open fast under the weight and close slowly after it.
const TOE_SPREAD_OPEN = 0.06;
const TOE_SPREAD_CLOSE = 0.28;
// The print a paw leaves when it is taken off.
const FOOTPRINT_OPACITY = 0.3;
const FOOTPRINT_DURATION = 0.6;
const FOOTPRINT_MS = 650;
// Where the heel sits across the paw's box: the pad's lower left. A hover and
// a step both lift the toes and pivot here.
const PAW_HEEL_X = 0.35;
// Long enough for the slowest full sequence, which is large's shadow settling
// after its impact.
const LANDING_MS = 900;
const CROUCH_DURATION = 0.1;
// The paw stands at the bottom of an h-5 box, so a paw smaller than the box has
// the rest of it free above.
const PAW_BOX = 20;
// How far below the card's top edge that box starts, in px. A row is 44px and
// centres a 30px icon well, and the box is centred in the well: 7 + 5. A tile's
// content fills it, so the box starts under the border and the py-2: 1 + 8. A
// label that wraps only makes either card taller, which moves the box down.
const PAW_BOX_TOP: Record<FilterCardLayout, number> = { sidebar: 12, sheet: 9 };
// The air left between the paw at the top of its hop and the card's edge.
const HOP_CLEARANCE = 1;

/**
 * How high the paw can hop on this card without leaving it.
 *
 * The card clips its own overflow, so the room is what lies between the paw
 * and the card's top edge. The large paw fills its box, which leaves it the
 * tile's 9px: its full 15px peaked 7px past the tile's edge and cut its toes
 * off mid-hop on every phone. The stretch in the air grows the paw upward from
 * its bottom edge, so it spends some of the room as well.
 *
 * Only the height gives way. The timings and the squash are the landing's own
 * on either card, so a large paw on a phone still hangs longest and lands
 * hardest, from a lower hop than the medium one's.
 */
function hopHeight(landing: Landing, layout: FilterCardLayout): number {
  const room = PAW_BOX_TOP[layout] + (PAW_BOX - landing.px);
  const stretch = landing.px * (landing.stretch - 1);
  return Math.max(
    0,
    Math.min(landing.drop, room - stretch - HOP_CLEARANCE),
  );
}
// The mark the paw leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

// Places the impact keyframe of a tween at impactDelay, with an anticipation
// keyframe before it.
function impactTimes(impact: number, duration: number): number[] {
  const at = impact / duration;
  return [0, at * 0.6, at, 1];
}

function shadowDuration(landing: Landing): number {
  return impactDelay(landing) + SHADOW_SETTLE;
}

// Nothing until the impact, then a puff that spreads and fades.
function dustPose(landing: Landing): Pose {
  const track = (keyframes: number[]) =>
    waitThen(impactDelay(landing), keyframes, {
      duration: DUST_DURATION,
      times: [0, 0.01 / DUST_DURATION, 1],
      ease: ["linear", "easeOut"],
    });
  const opacity = track([0, 0.4, 0]);
  return {
    animate: {
      opacity: opacity.keyframes,
      scaleX: track([0.7, 0.7, 1.6]).keyframes,
    },
    transition: opacity.transition,
  };
}

type Pose = { animate: TargetAndTransition; transition: Transition };

const REST_TRANSITION: Transition = { duration: 0.16 };

// The paw hops on its own landing, or is jostled by the one that landed.
type DropPose = "celebrating" | "reacting" | "rest";

// distance rather than landing.drop: the height the card has room for
// (hopHeight).
function dropPose(
  pose: DropPose,
  landing: Landing,
  distance: number,
  reaction: { shift: number; jolt: number; delay: number },
): Pose {
  switch (pose) {
    case "celebrating": {
      // Up on an ease-out, down on an ease-in, then a rebound for the paws
      // light enough to have one. Springs take only two keyframes, so the
      // whole hop is one tween.
      const impact = impactDelay(landing);
      const duration = impact + landing.reboundTime;
      return {
        animate: { y: [0, -distance, 0, -landing.rebound, 0], x: 0 },
        transition: {
          duration,
          times: [
            0,
            landing.rise / duration,
            impact / duration,
            (impact + landing.reboundTime / 2) / duration,
            1,
          ],
          ease: ["easeOut", "easeIn", "easeOut", "easeIn"],
        },
      };
    }
    case "reacting": {
      // The thud lifts the paw off the ground and pushes it away from the
      // one that landed. A paw still in the air from its own hop comes down
      // first (waitThen's settle).
      const y = waitThen(reaction.delay, [0, -reaction.jolt, 0], {
        duration: NEIGHBOR_JOLT_DURATION,
        times: [0, 0.35, 1],
        ease: ["easeOut", "easeIn"],
        settle: REACTION_FALL,
      });
      const x = waitThen(reaction.delay, [0, reaction.shift, 0], {
        duration: NEIGHBOR_LEAN_DURATION,
        ease: "easeInOut",
        settle: REACTION_FALL,
      });
      return {
        animate: { y: y.keyframes, x: x.keyframes },
        transition: { y: y.transition, x: x.transition },
      };
    }
    case "rest":
      return { animate: { y: 0, x: 0 }, transition: REST_TRANSITION };
  }
}

// The same span carries the landing squash and the press crouch.
type SquashPose = "celebrating" | "crouching" | "rest";

function squashPose(pose: SquashPose, landing: Landing): Pose {
  switch (pose) {
    case "celebrating": {
      const impact = impactDelay(landing);
      const duration = impact + landing.settle;
      return {
        animate: {
          // null starts from wherever the crouch left the paw, so the push-off
          // grows out of it instead of snapping upright first.
          scaleY: [null, landing.stretch, 1 - landing.squash, 1],
          scaleX: [null, 2 - landing.stretch, 1 + landing.squash * 0.6, 1],
        },
        transition: {
          // Stretch in the air, squash on the ground; both halves of one
          // tween.
          duration,
          times: impactTimes(impact, duration),
          ease: "easeOut",
        },
      };
    }
    case "crouching":
      return {
        animate: {
          scaleY: landing.crouch,
          // Volume stays put: what the paw loses in height it takes back in
          // width.
          scaleX: 1 + (1 - landing.crouch) * 0.5,
        },
        transition: { duration: CROUCH_DURATION, ease: "easeOut" },
      };
    case "rest":
      return {
        animate: { scaleX: 1, scaleY: 1 },
        transition: REST_TRANSITION,
      };
  }
}

// A sidebar row gives the paw the icon well every other row in the column
// draws its glyph in, halo included, so a picked size lights the same way a
// picked trait does. The tile has no well: there the paw stands alone in the
// middle of the card and the halo would be a second circle behind it.
function PawWell({
  layout,
  checked,
  appearDelay,
  exitDelay,
  children,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  appearDelay: number;
  exitDelay: number;
  children: ReactNode;
}) {
  if (layout === "sheet") return <>{children}</>;

  return (
    <FilterCardIconWell
      layout={layout}
      checked={checked}
      appearDelay={appearDelay}
      exitDelay={exitDelay}
    >
      {children}
    </FilterCardIconWell>
  );
}

export function SizePawCards({
  options,
  counts,
  selected,
  onToggle,
  isResetting = false,
  layout = "sidebar",
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  isResetting?: boolean;
  layout?: FilterCardLayout;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(LANDING_MS);
  // The paw a click just took off, which leaves its print behind.
  const { celebration: departure, celebrate: depart } =
    useOneShotCelebration<string>(FOOTPRINT_MS);
  const {
    hoveredValue,
    settledValue,
    settle,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures();

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );
  const celebrationLanding =
    celebrationIndex >= 0
      ? landingFor(options[celebrationIndex].value)
      : undefined;

  const sheet = layout === "sheet";

  return (
    <LazyMotion features={domAnimation}>
      {/* Three tiles across in the sheet, three stacked rows in the sidebar.
          The weights are told by the paws, which keep their three sizes in
          either direction. */}
      <div className={cn("grid gap-1.5", sheet ? "grid-cols-3" : "grid-cols-1")}>
        {options.map(({ value, label }, index) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const landing = landingFor(value);
          // Tipped onto the heel under the pointer or keyboard focus, and flat
          // from the press until the pointer or focus has left. A landing
          // takes the weight on the toes, and a click made with the mouse
          // resting on the card landed the paw 8 degrees back on its heel and
          // left it there.
          const tipped =
            hoveredValue === value &&
            pressedValue !== value &&
            settledValue !== value;
          const dead = isDeadOption(count, checked);
          const celebrating = celebration?.value === value && checked;
          const departing = departure?.value === value && !checked;
          // The crouch is press feedback, so it runs on touch too, and it
          // yields the moment the landing takes over.
          const crouching =
            pressedValue === value && !celebrating && !shouldReduceMotion;
          const reacting =
            celebrationLanding !== undefined &&
            !celebrating &&
            (celebrationLanding.neighborShift > 0 ||
              celebrationLanding.neighborJolt > 0);
          // The cards that did not change are thrown up and away from the
          // one that landed, the nearer one first.
          const reaction = {
            shift:
              (Math.sign(index - celebrationIndex) || 1) *
              (celebrationLanding?.neighborShift ?? 0),
            jolt: (celebrationLanding?.neighborJolt ?? 0) * landing.jostle,
            delay: celebrationLanding
              ? impactDelay(celebrationLanding) +
                (Math.abs(index - celebrationIndex) - 1) *
                  NEIGHBOR_JOLT_STAGGER
              : 0,
          };
          // A reset walks the paws off in order rather than all at once.
          const resetDelay = isResetting ? index * RESET_STAGGER : 0;
          const distance = hopHeight(landing, layout);
          const drop = dropPose(
            celebrating ? "celebrating" : reacting ? "reacting" : "rest",
            landing,
            distance,
            reaction,
          );
          // Stepping off: every paw on a reset, so the section walks out in
          // order, or the one a click took off. Anything else holds still,
          // and the way back to rest is from zero to zero, so the end of a
          // step never replays it.
          const step: Pose = shouldReduceMotion
            ? { animate: { y: 0, rotate: 0 }, transition: { duration: 0 } }
            : isResetting
              ? {
                  animate: {
                    y: [0, -stepHeight(distance), 0],
                    rotate: [0, -STEP_TIP, 0],
                  },
                  transition: stepTransition(landing, resetDelay),
                }
              : departing
                ? {
                    animate: { y: [0, -stepHeight(distance), 0], rotate: 0 },
                    transition: stepTransition(landing, 0),
                  }
                : { animate: { y: 0, rotate: 0 }, transition: REST_TRANSITION };
          const squash = squashPose(
            celebrating ? "celebrating" : crouching ? "crouching" : "rest",
            landing,
          );
          const gestures = gestureHandlers(value);
          // The count takes the thud of a heavy landing wherever it is drawn,
          // so both layouts hand their own class to the same jolt.
          const joltedCount = (className: string) => (
            <m.span
              className={className}
              initial={false}
              animate={
                celebrating && landing.countJolt && !shouldReduceMotion
                  ? { y: [0, 1, 0] }
                  : { y: 0 }
              }
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : celebrating && landing.countJolt
                    ? {
                        duration: COUNT_JOLT_DURATION,
                        delay: impactDelay(landing),
                        ease: "easeOut",
                      }
                    : { duration: 0.16 }
              }
            >
              <CountRoll value={count} />
            </m.span>
          );

          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (checked) {
                  clearCelebration();
                  depart(value);
                } else {
                  celebrate(value);
                }
                // Touch browsers can skip pointerleave when the finger slides
                // off, and pointercancel does not cover every path, so the
                // click clears the crouch too.
                releasePress(value);
                settle(value);
                onToggle(value);
              }}
              disabled={dead}
              {...gestures}
              aria-pressed={checked}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                layout,
                selected: checked,
                className: sheet
                  ? // isolate keeps the watermark's negative z-index above the
                    // card's own background instead of behind it.
                    cn(
                      DEAD_OPTION_CLASS,
                      "isolate flex min-h-[4.75rem] flex-col items-center justify-center gap-1 px-1.5 py-2 text-center",
                    )
                  : cn("flex", filterCardLayoutClass(layout)),
              })}
            >
              {/* The mark the landed paw leaves on the card, clipped by the
                  card's own overflow. The tile only: it is a stamp on a card
                  ground, and a row has no ground to stamp. A 48px paw behind
                  a 44px line would be a smudge under the count rather than a
                  mark left in a corner, and the row says "chosen" the way
                  every other row in the column does. */}
              {sheet && (
                <m.span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-2 -right-1.5 -z-10 text-brand-strong"
                  // A real initial, so a card checked from the URL stamps its
                  // mark on load instead of having it already there.
                  initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 1.06 }}
                  animate={{
                    opacity: checked ? WATERMARK_OPACITY : 0,
                    scale: shouldReduceMotion || checked ? 1 : 1.06,
                  }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : checked
                        ? {
                            duration: WATERMARK_IN_DURATION,
                            delay: landing.checkDelay,
                            ease: "easeOut",
                          }
                        : {
                            duration: WATERMARK_OUT_DURATION,
                            delay: resetDelay,
                            ease: "easeOut",
                          }
                  }
                >
                  {/* The rotation stays on the icon; the span owns transform. */}
                  <PawPrint
                    className="size-12 rotate-[-15deg]"
                    strokeWidth={1.75}
                    fill="none"
                  />
                </m.span>
              )}
              {/* One call for both surfaces. The sheet arm used to spell
                  FilterSelectionMark with "absolute right-1.5 top-1.5", which
                  is markClass("sheet") character for character, so the two
                  branches rendered the same element and the tile's check had
                  quietly acquired a second owner.

                  The delay is the paw's: the check confirms once it is down,
                  not while it falls. */}
              <FilterCardMark
                layout={layout}
                checked={checked}
                appearDelay={landing.checkDelay}
              />
              <PawWell
                layout={layout}
                checked={checked}
                // The landing lights the row, so the halo waits for it.
                appearDelay={impactDelay(landing)}
                exitDelay={resetDelay}
              >
                <span aria-hidden className="relative flex h-5 items-end">
                  {celebrating && !shouldReduceMotion ? (
                    <m.span
                      key={`shadow-${celebration?.id}`}
                      className="pointer-events-none absolute -bottom-0.5 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-muted-foreground"
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{
                        opacity: [0, 0.15, 0.25 * landing.shadowWeight, 0],
                        scaleX: [0.5, 0.7, 1.3, 1.1],
                      }}
                      transition={{
                        duration: shadowDuration(landing),
                        times: impactTimes(
                          impactDelay(landing),
                          shadowDuration(landing),
                        ),
                        ease: "easeOut",
                      }}
                    />
                  ) : null}
                  {celebrating && landing.dust && !shouldReduceMotion ? (
                    <m.span
                      key={`dust-${celebration?.id}`}
                      className="pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full bg-brand-strong"
                      // Hidden until the impact (waitThen).
                      initial={{ opacity: 0, scaleX: 0.7 }}
                      {...dustPose(landing)}
                    />
                  ) : null}
                  {departing && !shouldReduceMotion ? (
                    // The print the paw leaves where it stood, in the green it
                    // had, fading as the paw goes grey above it.
                    <m.span
                      key={`print-${departure?.id}`}
                      className="pointer-events-none absolute inset-0 flex items-end justify-center text-brand-strong"
                      initial={{ opacity: FOOTPRINT_OPACITY }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: FOOTPRINT_DURATION,
                        ease: "easeIn",
                      }}
                    >
                      <PawGlyph px={landing.px} filled />
                    </m.span>
                  ) : null}
                  <m.span
                    className="flex items-end"
                    // The heel is the pad's lower left; the toes lift off it.
                    style={{ originX: PAW_HEEL_X, originY: 1 }}
                    data-tipped={tipped ? "" : undefined}
                    initial={false}
                    animate={{
                      y: tipped ? -1 : 0,
                      rotate: tipped ? -landing.hoverTip : 0,
                    }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { type: "spring", ...landing.hoverSpring }
                    }
                  >
                    <m.span
                      className="flex items-end"
                      initial={false}
                      animate={
                        shouldReduceMotion
                          ? { y: 0, x: 0 }
                          : drop.animate
                      }
                      transition={
                        shouldReduceMotion ? { duration: 0 } : drop.transition
                      }
                    >
                      <m.span
                        className="flex origin-bottom items-end"
                        initial={false}
                        animate={
                          shouldReduceMotion
                            ? { scaleX: 1, scaleY: 1 }
                            : squash.animate
                        }
                        transition={
                          shouldReduceMotion ? { duration: 0 } : squash.transition
                        }
                      >
                        <m.span
                          className="flex items-end"
                          // The paw steps away rather than fading; the icon
                          // itself never leaves the card.
                          style={{ originX: PAW_HEEL_X, originY: 1 }}
                          initial={false}
                          animate={step.animate}
                          transition={step.transition}
                        >
                          <PawGlyph
                            px={landing.px}
                            spread={
                              celebrating && celebration && !shouldReduceMotion
                                ? {
                                    id: celebration.id,
                                    distance: landing.toeSpread,
                                    impact: impactDelay(landing),
                                  }
                                : undefined
                            }
                            // The colour is a class here, so the reset's turn
                            // has to reach it as a transition-delay: the paw
                            // stepped away in order and went grey all at once.
                            style={resetDelayStyle(checked, resetDelay)}
                            className={cn(
                              "transition-[color,transform,opacity] duration-200",
                              checked
                                ? "text-brand-strong"
                                : "text-muted-foreground",
                              // A dead option has nothing to stand up for, so
                              // its paw tips over.
                              dead && "rotate-[20deg] opacity-80",
                            )}
                          />
                        </m.span>
                      </m.span>
                    </m.span>
                  </m.span>
                </span>
              </PawWell>
              {sheet ? (
                <>
                  <span className={cn("text-xs", checked && "font-medium")}>
                    {label}
                  </span>
                  {/* The shared voice, not a hand-spelled one. This tile drew
                      its count at 11px where every section that goes through
                      FilterCardTail draws the sheet's 12px, and it kept the
                      resting ink on the green fill when chosen. */}
                  {joltedCount(countClass(layout, checked))}
                </>
              ) : (
                <FilterCardTail
                  layout={layout}
                  label={label}
                  checked={checked}
                  renderCount={joltedCount}
                />
              )}
            </button>
          );
        })}
      </div>
    </LazyMotion>
  );
}
