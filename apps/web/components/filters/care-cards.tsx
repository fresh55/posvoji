"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  sectionHintClass,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import type { CareKey } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type CareOption = { key: CareKey; label: string };

// One stroke of the glyph, drawn in list order: the heart first, then the
// plaster laid across it. The plaster carries its own rotation, so the two
// halves of the drawing keep one coordinate system.
type Stroke = { d: string; transform?: string };

const PLASTER_ANGLE = "rotate(-38 12 11)";

const HEART_AND_PLASTER: Stroke[] = [
  {
    d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  },
  {
    d: "M9.4 9.6h5.2a1.4 1.4 0 0 1 0 2.8H9.4a1.4 1.4 0 0 1 0-2.8Z",
    transform: PLASTER_ANGLE,
  },
  { d: "M12 9.6v2.8", transform: PLASTER_ANGLE },
];

// Patience is the tempo of this section, so every number here is the slowest
// in the sidebar on purpose.
const DRAW_DURATION = 0.5;
const DRAW_STAGGER = 0.16;
const FADE_DURATION = 0.14;

// One deep lub-dub. Two beats, the second the fuller of the pair, then still.
// Six keyframes, so it can only run as a tween carrying its own times.
const BEAT_DURATION = 1.15;
const BEAT_TIMES = [0, 0.13, 0.3, 0.46, 0.66, 1];
const BEAT_SCALE = [1, 1.11, 1.02, 1.18, 1, 1];
const BEAT: TargetAndTransition = { scale: BEAT_SCALE };
const BEAT_TRANSITION: Transition = {
  duration: BEAT_DURATION,
  times: BEAT_TIMES,
  ease: "easeInOut",
};

// One warm ring leaving the heart, wider and slower than the household ripple.
const RIPPLE_DURATION = 1.05;
const RIPPLE_OPACITY = 0.26;
const RIPPLE_SCALE = 2.1;

// The check confirms after the second beat, not between the two.
const CHECK_DELAY = 0.72;
// Matches FilterSelectionMark's own appear duration.
const CHECK_DURATION = 0.14;

// The press is a hold rather than a tap: it eases in and nothing springs back.
const PRESS_HOLD: TargetAndTransition = { scale: 0.965 };
const PRESS_REST: TargetAndTransition = { scale: 1 };
const PRESS_TRANSITION: Transition = { duration: 0.3, ease: "easeOut" };

// Letting go is an exhale, quick and small, and never a snap.
const EXHALE: TargetAndTransition = { scale: [1, 0.97, 1] };
const EXHALE_TRANSITION: Transition = {
  duration: 0.3,
  times: [0, 0.4, 1],
  ease: "easeInOut",
};
const EXHALE_MS = 320;

const BEAT_REST: TargetAndTransition = { scale: 1 };
const REST_TRANSITION: Transition = { duration: 0.16 };

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

// The mark the chosen heart leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;

// Every phase measured from the moment the card is switched on. The hold has
// to outlast the slowest of them, because clearing the celebration snaps
// whatever is still running back to rest.
const HEARTBEAT_MS = Math.ceil(
  1000 *
    Math.max(
      BEAT_DURATION,
      RIPPLE_DURATION,
      (HEART_AND_PLASTER.length - 1) * DRAW_STAGGER + DRAW_DURATION,
      CHECK_DELAY + CHECK_DURATION,
      CHECK_DELAY + WATERMARK_IN_DURATION,
    ),
);

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

// Two layers: a muted outline that is always there, and an accent copy that
// draws itself on when the card is chosen, heart first and plaster last.
function CareGlyph({ checked, className }: { checked: boolean; className: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="text-muted-foreground" stroke="currentColor">
        {HEART_AND_PLASTER.map(({ d, transform }) => (
          <path key={d} d={d} transform={transform} />
        ))}
      </g>
      <m.g
        stroke="var(--filter-accent-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : FADE_DURATION,
          ease: "easeOut",
        }}
      >
        {HEART_AND_PLASTER.map(({ d, transform }, index) => (
          <m.path
            key={d}
            d={d}
            transform={transform}
            initial={false}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? {
                      duration: DRAW_DURATION,
                      delay: index * DRAW_STAGGER,
                      ease: "easeOut",
                    }
                  : // The drawn length drops only once the overlay has faded
                    // out, so unchecking never runs the draw backwards.
                    { duration: 0, delay: FADE_DURATION }
            }
          />
        ))}
      </m.g>
    </svg>
  );
}

