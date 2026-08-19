"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { EnergyLevel } from "@posvoji/schema";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  SectionHint,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import { groupLabel, type FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The particles a level throws off. Positions are the end of the flight, in
// px from the icon centre; delay is measured from the level's particleDelay.
type Particle = {
  x: number;
  y: number;
  delay: number;
  className: string;
  glyph?: string;
};

type ParticleKind = "zzz" | "spark";

const PARTICLES: Record<ParticleKind, Particle[]> = {
  // Sleep leaves the moon slowly and upward.
  zzz: [
    {
      x: 7,
      y: -13,
      delay: 0,
      className: "text-[9px] font-semibold leading-none",
      glyph: "z",
    },
    {
      x: 12,
      y: -19,
      delay: 0.26,
      className: "text-[7px] font-semibold leading-none",
      glyph: "z",
    },
  ],
  // A discharge throws sparks off on diagonals, three ways at once.
  spark: [
    { x: 11, y: -9, delay: 0, className: "size-1 rounded-full" },
    { x: -10, y: -6, delay: 0.03, className: "size-0.5 rounded-full" },
    { x: 8, y: 9, delay: 0.06, className: "size-0.5 rounded-full" },
  ],
};

type Tempo = {
  // The glyph, drawn as two layers so the accent copy can draw itself on. Each
  // entry is one stroke, and the strokes draw in this order.
  glyph: string[];
  drawDuration: number;
  drawStagger: number;
  // Played once, as the card is switched on. Every array here is a keyframe
  // list, which only a tween can carry: a spring takes at most two values.
  gesture: TargetAndTransition;
  duration: number;
  // One entry per keyframe, so every array in gesture is this long.
  times: number[];
  ease: "easeOut" | "easeInOut";
  // Held back when the gesture is the tail of the draw rather than its
  // accompaniment.
  gestureDelay: number;
  // The check confirms as the gesture lands, not while it is still running.
  checkDelay: number;
  // The ring leaving the icon, paced by the same temperament as the gesture.
  rippleOpacity: number;
  rippleScale: number;
  rippleDuration: number;
  // How far the whole card leaves the ground. Only a level loud enough to
  // move the card gets a value here.
  cardHop: number;
  particle: ParticleKind | null;
  particleDelay: number;
  particleDuration: number;
  // What the cards that did not change pick up from this one. A calm choice
  // leaves the rest of the section still, a balanced one leans it, a lively
  // one shocks it sideways.
  neighborTilt: number;
  neighborLift: number;
  neighborJitter: number;
  neighborDelay: number;
  // The pose the icon takes while the pointer is held down, in the level's own
  // temperament. Cleared the moment the press ends or the gesture takes over.
  press: TargetAndTransition;
  pressTransition: Transition;
  // The posture of a dead option. CSS only, no animation.
  deadClassName: string;
  countJolt: boolean;
};

