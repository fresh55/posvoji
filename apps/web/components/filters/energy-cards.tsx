"use client";

import type { Easing, TargetAndTransition, Transition } from "motion/react";
import { m, useReducedMotion } from "motion/react";
import type { EnergyLevel } from "@posvoji/schema";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  useFilterCardGestures,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  groupLabel,
  type FilterOption,
  type Unanswered,
} from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The particles a level throws off. Positions are the end of the flight, in
// px from the icon centre; delay is measured from the level's particleDelay;
// size is the particle's box in px.
type Particle = {
  x: number;
  y: number;
  delay: number;
  size: number;
};

type ParticleKind = "zzz" | "spark";

// Each kind is one stroke in a 6-unit box rather than text or a dot: a 7px
// letter blurred at 1x, and a round dot read as dust rather than static.
// `turn` points the stroke along its own flight.
type ParticleSet = { path: string; turn: boolean; items: Particle[] };

const PARTICLE_STROKE = 1.3;

const PARTICLES: Record<ParticleKind, ParticleSet> = {
  // Sleep leaves the moon slowly and upward.
  zzz: {
    path: "M1.4 1.4h3.2L1.4 4.6h3.2",
    turn: false,
    items: [
      { x: 7, y: -13, delay: 0, size: 8 },
      { x: 12, y: -19, delay: 0.26, size: 6 },
    ],
  },
  // A discharge throws dashes off on diagonals, three ways at once.
  spark: {
    path: "M1 3h4",
    turn: true,
    items: [
      { x: 11, y: -9, delay: 0, size: 6 },
      { x: -10, y: -6, delay: 0.03, size: 4.5 },
      { x: 8, y: 9, delay: 0.06, size: 4.5 },
    ],
  },
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
  // The check confirms as the gesture lands, or sooner when the gesture runs
  // longer than a box should sit empty.
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
  // The pose the icon takes while the pointer is held down, in the level's own
  // temperament. Cleared the moment the press ends or the gesture takes over.
  press: TargetAndTransition;
  pressTransition: Transition;
  // What the icon does under a mouse or keyboard focus, on top of the shared
  // lift. A phone never sees it, so nothing here may carry meaning.
  hover: TargetAndTransition;
  hoverTransition: Transition;
  // How the accent copy leaves when the level is switched off: the pose it
  // drains into and the opacity keyframes it drains by. The muted outline
  // underneath stays put.
  leave: {
    pose?: TargetAndTransition;
    opacity: number | (number | null)[];
    times?: number[];
    duration: number;
    ease: Easing;
  };
  // How long the mark the level leaves on a selected card takes to appear.
  watermarkDuration: number;
  // The posture of a dead option. CSS only, no animation.
  deadClassName: string;
  countJolt: boolean;
};

// Tempo is the identity of this section: each level moves at the speed it
// names, and shows what it is made of. Keyed by the schema enum, so a new
// level fails to compile.
export const TEMPOS: Record<EnergyLevel, Tempo> = {
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
    // The rock runs a whole second, and waiting for it left a phone's tapped
    // card green around an empty box for 0.6s. The tick lands after the first
    // swing and the rock carries on around it.
    checkDelay: 0.3,
    rippleOpacity: 0.22,
    rippleScale: 1.9,
    rippleDuration: 0.9,
    cardHop: 0,
    particle: "zzz",
    particleDelay: 0.15,
    particleDuration: 0.8,
    // Drowsy: the press sinks slowly rather than answering.
    press: { y: 2, scale: 0.96 },
    pressTransition: { duration: 0.35, ease: "easeOut" },
    // A slow nod that stays down while the pointer does.
    hover: { rotate: -12, y: 0.5 },
    hoverTransition: { duration: 0.5, ease: "easeInOut" },
    // Drifts off: the colour sinks and fades slowly.
    leave: {
      pose: { y: 1.5 },
      opacity: 0,
      duration: 0.4,
      ease: "easeIn",
    },
    watermarkDuration: 0.6,
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
    press: { rotate: 3 },
    pressTransition: { duration: 0.1, ease: "easeOut" },
    // One swell passes through, left to right, and the lines come back level.
    hover: { x: [null, 2, 0] },
    hoverTransition: { duration: 0.5, times: [0, 0.45, 1], ease: "easeInOut" },
    // The water goes flat as the colour leaves it.
    leave: {
      pose: { scaleY: 0.5 },
      opacity: [null, 0.8, 0],
      times: [0, 0.5, 1],
      duration: 0.26,
      ease: "easeIn",
    },
    watermarkDuration: 0.3,
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
    // A wind-up quiver, running only while the finger is down.
    press: { x: [0, -1, 1, 0] },
    pressTransition: {
      duration: 0.16,
      times: [0, 0.28, 0.64, 1],
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    },
    // One twitch as the pointer arrives, then still.
    hover: { rotate: [null, -9, 7, -3, 0] },
    hoverTransition: {
      duration: 0.24,
      times: [0, 0.25, 0.55, 0.8, 1],
      ease: "easeOut",
    },
    // Fizzles: two failing flickers, then out.
    leave: {
      opacity: [null, 0.2, 0.8, 0.1, 0],
      times: [0, 0.2, 0.45, 0.7, 1],
      duration: 0.22,
      ease: "linear",
    },
    // Stamped, not faded.
    watermarkDuration: 0.1,
    deadClassName: "rotate-[20deg] opacity-75",
    countJolt: true,
  },
};

