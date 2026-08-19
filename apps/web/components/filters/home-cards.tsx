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
import type { HomeKey } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type HomeOption = { key: HomeKey; label: string };

// One stroke of the building, drawn in list order. A dead card tips a single
// window frame off true, which is the only thing that separates the drawing
// from the live one.
type Stroke = { d: string; deadTransform?: string };

const BUILDING: Stroke[] = [
  // Silhouette, then the ground it stands on, then the door.
  { d: "M5 21V4.6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V21" },
  { d: "M3 21h18" },
  { d: "M10.2 21v-3.2a1.8 1.8 0 0 1 3.6 0V21" },
  { d: "M7.4 6.6h3.2v3.2H7.4z", deadTransform: "rotate(7 9 8.2)" },
  { d: "M13.4 6.6h3.2v3.2h-3.2z" },
  { d: "M7.4 11.9h3.2v3.2H7.4z" },
  { d: "M13.4 11.9h3.2v3.2h-3.2z" },
];

// The panes behind the frames, in the order they come on. Same coordinates as
// the four frame strokes above, so the light sits inside the drawing.
const WINDOWS = [
  { x: 7.4, y: 6.6 },
  { x: 13.4, y: 6.6 },
  { x: 7.4, y: 11.9 },
  { x: 13.4, y: 11.9 },
];
const WINDOW_SIZE = 3.2;

const DRAW_DURATION = 0.36;
const DRAW_STAGGER = 0.06;
const FADE_DURATION = 0.12;

// The windows wait for the building to finish drawing, then come on one at a
// time. Going dark runs the other way, last window first.
const LIGHT_DELAY = 0.42;
const LIGHT_STAGGER = 0.11;
const LIGHT_DURATION = 0.24;
const LIGHT_OPACITY = 0.55;
const DIM_DURATION = 0.16;
const DIM_STAGGER = 0.07;

// The glow behind the building blooms once most of the windows are lit. Three
// keyframes, so it runs as a tween with its own times rather than a spring.
const GLOW_DELAY = 0.6;
const GLOW_DURATION = 0.5;
const GLOW_KEYFRAMES: TargetAndTransition = {
  opacity: [0, 0.4, 0],
  scale: [0.55, 1.25, 1.7],
};
const GLOW_TIMES = [0, 0.4, 1];

// The check confirms after the last window, not before it.
const CHECK_DELAY =
  LIGHT_DELAY + (WINDOWS.length - 1) * LIGHT_STAGGER + LIGHT_DURATION;
// Matches FilterSelectionMark's own appear duration.
const CHECK_DURATION = 0.14;

// A press is a settle, not a bounce: the card takes the weight and holds it.
const PRESS_SETTLE: TargetAndTransition = { scale: 0.96 };
const PRESS_REST: TargetAndTransition = { scale: 1 };
const PRESS_TRANSITION: Transition = { duration: 0.12, ease: "easeOut" };
const REST_TRANSITION: Transition = { duration: 0.16 };

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

// The mark the lit building leaves behind on a selected card.
const WATERMARK_OPACITY = 0.08;
const WATERMARK_IN_DURATION = 0.3;
const WATERMARK_OUT_DURATION = 0.12;

const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;

// Every phase measured from the moment the card is switched on. The hold has
// to outlast the slowest of them, because clearing the celebration snaps
// whatever is still running back to rest.
const LIGHTS_MS = Math.ceil(
  1000 *
    Math.max(
      (BUILDING.length - 1) * DRAW_STAGGER + DRAW_DURATION,
      CHECK_DELAY + CHECK_DURATION,
      CHECK_DELAY + WATERMARK_IN_DURATION,
      GLOW_DELAY + GLOW_DURATION,
    ),
);

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