// Tempo is the identity of this section: each level moves at the speed it
// names, and shows what it is made of. Keyed by the schema enum, so a new
// level fails to compile.
const TEMPOS: Record<EnergyLevel, Tempo> = {
  calm: {
    glyph: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
    drawDuration: 0.6,
    drawStagger: 0.1,
    // Two rocks of a cradle, the second smaller, then still.
    gesture: {
      rotate: [0, -7, 5, -2.5, 0],
      scale: [1, 1.05, 1.01, 1.03, 1],
      y: [0, 0.5, 0, 0.5, 0],
    },
    duration: 1,
    times: [0, 0.24, 0.52, 0.78, 1],
    ease: "easeInOut",
    gestureDelay: 0,
    checkDelay: 0.62,
    rippleOpacity: 0.22,
    rippleScale: 1.9,
    rippleDuration: 0.9,
    cardHop: 0,
    particle: "zzz",
    particleDelay: 0.15,
    particleDuration: 0.8,
    neighborTilt: 0,
    neighborLift: 0,
    neighborJitter: 0,
    neighborDelay: 0,
    // Drowsy: the press sinks slowly rather than answering.
    press: { y: 2, scale: 0.96 },
    pressTransition: { duration: 0.35, ease: "easeOut" },
    deadClassName: "translate-y-0.5 opacity-75",
    countJolt: false,
  },
  balanced: {
    glyph: [
      "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
      "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
    ],
    // The wave flows through left to right, one line behind the next.
    drawDuration: 0.34,
    drawStagger: 0.1,
    // Scales settling: two shrinking corrections, then dead level.
    gesture: { rotate: [0, 2.2, -1.2, 0.5, 0] },
    duration: 0.45,
    times: [0, 0.26, 0.52, 0.78, 1],
    ease: "easeInOut",
    // The settle is the tail of the draw, so it waits for the last line.
    gestureDelay: 0.5,
    checkDelay: 0.42,
    rippleOpacity: 0.42,
    rippleScale: 1.35,
    rippleDuration: 0.5,
    cardHop: 0,
    particle: null,
    particleDelay: 0,
    particleDuration: 0,
    neighborTilt: 2.5,
    neighborLift: 0,
    neighborJitter: 0,
    neighborDelay: 0.1,
    press: { rotate: 3 },
    pressTransition: { duration: 0.1, ease: "easeOut" },
    deadClassName: "scale-y-75 opacity-75",
    countJolt: false,
  },
  lively: {
    glyph: ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
    drawDuration: 0.3,
    drawStagger: 0.08,
    // A static discharge: four flickers inside a fifth of a second, then the
    // bolt holds.
    gesture: {
      opacity: [1, 0.2, 1, 0.3, 1, 0.65, 1],
      scale: [1, 1.14, 1.02, 1.12, 1, 1.05, 1],
    },
    duration: 0.34,
    times: [0, 0.07, 0.14, 0.23, 0.32, 0.46, 1],
    ease: "easeOut",
    gestureDelay: 0,
    checkDelay: 0.2,
    rippleOpacity: 0.55,
    rippleScale: 1.5,
    rippleDuration: 0.32,
    cardHop: 3.5,
    particle: "spark",
    particleDelay: 0.04,
    particleDuration: 0.28,
    neighborTilt: 0,
    neighborLift: 0,
    neighborJitter: 1.6,
    neighborDelay: 0.14,
    // A wind-up quiver, running only while the finger is down.
    press: { x: [0, -1, 1, 0] },
    pressTransition: {
      duration: 0.16,
      times: [0, 0.28, 0.64, 1],
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    },
    deadClassName: "rotate-[20deg] opacity-75",
    countJolt: true,
  },
};

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const NEIGHBOR_DURATION = 0.3;
const JITTER_DURATION = 0.34;
const JITTER_TIMES = [0, 0.34, 0.62, 1];
// The shock radiates outward: each step further from the card that fired
// arrives this much later and carries this much of the previous step's
// amplitude. A card next to the source is one step out, the far card two.
const JITTER_STEP_DELAY = 0.05;
const JITTER_STEP_DAMPING = 0.62;
// How much of the push comes back the other way before the card settles.
const JITTER_RECOIL = 0.45;
const CARD_HOP_DURATION = 0.32;
const CARD_HOP_TIMES = [0, 0.28, 0.6, 1];
// The hop drops back past the line before resting, so it reads as a snap
// rather than a lift.
const CARD_HOP_RECOIL = 0.25;
// The ends of the section are this many steps apart: one card per level.
const MAX_NEIGHBOR_DISTANCE = Object.keys(TEMPOS).length - 1;
const COUNT_JOLT_DURATION = 0.18;
// Matches FilterSelectionMark's own appear duration.
const CHECK_DURATION = 0.14;
const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;
// The mark the level leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

function lastParticleEnd(tempo: Tempo): number {
  if (!tempo.particle) return 0;
  const latest = Math.max(
    ...PARTICLES[tempo.particle].map((particle) => particle.delay),
  );
  return tempo.particleDelay + latest + tempo.particleDuration;
}

// Every phase a level can run, measured from the moment the card is switched
// on. The hold has to outlast the slowest of them, because clearing the
// celebration snaps whatever is still running back to rest.
function tempoEnd(tempo: Tempo): number {
  return Math.max(
    tempo.gestureDelay + tempo.duration,
    tempo.rippleDuration,
    (tempo.glyph.length - 1) * tempo.drawStagger + tempo.drawDuration,
    tempo.checkDelay + CHECK_DURATION,
    lastParticleEnd(tempo),
    tempo.cardHop > 0 ? CARD_HOP_DURATION : 0,
    tempo.neighborTilt > 0 || tempo.neighborLift > 0
      ? tempo.neighborDelay + NEIGHBOR_DURATION
      : 0,
    // The furthest card is the last to be reached, so the hold has to cover
    // the whole staggered run, not just the first step.
    tempo.neighborJitter > 0
      ? tempo.neighborDelay +
        (MAX_NEIGHBOR_DISTANCE - 1) * JITTER_STEP_DELAY +
        JITTER_DURATION
      : 0,
  );
}

const TEMPO_MS = Math.ceil(
  1000 * Math.max(...Object.values(TEMPOS).map(tempoEnd)),
);