const CARD_HOP_DURATION = 0.32;
const CARD_HOP_TIMES = [0, 0.28, 0.6, 1];
// The hop drops back past the line before resting, so it reads as a snap
// rather than a lift.
const CARD_HOP_RECOIL = 0.25;
const COUNT_JOLT_DURATION = 0.18;
// Matches FilterSelectionMark's own appear duration.
const CHECK_DURATION = 0.14;
// The mark the level leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_OUT_DURATION = 0.12;

function lastParticleEnd(tempo: Tempo): number {
  if (!tempo.particle) return 0;
  const latest = Math.max(
    ...PARTICLES[tempo.particle].items.map((particle) => particle.delay),
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

type Pose = { animate: TargetAndTransition; transition: Transition };

// Where each of the icon's layers (hover, gesture, press) comes back to.
const ICON_REST: TargetAndTransition = {
  x: 0,
  y: 0,
  rotate: 0,
  scale: 1,
  opacity: 1,
};
const CARD_REST: TargetAndTransition = { y: 0 };
const LEAVE_REST: TargetAndTransition = { y: 0, scaleY: 1 };
const REST_TRANSITION: Transition = { duration: 0.16 };

// Only the card that changed moves; the others stay still.
function iconPose(celebrating: boolean, tempo: Tempo): Pose {
  if (!celebrating) {
    return { animate: ICON_REST, transition: REST_TRANSITION };
  }
  return {
    animate: tempo.gesture,
    transition: {
      duration: tempo.duration,
      times: tempo.times,
      delay: tempo.gestureDelay,
      ease: tempo.ease,
    },
  };
}

// The card itself moves only for a level loud enough to move it: lively hops.
function cardPose(celebrating: boolean, tempo: Tempo): Pose {
  if (!celebrating || tempo.cardHop <= 0) {
    return { animate: CARD_REST, transition: REST_TRANSITION };
  }
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
}

// Two layers: a muted outline that is always there, and an accent copy that
// draws itself on stroke by stroke when the level is chosen.
function EnergyGlyph({
  level,
  tempo,
  checked,
  resetDelay,
  className,
}: {
  level: EnergyLevel;
  tempo: Tempo;
  checked: boolean;
  /** Holds the stroke back so a reset empties the section in order. */
  resetDelay: number;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { leave } = tempo;

  const accent = tempo.glyph.map((d, index) => (
    <m.path
      key={d}
      d={d}
      initial={false}
      animate={{
        pathLength: checked ? 1 : 0,
        opacity: checked ? 1 : leave.opacity,
      }}
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
              // unchecking never runs the draw backwards. On a reset it
              // waits its turn with the halo around it, which was
              // staggering out over a glyph that had already gone grey.
              {
                opacity: {
                  duration: leave.duration,
                  times: leave.times,
                  ease: leave.ease,
                  delay: resetDelay,
                },
                pathLength: {
                  duration: 0,
                  delay: resetDelay + leave.duration,
                },
              }
      }
    />
  ));

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
      {/* Only a level whose colour leaves in a pose needs a moving group. */}
      {leave.pose ? (
        <m.g
          stroke="var(--brand-strong)"
          initial={false}
          animate={checked ? LEAVE_REST : leave.pose}
          transition={
            shouldReduceMotion || checked
              ? { duration: 0 }
              : { duration: leave.duration, delay: resetDelay, ease: leave.ease }
          }
        >
          {accent}
        </m.g>
      ) : (
        <g stroke="var(--brand-strong)">{accent}</g>
      )}
    </svg>
  );
}

// The sidebar column is 224px, and "Uravnotežen" does not fit a third of it at
// text-xs, so only the sheet gets three columns.
export function EnergyCards({
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
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
  unanswered?: Unanswered;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(TEMPO_MS);
  const { beginReset, resetDelay: resetDelayOf } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures();

  return (
    <FilterCardSection
      label={groupLabel("energy", locale)}
      hint={messages.energyFilterHint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetEnergyFilters}
      layout={layout}
      collapse={collapse}
      footer={<UnansweredNote tally={unanswered} />}
    >
      {options.map(({ value, label }, index) => {
            const count = counts.get(value) ?? 0;
            const checked = selected.includes(value);
            const level = levelOf(value);
            const tempo = TEMPOS[level];
            const hovered = hoveredValue === value;
            const dead = isDeadOption(count, checked);
            const celebrating = celebration?.value === value && checked;
            // The anticipation is press feedback, so it runs on touch too, and
            // it yields the moment the gesture takes over.
            const pressing =
              pressedValue === value && !celebrating && !shouldReduceMotion;
            // The hover shows the tempo a pick would play, so a chosen level
            // has nothing left to preview. Its own span keeps it off the
            // gesture's and the press's transforms.
            const previewing = hovered && !checked && !shouldReduceMotion;
            const resetDelay = resetDelayOf(index);
            const icon = iconPose(celebrating, tempo);
            const card = cardPose(celebrating, tempo);
            const gestures = gestureHandlers(value);
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
                {...gestures}
                aria-pressed={checked}
                aria-label={`${label}, ${animalCount(count, locale)}`}
                initial={false}
                animate={shouldReduceMotion ? CARD_REST : card.animate}
                transition={
                  shouldReduceMotion ? { duration: 0 } : card.transition
                }
                className={filterCardVariants({
                  layout,
                  selected: checked,
                  className: cn(
                    // isolate keeps the watermark's negative z-index above the
                    // card's own background instead of behind it.
                    "isolate flex",
                    filterCardLayoutClass(layout),
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
                            duration: tempo.watermarkDuration,
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
                    stroke="var(--brand-strong)"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {tempo.glyph.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </svg>
                </m.span>

                <FilterCardMark
                  layout={layout}
                  checked={checked}
                  appearDelay={tempo.checkDelay}
                />

                <FilterCardIconWell
                  layout={layout}
                  checked={checked}
                  exitDelay={resetDelay}
                >
                  {celebrating && !shouldReduceMotion ? (
                    <FilterCardRipple
                      key={`ring-${celebration?.id}`}
                      layout={layout}
                      opacity={tempo.rippleOpacity}
                      scale={tempo.rippleScale}
                      duration={tempo.rippleDuration}
                    />
                  ) : null}
                  {celebrating && particles && !shouldReduceMotion
                    ? particles.items.map((particle) => (
                        <m.span
                          key={`particle-${celebration?.id}-${particle.x}-${particle.y}`}
                          // Absolute, so nothing here can move the label or the
                          // count.
                          className="pointer-events-none absolute text-brand-strong"
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
                          {/* The turn stays on the svg; the span owns
                              transform. */}
                          <svg
                            viewBox="0 0 6 6"
                            width={particle.size}
                            height={particle.size}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={PARTICLE_STROKE}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={
                              particles.turn
                                ? {
                                    rotate: `${Math.atan2(particle.y, particle.x)}rad`,
                                  }
                                : undefined
                            }
                          >
                            <path d={particles.path} />
                          </svg>
                        </m.span>
                      ))
                    : null}
                  <FilterCardHoverLift hovered={hovered}>
                    <m.span
                      className="flex items-center justify-center"
                      initial={false}
                      animate={previewing ? tempo.hover : ICON_REST}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : previewing
                            ? tempo.hoverTransition
                            : REST_TRANSITION
                      }
                    >
                      <m.span
                        className="flex items-center justify-center"
                        initial={false}
                        animate={
                          shouldReduceMotion ? ICON_REST : icon.animate
                        }
                        transition={
                          shouldReduceMotion ? { duration: 0 } : icon.transition
                        }
                      >
                        <m.span
                          className="flex items-center justify-center"
                          initial={false}
                          animate={pressing ? tempo.press : ICON_REST}
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
                            resetDelay={resetDelay}
                            className={cn(
                              "size-5 transition-transform duration-200",
                              // A dead option has no charge left to show.
                              dead && tempo.deadClassName,
                            )}
                          />
                        </m.span>
                      </m.span>
                    </m.span>
                  </FilterCardHoverLift>
                </FilterCardIconWell>

                <FilterCardTail
                  layout={layout}
                  label={label}
                  checked={checked}
                  renderCount={(className) => (
                    <m.span
                      className={className}
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
                  )}
                />
              </m.button>
            );
          })}
    </FilterCardSection>
  );
}