// Two layers over the lit panes: a muted outline that draws itself on when the
// section first appears, and an accent copy that draws on when the card is
// chosen.
function HomeGlyph({
  checked,
  dead,
  className,
}: {
  checked: boolean;
  dead: boolean;
  className: string;
}) {
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
      <g>
        {WINDOWS.map(({ x, y }, index) => (
          <m.rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={WINDOW_SIZE}
            height={WINDOW_SIZE}
            rx={0.35}
            fill="var(--filter-accent-strong)"
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: checked ? LIGHT_OPACITY : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? {
                      duration: LIGHT_DURATION,
                      delay: LIGHT_DELAY + index * LIGHT_STAGGER,
                      ease: "easeOut",
                    }
                  : {
                      duration: DIM_DURATION,
                      // The lights go out the way a house empties: the last
                      // room lit is the first one dark.
                      delay: (WINDOWS.length - 1 - index) * DIM_STAGGER,
                      ease: "easeOut",
                    }
            }
          />
        ))}
      </g>
      <g className="text-muted-foreground" stroke="currentColor">
        {BUILDING.map(({ d, deadTransform }, index) => (
          <m.path
            key={d}
            d={d}
            transform={dead ? deadTransform : undefined}
            // A real initial, so the building is drawn rather than already
            // standing when the section is opened.
            initial={{ pathLength: shouldReduceMotion ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    duration: DRAW_DURATION,
                    delay: index * DRAW_STAGGER,
                    ease: "easeOut",
                  }
            }
          />
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
        {BUILDING.map(({ d, deadTransform }, index) => (
          <m.path
            key={d}
            d={d}
            transform={dead ? deadTransform : undefined}
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

export function HomeCards({
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
  options: HomeOption[];
  counts: Map<string, number>;
  selected: HomeKey[];
  /** Animals the current filters leave, and the pool they were taken from. */
  resultCount: number;
  total: number;
  onToggle: (key: HomeKey) => void;
  onToggleMany: (values: HomeKey[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<HomeKey>(LIGHTS_MS);
  const [isResetting, setIsResetting] = useState(false);
  const [pressedKey, setPressedKey] = useState<HomeKey | null>(null);
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover();

  const releasePress = (key: HomeKey) =>
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
      : t("homeOutcome", { count: resultCount, total });

  return (
    <section>
      <FilterSectionHeader
        label={messages.home}
        active={selected.length > 0}
        onReset={() => {
          clearCelebration();
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetHomeFilters}
        collapse={collapse}
        hint={messages.homeFilterHint}
      />
      <CollapsibleBody open={collapse?.open ?? true} id={collapse?.contentId}>
      {/* The sidebar carries the hint in its header, where only a pointer can
          reach it. The sheet and every touch screen keep the sentence here. */}
      <p className={sectionHintClass(collapse)}>{messages.homeFilterHint}</p>
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
            // The settle is press feedback, so it runs on touch too, and it
            // yields the moment the lights take over.
            const pressing =
              pressedKey === key && !celebrating && !shouldReduceMotion;
            // A reset winks the rows out in order rather than all at once.
            const resetDelay = isResetting ? index * RESET_STAGGER : 0;
            const hover = hoverHandlers(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (checked) {
                    clearCelebration();
                  } else {
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
                {/* The mark the lit house leaves on the card, clipped by the
                    card's own overflow. */}
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
                    {BUILDING.map(({ d }) => (
                      <path key={d} d={d} />
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
                      key={`glow-${celebration?.id}`}
                      className={cn(
                        "pointer-events-none absolute rounded-full bg-[var(--filter-accent-strong)] blur-[6px]",
                        layout === "sheet" ? "size-7" : "size-7.5",
                      )}
                      initial={{ opacity: 0, scale: 0.55 }}
                      animate={GLOW_KEYFRAMES}
                      transition={{
                        duration: GLOW_DURATION,
                        delay: GLOW_DELAY,
                        times: GLOW_TIMES,
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
                      animate={pressing ? PRESS_SETTLE : PRESS_REST}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : pressing
                            ? PRESS_TRANSITION
                            : REST_TRANSITION
                      }
                    >
                      <HomeGlyph
                        checked={checked}
                        dead={dead}
                        className={cn(
                          "size-5 transition-opacity duration-200",
                          // An unlit house nobody can move into.
                          dead && "opacity-70",
                        )}
                      />
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