// An option outside the table would otherwise render inert. Balanced is the
// middle tempo, so it stands in.
function levelOf(value: string): EnergyLevel {
  return value in TEMPOS ? (value as EnergyLevel) : "balanced";
}

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

type Pose = { animate: TargetAndTransition; transition: Transition };

const GESTURE_REST: TargetAndTransition = {
  rotate: 0,
  scale: 1,
  y: 0,
  opacity: 1,
};
const PRESS_REST: TargetAndTransition = { x: 0, y: 0, rotate: 0, scale: 1 };
const CARD_REST: TargetAndTransition = { x: 0, y: 0 };
const REST_TRANSITION: Transition = { duration: 0.16 };

// The icon acts out its own tempo, or picks up what the card that fired sent
// down the section.
type IconPose = "celebrating" | "reacting" | "rest";

function iconPose(
  pose: IconPose,
  tempo: Tempo,
  celebrationTempo: Tempo | undefined,
  direction: number,
): Pose {
  switch (pose) {
    case "celebrating":
      return {
        animate: tempo.gesture,
        transition: {
          duration: tempo.duration,
          times: tempo.times,
          delay: tempo.gestureDelay,
          ease: tempo.ease,
        },
      };
    case "reacting":
      if (!celebrationTempo) break;
      return {
        animate: {
          rotate: [0, direction * celebrationTempo.neighborTilt, 0],
          y: [0, celebrationTempo.neighborLift, 0],
        },
        transition: {
          duration: NEIGHBOR_DURATION,
          delay: celebrationTempo.neighborDelay,
          ease: "easeOut",
        },
      };
    case "rest":
      break;
  }
  return { animate: GESTURE_REST, transition: REST_TRANSITION };
}

// The card itself moves only for a level loud enough to move it: the lively
// hop, and the shock its neighbours take a beat later. The hop is vertical and
// the shock horizontal, so the card that fired stays the one being read.
type CardPose = "celebrating" | "reacting" | "rest";

function cardPose(
  pose: CardPose,
  tempo: Tempo,
  celebrationTempo: Tempo | undefined,
  direction: number,
  distance: number,
): Pose {
  switch (pose) {
    case "celebrating":
      if (tempo.cardHop <= 0) break;
      return {
        animate: {
          y: [0, -tempo.cardHop, tempo.cardHop * CARD_HOP_RECOIL, 0],
        },
        transition: {
          duration: CARD_HOP_DURATION,
          times: CARD_HOP_TIMES,
          ease: "easeOut",
        },
      };
    case "reacting": {
      const jitter = celebrationTempo?.neighborJitter ?? 0;
      if (jitter <= 0) break;
      // Steps out from the card that fired. The clamp keeps the run inside the
      // window tempoEnd holds open.
      const steps = Math.max(
        0,
        Math.min(distance, MAX_NEIGHBOR_DISTANCE) - 1,
      );
      const amplitude = jitter * JITTER_STEP_DAMPING ** steps;
      return {
        // Pushed away from the source, then a smaller answer back.
        animate: {
          x: [
            0,
            direction * amplitude,
            -direction * amplitude * JITTER_RECOIL,
            0,
          ],
        },
        transition: {
          duration: JITTER_DURATION,
          delay:
            (celebrationTempo?.neighborDelay ?? 0) + steps * JITTER_STEP_DELAY,
          times: JITTER_TIMES,
          ease: "easeInOut",
        },
      };
    }
    case "rest":
      break;
  }
  return { animate: CARD_REST, transition: REST_TRANSITION };
}

// Two layers: a muted outline that is always there, and an accent copy that
// draws itself on stroke by stroke when the level is chosen.
function EnergyGlyph({
  level,
  tempo,
  checked,
  className,
}: {
  level: EnergyLevel;
  tempo: Tempo;
  checked: boolean;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 24 24"
      data-energy-glyph={level}
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="text-muted-foreground" stroke="currentColor">
        {tempo.glyph.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g stroke="var(--filter-accent-strong)">
        {tempo.glyph.map((d, index) => (
          <m.path
            key={d}
            d={d}
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? {
                      duration: tempo.drawDuration,
                      delay: index * tempo.drawStagger,
                      ease: "easeOut",
                    }
                  : // The drawn length drops only once the stroke is gone, so
                    // unchecking never runs the draw backwards.
                    { duration: 0.12, ease: "easeOut" }
            }
          />
        ))}
      </g>
    </svg>
  );
}