export function CareCards({
  options,
  counts,
  selected,
  resultCount,
  total,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  options: CareOption[];
  counts: Map<string, number>;
  selected: CareKey[];
  /** Animals the current filters leave, and the pool they were taken from. */
  resultCount: number;
  total: number;
  onToggle: (key: CareKey) => void;
  onToggleMany: (values: CareKey[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<CareKey>(HEARTBEAT_MS);
  // Letting go is its own one-shot, held as {value, id} for the same reason
  // the beat is: switching the same card off twice has to run twice.
  const {
    celebration: exhale,
    celebrate: exhaleNow,
    clear: clearExhale,
  } = useOneShotCelebration<CareKey>(EXHALE_MS);
  const [isResetting, setIsResetting] = useState(false);
  const [pressedKey, setPressedKey] = useState<CareKey | null>(null);
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover();

  const releasePress = (key: CareKey) =>
    setPressedKey((current) => (current === key ? null : current));

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const outcome =
    selected.length === 0
      ? null
      : t("careOutcome", { count: resultCount, total });

  return (
    <section>
      <FilterSectionHeader
        label={messages.care}
        active={selected.length > 0}
        onReset={() => {
          clearCelebration();
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetCareFilters}
        collapse={collapse}
        hint={messages.careFilterHint}
      />
      <CollapsibleBody open={collapse?.open ?? true} id={collapse?.contentId}>
      {/* The sidebar carries the hint in its header, where only a pointer can
          reach it. The sheet and every touch screen keep the sentence here. */}
      <p className={sectionHintClass(collapse)}>{messages.careFilterHint}</p>
      <LazyMotion features={domAnimation}>
        <div
          className={cn(
            "grid gap-1.5",
            // The sheet columns exist to fit several short labels side by
            // side. One long label is a full-width tile instead of a third of
            // a row it cannot be read in.
            layout === "sheet" && options.length > 1
              ? "grid-cols-2"
              : "grid-cols-1",
          )}
        >
          {options.map(({ key, label }, index) => {
            const count = counts.get(key) ?? 0;
            const checked = selected.includes(key);
            const dead = isDead(count, checked);
            const hovered = hoveredKey === key;
            const celebrating = celebration?.value === key && checked;
            const exhaling = exhale?.value === key && !checked;
            // The hold is press feedback, so it runs on touch too, and it
            // yields the moment the beat takes over.
            const pressing =
              pressedKey === key && !celebrating && !shouldReduceMotion;
            // A reset winks the row out rather than dropping it.
            const resetDelay = isResetting ? index * RESET_STAGGER : 0;
            const hover = hoverHandlers(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (checked) {
                    clearCelebration();
                    exhaleNow(key);
                  } else {
                    clearExhale();
                    celebrate(key);
                  }
                  // Touch browsers can skip pointerleave when the finger slides
                  // off, and pointercancel does not cover every path, so the
                  // click clears the press too.
                  releasePress(key);
                  onToggle(key);
                }}
                disabled={dead}
                {...hover}
                onPointerLeave={() => {
                  hover.onPointerLeave();
                  releasePress(key);
                }}
                onPointerDown={() => setPressedKey(key)}
                onPointerUp={() => releasePress(key)}
                onPointerCancel={() => releasePress(key)}
                aria-pressed={checked}
                aria-label={`${label}, ${animalCount(count, locale)}`}
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
                {/* The mark the chosen heart leaves on the card, clipped by
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
                            delay: CHECK_DELAY,
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
                    {HEART_AND_PLASTER.map(({ d, transform }) => (
                      <path key={d} d={d} transform={transform} />
                    ))}
                  </svg>
                </m.span>

                <FilterSelectionMark
                  checked={checked}
                  appearDelay={CHECK_DELAY}
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
                      initial={{ opacity: RIPPLE_OPACITY, scale: 0.7 }}
                      animate={{ opacity: 0, scale: RIPPLE_SCALE }}
                      transition={{
                        duration: RIPPLE_DURATION,
                        ease: "easeOut",
                      }}
                    />
                  ) : null}
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
                        shouldReduceMotion
                          ? BEAT_REST
                          : celebrating
                            ? BEAT
                            : exhaling
                              ? EXHALE
                              : BEAT_REST
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : celebrating
                            ? BEAT_TRANSITION
                            : exhaling
                              ? EXHALE_TRANSITION
                              : REST_TRANSITION
                      }
                    >
                      <m.span
                        className="flex items-center justify-center"
                        initial={false}
                        animate={pressing ? PRESS_HOLD : PRESS_REST}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : pressing
                              ? PRESS_TRANSITION
                              : REST_TRANSITION
                        }
                      >
                        <CareGlyph
                          checked={checked}
                          className={cn(
                            "size-5 transition-[opacity,transform] duration-200",
                            // A dead option is a heart nobody is waiting on.
                            dead && "rotate-[10deg] opacity-60",
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
                    <CountRoll
                      value={count}
                      className="text-[11px] tabular-nums text-muted-foreground"
                    />
                  </>
                ) : (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span
                      className={cn("truncate text-xs", checked && "font-medium")}
                    >
                      {label}
                    </span>
                    <CountRoll
                      value={count}
                      className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </LazyMotion>

      {/* What the section did to the list, and the one line the screen reader
          hears. Nothing selected says nothing. */}
      <p
        aria-live="polite"
        className="mt-2 text-[11px] leading-snug text-muted-foreground empty:mt-0"
      >
        {outcome}
      </p>
      </CollapsibleBody>
    </section>
  );
}
