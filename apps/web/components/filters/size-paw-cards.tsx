"use client";

import { PawPrint } from "lucide-react";
import type { TargetAndTransition, Transition } from "motion/react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
  isDeadOption,
} from "@/components/filters/filter-card";
import {
  RESET_STAGGER,
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import type { FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Spring = { stiffness: number; damping: number; mass: number };

type Landing = {
  iconClassName: string;
  drop: number;
  spring: Spring;
  hoverSpring: Spring;
  // The paw stretches on the way down and squashes against the ground.
  stretch: number;
  squash: number;
  // How far the paw sinks while the pointer is held down. A heavier animal
  // sinks deeper, and the release reads as the start of the drop.
  crouch: number;
  // When the ground reacts, measured from the start of the celebration. A
  // heavier paw falls further, so its thud reads later.
  impactDelay: number;
  impactDuration: number;
  shadowWeight: number;
  checkDelay: number;
  neighborShift: number;
  neighborCompress: number;
  dust: boolean;
  countJolt: boolean;
};

// Every size runs the same gesture; the spring carries the weight, so a small
// paw bounces off the ground and a large one settles into it.
const LANDINGS: Record<string, Landing> = {
  small: {
    iconClassName: "size-3",
    drop: 6,
    spring: { stiffness: 600, damping: 18, mass: 0.4 },
    hoverSpring: { stiffness: 640, damping: 13, mass: 0.32 },
    stretch: 1.03,
    squash: 0.05,
    crouch: 0.96,
    impactDelay: 0.05,
    impactDuration: 0.35,
    shadowWeight: 0.6,
    checkDelay: 0.15,
    neighborShift: 0,
    neighborCompress: 0,
    dust: false,
    countJolt: false,
  },
  medium: {
    iconClassName: "size-4",
    drop: 10,
    spring: { stiffness: 420, damping: 24, mass: 0.8 },
    hoverSpring: { stiffness: 420, damping: 22, mass: 0.55 },
    stretch: 1.05,
    squash: 0.07,
    crouch: 0.95,
    impactDelay: 0.09,
    impactDuration: 0.4,
    shadowWeight: 0.8,
    checkDelay: 0.25,
    neighborShift: 1,
    neighborCompress: 0,
    dust: false,
    countJolt: false,
  },
  large: {
    iconClassName: "size-5",
    drop: 15,
    spring: { stiffness: 300, damping: 30, mass: 1.4 },
    hoverSpring: { stiffness: 240, damping: 30, mass: 1.1 },
    stretch: 1.07,
    squash: 0.13,
    crouch: 0.93,
    impactDelay: 0.13,
    impactDuration: 0.45,
    shadowWeight: 1,
    checkDelay: 0.4,
    neighborShift: 3,
    neighborCompress: 0.985,
    dust: true,
    countJolt: true,
  },
};

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
const NEIGHBOR_COMPRESS_DURATION = 0.3;
const LIFT_DURATION = 0.25;
// Long enough for the slowest full sequence, which is large's shadow settling
// after its impact.
const LANDING_MS = 900;
const CROUCH_DURATION = 0.1;
// The mark the paw leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

// Places the impact keyframe of a tween at impactDelay, with an anticipation
// keyframe before it. The floor keeps the first two keyframes apart on the
// fastest sizes.
function impactTimes(impactDelay: number, duration: number): number[] {
  const at = Math.min(Math.max(impactDelay / duration, 0.15), 0.5);
  return [0, at * 0.6, at, 1];
}

function shadowDuration(landing: Landing): number {
  return landing.impactDelay + SHADOW_SETTLE;
}

type Pose = { animate: TargetAndTransition; transition: Transition };

const REST_TRANSITION: Transition = { duration: 0.16 };

// The paw drops in on its own landing, or leans away from the one that landed.
type DropPose = "celebrating" | "reacting" | "rest";

function dropPose(pose: DropPose, landing: Landing, shift: number): Pose {
  switch (pose) {
    case "celebrating":
      return {
        animate: { y: [-landing.drop, 0], x: 0 },
        transition: { type: "spring", ...landing.spring },
      };
    case "reacting":
      return {
        animate: { y: 0, x: [0, shift, 0] },
        // Springs take only two keyframes, so the lean out and back runs as a
        // tween.
        transition: { duration: 0.45, ease: "easeInOut" },
      };
    case "rest":
      return { animate: { y: 0, x: 0 }, transition: REST_TRANSITION };
  }
}

// The same span carries the landing squash, the press crouch and the small
// sympathetic compression a neighbour picks up from a heavy landing.
type SquashPose = "celebrating" | "crouching" | "compressing" | "rest";

function squashPose(
  pose: SquashPose,
  landing: Landing,
  celebrationLanding: Landing | undefined,
): Pose {
  switch (pose) {
    case "celebrating":
      return {
        animate: {
          scaleY: [1, landing.stretch, 1 - landing.squash, 1],
          scaleX: [1, 2 - landing.stretch, 1 + landing.squash * 0.6, 1],
        },
        transition: {
          // Stretch on the way down, squash on the ground; both halves of one
          // tween.
          duration: landing.impactDuration,
          times: impactTimes(landing.impactDelay, landing.impactDuration),
          ease: "easeOut",
        },
      };
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
    case "compressing":
      if (!celebrationLanding) break;
      return {
        animate: {
          scaleX: 1,
          scaleY: [1, celebrationLanding.neighborCompress, 1],
        },
        transition: {
          duration: NEIGHBOR_COMPRESS_DURATION,
          delay: celebrationLanding.impactDelay,
          ease: "easeOut",
        },
      };
    case "rest":
      break;
  }
  return { animate: { scaleX: 1, scaleY: 1 }, transition: REST_TRANSITION };
}

export function SizePawCards({
  options,
  counts,
  selected,
  onToggle,
  isResetting = false,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  isResetting?: boolean;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(LANDING_MS);
  const { hoveredValue, handlers: hoverHandlers } = useFilterCardHover();
  const [pressedValue, setPressedValue] = useState<string | null>(null);

  const releasePress = (value: string) =>
    setPressedValue((current) => (current === value ? null : current));

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );
  const celebrationLanding =
    celebrationIndex >= 0
      ? landingFor(options[celebrationIndex].value)
      : undefined;

  return (
    <LazyMotion features={domAnimation}>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map(({ value, label }, index) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const landing = landingFor(value);
          const hovered = hoveredValue === value;
          const dead = isDeadOption(count, checked);
          const celebrating = celebration?.value === value && checked;
          // The crouch is press feedback, so it runs on touch too, and it
          // yields the moment the landing takes over.
          const crouching =
            pressedValue === value && !celebrating && !shouldReduceMotion;
          const reacting =
            celebrationIndex >= 0 &&
            !celebrating &&
            (celebrationLanding?.neighborShift ?? 0) > 0;
          const compressing =
            celebrationIndex >= 0 &&
            !celebrating &&
            (celebrationLanding?.neighborCompress ?? 0) > 0;
          // The cards that did not change lean away from the one that landed.
          const shift =
            (Math.sign(index - celebrationIndex) || 1) *
            (celebrationLanding?.neighborShift ?? 0);
          // A reset walks the paws off in order rather than all at once.
          const resetDelay = isResetting ? index * RESET_STAGGER : 0;
          const drop = dropPose(
            celebrating ? "celebrating" : reacting ? "reacting" : "rest",
            landing,
            shift,
          );
          const squash = squashPose(
            celebrating
              ? "celebrating"
              : crouching
                ? "crouching"
                : compressing
                  ? "compressing"
                  : "rest",
            landing,
            celebrationLanding,
          );
          const hover = hoverHandlers(value);

          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (checked) {
                  clearCelebration();
                } else {
                  celebrate(value);
                }
                // Touch browsers can skip pointerleave when the finger slides
                // off, and pointercancel does not cover every path, so the
                // click clears the crouch too.
                releasePress(value);
                onToggle(value);
              }}
              disabled={dead}
              {...hover}
              onPointerLeave={() => {
                hover.onPointerLeave();
                releasePress(value);
              }}
              onPointerDown={() => setPressedValue(value)}
              onPointerUp={() => releasePress(value)}
              onPointerCancel={() => releasePress(value)}
              aria-pressed={checked}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                selected: checked,
                className:
                  // isolate keeps the watermark's negative z-index above the
                  // card's own background instead of behind it.
                  "isolate flex min-h-[4.75rem] flex-col items-center justify-center gap-1 px-1.5 py-2 text-center",
              })}
            >
              {/* The mark the landed paw leaves on the card, clipped by the
                  card's own overflow. */}
              <m.span
                aria-hidden
                className="pointer-events-none absolute -bottom-2 -right-1.5 -z-10 text-[var(--filter-accent-strong)]"
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
              <FilterSelectionMark
                checked={checked}
                // The check confirms once the paw is down, not while it falls.
                appearDelay={landing.checkDelay}
                className="absolute right-1.5 top-1.5"
              />
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
                        landing.impactDelay,
                        shadowDuration(landing),
                      ),
                      ease: "easeOut",
                    }}
                  />
                ) : null}
                {celebrating && landing.dust && !shouldReduceMotion ? (
                  <m.span
                    key={`dust-${celebration?.id}`}
                    className="pointer-events-none absolute -bottom-0.5 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-full bg-[var(--filter-accent-strong)]"
                    initial={{ opacity: 0.4, scaleX: 0.7 }}
                    animate={{ opacity: 0, scaleX: 1.6 }}
                    transition={{
                      duration: DUST_DURATION,
                      delay: landing.impactDelay,
                      ease: "easeOut",
                    }}
                  />
                ) : null}
                <m.span
                  className="flex items-end will-change-transform"
                  initial={false}
                  animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
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
                        initial={false}
                        animate={
                          !shouldReduceMotion && !checked && !celebrating
                            ? // The paw steps away rather than fading; the icon
                              // itself never leaves the card.
                              { y: [0, -3, 0] }
                            : { y: 0 }
                        }
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : {
                                duration: LIFT_DURATION,
                                delay: resetDelay,
                                ease: "easeOut",
                              }
                        }
                      >
                        <PawPrint
                          className={cn(
                            landing.iconClassName,
                            "transition-[color,transform,opacity] duration-200",
                            checked
                              ? "text-[var(--filter-accent-strong)]"
                              : "text-muted-foreground",
                            // A dead option has nothing to stand up for, so
                            // its paw tips over.
                            dead && "rotate-[20deg] opacity-80",
                          )}
                          strokeWidth={1.75}
                        />
                      </m.span>
                    </m.span>
                  </m.span>
                </m.span>
              </span>
              <span className={cn("text-xs", checked && "font-medium")}>
                {label}
              </span>
              <m.span
                className="text-2xs tabular-nums text-muted-foreground"
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
                          delay: landing.impactDelay,
                          ease: "easeOut",
                        }
                      : { duration: 0.16 }
                }
              >
                <CountRoll value={count} />
              </m.span>
            </button>
          );
        })}
      </div>
    </LazyMotion>
  );
}