// The sidebar column is 14rem, and "Uravnotežen" does not fit a third of it at
// text-xs, so only the sheet gets three columns.
export function EnergyCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(TEMPO_MS);
  const [isResetting, setIsResetting] = useState(false);
  const [pressedValue, setPressedValue] = useState<string | null>(null);
  const { hoveredValue, handlers: hoverHandlers } = useFilterCardHover();

  const releasePress = (value: string) =>
    setPressedValue((current) => (current === value ? null : current));

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );
  const celebrationTempo =
    celebrationIndex >= 0
      ? TEMPOS[levelOf(options[celebrationIndex].value)]
      : undefined;

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel("energy", locale)}
        active={selected.length > 0}
        onReset={() => {
          clearCelebration();
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetEnergyFilters}
        collapse={collapse}
        hint={messages.energyFilterHint}
      />
      <CollapsibleBody collapse={collapse}>
      <SectionHint collapse={collapse}>{messages.energyFilterHint}</SectionHint>
      <LazyMotion features={domAnimation}>
        <div
          className={cn(
            "grid gap-1.5",
            layout === "sheet" ? "grid-cols-3" : "grid-cols-1",
          )}
        >
          {options.map(({ value, label }, index) => {
            const count = counts.get(value) ?? 0;
            const checked = selected.includes(value);
            const level = levelOf(value);
            const tempo = TEMPOS[level];
            const hovered = hoveredValue === value;
            const dead = isDead(count, checked);
            const celebrating = celebration?.value === value && checked;
            // The anticipation is press feedback, so it runs on touch too, and
            // it yields the moment the gesture takes over.
            const pressing =
              pressedValue === value && !celebrating && !shouldReduceMotion;
            const reacting = celebrationIndex >= 0 && !celebrating;
            const tilting =
              reacting &&
              ((celebrationTempo?.neighborTilt ?? 0) > 0 ||
                (celebrationTempo?.neighborLift ?? 0) > 0);
            // The cards that did not change lean away from the one that did,
            // and how far they sit from it sets when and how hard.
            const direction = Math.sign(index - celebrationIndex) || 1;
            const distance = Math.abs(index - celebrationIndex);
            // A reset winks the rows out in order rather than all at once.
            const resetDelay = isResetting ? index * RESET_STAGGER : 0;
            const icon = iconPose(
              celebrating ? "celebrating" : tilting ? "reacting" : "rest",
              tempo,
              celebrationTempo,
              direction,
            );
            const card = cardPose(
              celebrating ? "celebrating" : reacting ? "reacting" : "rest",
              tempo,
              celebrationTempo,
              direction,
              distance,
            );
            const hover = hoverHandlers(value);
            const particles = tempo.particle
              ? PARTICLES[tempo.particle]
              : undefined;

            return (
              <m.button
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
                  // click clears the press too.
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
                initial={false}
                animate={shouldReduceMotion ? CARD_REST : card.animate}
                transition={
                  shouldReduceMotion ? { duration: 0 } : card.transition
                }
                className={filterCardVariants({
                  selected: checked,
                  className: cn(
                    // isolate keeps the watermark's negative z-index above the
                    // card's own background instead of behind it.
                    "isolate flex",
                    layout === "sheet"
                      ? "min-h-[4.75rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center"
                      : "h-11 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left",
                  ),
                })}
              >
                {/* The mark the chosen level leaves on the card, clipped by
                    the card's own overflow. */}
                <m.span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -z-10",
                    layout === "sheet"
                      ? "-bottom-2 -right-1.5"
                      : "-bottom-1 -right-1",
                  )}
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
                            delay: tempo.checkDelay,
                            ease: "easeOut",
                          }
                        : {
                            duration: WATERMARK_OUT_DURATION,
                            delay: resetDelay,
                            ease: "easeOut",
                          }
                  }
                >
                  {/* The rotation stays on the svg; the span owns transform. */}
                  <svg
                    viewBox="0 0 24 24"
                    className={cn(
                      "rotate-[-12deg]",
                      layout === "sheet" ? "size-12" : "size-9",
                    )}
                    fill="none"
                    stroke="var(--filter-accent-strong)"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {tempo.glyph.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                </m.span>

                <FilterSelectionMark
                  checked={checked}
                  appearDelay={tempo.checkDelay}
                  className={cn(
                    layout === "sheet"
                      ? "absolute right-1.5 top-1.5"
                      : "absolute right-2.5 top-1/2 -translate-y-1/2",
                  )}
                />

                <span
                  aria-hidden
                  className={cn(
                    "relative grid shrink-0 place-items-center",
                    layout === "sheet" ? "size-7" : "size-7.5",
                  )}
                >
                  <m.span
                    className={cn(
                      "absolute rounded-full bg-muted-foreground/10",
                      layout === "sheet" ? "size-7" : "size-7.5",
                    )}
                    initial={false}
                    animate={{
                      opacity: checked ? 1 : 0,
                      scale: checked ? 1 : 0.6,
                    }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : checked
                          ? { type: "spring", stiffness: 380, damping: 26 }
                          : {
                              duration: 0.15,
                              delay: resetDelay,
                              ease: "easeOut",
                            }
                    }
                  />
                  {celebrating && !shouldReduceMotion ? (
                    <m.span
                      key={`ring-${celebration?.id}`}
                      className={cn(
                        "pointer-events-none absolute rounded-full border border-[var(--filter-accent-strong)]",
                        layout === "sheet" ? "size-7" : "size-7.5",
                      )}
                      initial={{ opacity: tempo.rippleOpacity, scale: 0.7 }}
                      animate={{ opacity: 0, scale: tempo.rippleScale }}
                      transition={{
                        duration: tempo.rippleDuration,
                        ease: "easeOut",
                      }}
                    />
                  ) : null}
                  {celebrating && particles && !shouldReduceMotion
                    ? particles.map((particle) => (
                        <m.span
                          key={`particle-${celebration?.id}-${particle.x}-${particle.y}`}
                          className={cn(
                            // Absolute, so nothing here can move the label or
                            // the count.
                            "pointer-events-none absolute text-[var(--filter-accent-strong)]",
                            particle.glyph
                              ? undefined
                              : "bg-[var(--filter-accent-strong)]",
                            particle.className,
                          )}
                          initial={false}
                          animate={{
                            opacity: [0, 0.8, 0],
                            x: [0, particle.x * 0.55, particle.x],
                            y: [0, particle.y * 0.55, particle.y],
                            scale: [0.6, 1, 0.7],
                          }}
                          transition={{
                            duration: tempo.particleDuration,
                            delay: tempo.particleDelay + particle.delay,
                            times: [0, 0.35, 1],
                            ease: "easeOut",
                          }}
                        >
                          {particle.glyph}
                        </m.span>
                      ))
                    : null}
                  <m.span
                    className="relative flex items-center justify-center will-change-transform"
                    initial={false}
                    animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
                    transition={
                      shouldReduceMotion ? { duration: 0 } : HOVER_SPRING
                    }
                  >
                    <m.span
                      className="flex items-center justify-center"
                      initial={false}
                      animate={
                        shouldReduceMotion ? GESTURE_REST : icon.animate
                      }
                      transition={
                        shouldReduceMotion ? { duration: 0 } : icon.transition
                      }
                    >
                      <m.span
                        className="flex items-center justify-center"
                        initial={false}
                        animate={pressing ? tempo.press : PRESS_REST}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : pressing
                              ? tempo.pressTransition
                              : REST_TRANSITION
                        }
                      >
                        <EnergyGlyph
                          level={level}
                          tempo={tempo}
                          checked={checked}
                          className={cn(
                            "size-5 transition-transform duration-200",
                            // A dead option has no charge left to show.
                            dead && tempo.deadClassName,
                          )}
                        />
                      </m.span>
                    </m.span>
                  </m.span>
                </span>

                {layout === "sheet" ? (
                  <>
                    <span
                      className={cn(
                        "mt-0.5 max-w-full truncate text-xs",
                        checked && "font-medium",
                      )}
                    >
                      {label}
                    </span>
                    <m.span
                      className="text-[11px] tabular-nums text-muted-foreground"
                      initial={false}
                      animate={
                        celebrating && tempo.countJolt && !shouldReduceMotion
                          ? { y: [0, 1, 0] }
                          : { y: 0 }
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : celebrating && tempo.countJolt
                            ? {
                                duration: COUNT_JOLT_DURATION,
                                delay: tempo.particleDelay,
                                ease: "easeOut",
                              }
                            : REST_TRANSITION
                      }
                    >
                      <CountRoll value={count} />
                    </m.span>
                  </>
                ) : (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span
                      className={cn("truncate text-xs", checked && "font-medium")}
                    >
                      {label}
                    </span>
                    <m.span
                      className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                      initial={false}
                      animate={
                        celebrating && tempo.countJolt && !shouldReduceMotion
                          ? { y: [0, 1, 0] }
                          : { y: 0 }
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : celebrating && tempo.countJolt
                            ? {
                                duration: COUNT_JOLT_DURATION,
                                delay: tempo.particleDelay,
                                ease: "easeOut",
                              }
                            : REST_TRANSITION
                      }
                    >
                      <CountRoll value={count} />
                    </m.span>
                  </span>
                )}
              </m.button>
            );
          })}
        </div>
      </LazyMotion>
      </CollapsibleBody>
    </section>
  );
}
