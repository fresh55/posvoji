"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Cat,
  Dog,
  PawPrint,
  Rabbit,
  type LucideIcon,
} from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
} from "motion/react";
import type { SpeciesFilter } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SPECIES_ICONS: Record<SpeciesFilter, LucideIcon> = {
  all: PawPrint,
  dog: Dog,
  cat: Cat,
  rabbit: Rabbit,
  other: PawPrint,
};

const ANNOUNCEMENT_DELAY_MS = 250;
const ICON_TRANSITION_DURATION = 0.24;
const LABEL_TRANSITION_DURATION = 0.14;
const PULSE_TRANSITION_DURATION = 0.32;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const COUNT_Y_TRANSITION = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.55,
} as const;
const COUNT_SCALE_TRANSITION = {
  type: "spring",
  stiffness: 600,
  damping: 32,
  mass: 0.5,
} as const;

const EMPTY_ICON_POSES: Record<
  SpeciesFilter,
  { rotate: number; scale: number; x: number; y: number }
> = {
  all: { rotate: -10, scale: 0.9, x: 0, y: 1 },
  dog: { rotate: 8, scale: 0.92, x: 0, y: 1 },
  cat: { rotate: -8, scale: 0.92, x: 0, y: 1 },
  rabbit: { rotate: 6, scale: 0.9, x: 0, y: 1 },
  other: { rotate: -10, scale: 0.9, x: 0, y: 1 },
};

const countVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    scale: 0.88,
    y: direction * 9,
  }),
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    scale: 0.94,
    y: direction * -9,
  }),
};

export function countDirection(previous: number, next: number): -1 | 0 | 1 {
  return Math.sign(next - previous) as -1 | 0 | 1;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotionPreference(): boolean {
  return typeof window.matchMedia !== "function" ||
    window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionPreference(): true {
  // Rendering the calm state on the server keeps hydration deterministic. The
  // client enables motion only after hydration and only when the user allows it.
  return true;
}

function useSettledCount(count: number): number {
  const [settledCount, setSettledCount] = useState(count);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setSettledCount(count),
      ANNOUNCEMENT_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [count]);

  return settledCount;
}

export function ResultCount({
  count,
  species,
  locale,
  announce = true,
  variant = "standalone",
  clearTrailKey = 0,
  className,
}: {
  count: number;
  species: SpeciesFilter;
  locale: Locale;
  announce?: boolean;
  variant?: "standalone" | "inline";
  clearTrailKey?: number;
  className?: string;
}) {
  const shouldReduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    getServerReducedMotionPreference,
  );
  const [motionReady, setMotionReady] = useState(false);
  const [change, setChange] = useState({ count, direction: 0 });
  const shouldAnimate = motionReady && !shouldReduceMotion;
  const direction =
    change.count === count
      ? change.direction
      : countDirection(change.count, count);
  const settledCount = useSettledCount(count);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMotionReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (change.count === count) return;
    const previousCount = change.count;
    const frame = window.requestAnimationFrame(() => {
      setChange({ count, direction: countDirection(previousCount, count) });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [change.count, count]);

  const label = animalCount(count, locale);
  const settledLabel = animalCount(settledCount, locale);
  const countText = String(count);
  const noun = label.slice(countText.length + 1);
  const SpeciesIcon = SPECIES_ICONS[species];
  const speciesIconPose =
    count === 0
      ? { opacity: 1, ...EMPTY_ICON_POSES[species] }
      : { opacity: 1, rotate: 0, scale: 1, x: 0, y: 0 };
  const iconAnimation =
    direction > 0
      ? { y: [0, -3, 0], scale: [1, 1.08, 1], rotate: [0, -5, 0] }
      : { y: [0, 2, 0], scale: [1, 0.9, 1], rotate: [0, 4, 0] };

  return (
    <span
      className={cn(
        "relative isolate inline-flex shrink-0 overflow-hidden text-xs tabular-nums",
        variant === "standalone"
          ? cn(
              "min-h-7 min-w-24 justify-center rounded-ui border border-border/80 px-2.5 py-1 shadow-xs",
              count === 0
                ? "bg-muted/30 text-muted-foreground"
                : "bg-background",
            )
          : "justify-end",
        className,
      )}
    >
      <span
        className="sr-only"
        aria-live={announce ? "polite" : undefined}
        aria-atomic={announce ? "true" : undefined}
      >
        {announce ? settledLabel : label}
      </span>
      <LazyMotion features={domAnimation}>
        {variant === "standalone" && clearTrailKey > 0 && (
            <span
              key={clearTrailKey}
              data-clear-trail
              aria-hidden
              className="pointer-events-none absolute left-1.5 top-1/2 z-20 -translate-y-1/2 text-[var(--filter-accent-strong)]"
            >
              {[0, 1].map((step) => (
                <m.span
                  key={step}
                  className="absolute left-0 top-0 grid place-items-center"
                  initial={
                    shouldAnimate
                      ? {
                          opacity: 0,
                          rotate: step === 0 ? -18 : 14,
                          scale: 0.55,
                          x: step * 3,
                          y: 2,
                        }
                      : false
                  }
                  animate={
                    shouldAnimate
                      ? {
                          opacity: [0, 0.72, 0],
                          rotate:
                            step === 0 ? [-18, -8, 2] : [14, 5, -3],
                          scale: [0.55, 0.9, 0.72],
                          x: [step * 3, step * 3 + 3, step * 3 + 7],
                          y: [2, -1, -5],
                        }
                      : undefined
                  }
                  transition={{
                    delay: step * 0.07,
                    duration: 0.46,
                    times: [0, 0.42, 1],
                  }}
                >
                  <PawPrint className={step === 0 ? "size-2" : "size-1.5"} />
                </m.span>
              ))}
            </span>
          )}
        {variant === "standalone" &&
          shouldAnimate &&
          direction !== 0 &&
          count > 0 && (
            <m.span
              key={`pulse-${count}`}
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-ui bg-[var(--filter-accent)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{
                duration: PULSE_TRANSITION_DURATION,
                times: [0, 0.35, 1],
              }}
            />
          )}
        <span
          aria-hidden="true"
          className="relative inline-flex items-center gap-1.5"
        >
          {variant === "standalone" && (
            <m.span
              key={count}
              data-empty-pose={count === 0 ? species : undefined}
              className={cn(
                "relative grid size-3.5 shrink-0 place-items-center",
                count === 0
                  ? "text-muted-foreground/50"
                  : "text-[var(--filter-accent-strong)]",
              )}
              initial={
                !shouldAnimate || direction === 0
                  ? false
                  : { y: 0, scale: 1, rotate: 0 }
              }
              animate={
                !shouldAnimate || direction === 0
                  ? undefined
                  : iconAnimation
              }
              transition={{
                duration: ICON_TRANSITION_DURATION,
                times: [0, 0.42, 1],
              }}
            >
              <AnimatePresence initial={false} mode="popLayout">
                <m.span
                  key={species}
                  className="col-start-1 row-start-1 grid size-3.5 place-items-center"
                  initial={
                    !shouldAnimate
                      ? false
                      : { opacity: 0, scale: 0.72, rotate: -8 }
                  }
                  animate={speciesIconPose}
                  exit={
                    !shouldAnimate
                      ? undefined
                      : { opacity: 0, scale: 0.72, rotate: 8 }
                  }
                  transition={{ duration: LABEL_TRANSITION_DURATION }}
                >
                  <SpeciesIcon className="size-3.5" strokeWidth={1.9} />
                </m.span>
              </AnimatePresence>
            </m.span>
          )}
          <span className="relative inline-grid overflow-hidden">
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={direction}
            >
              <m.span
                key={count}
                custom={direction}
                variants={shouldAnimate ? countVariants : undefined}
                initial={shouldAnimate ? "enter" : false}
                animate={shouldAnimate ? "center" : undefined}
                exit={shouldAnimate ? "exit" : undefined}
                transition={{
                  y: COUNT_Y_TRANSITION,
                  scale: COUNT_SCALE_TRANSITION,
                  opacity: { duration: LABEL_TRANSITION_DURATION },
                }}
                className="col-start-1 row-start-1 font-semibold"
              >
                {countText}
              </m.span>
            </AnimatePresence>
          </span>
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              key={noun}
              initial={shouldAnimate ? { opacity: 0, x: -2 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldAnimate ? { opacity: 0, x: 2 } : undefined}
              transition={{
                duration: shouldAnimate ? LABEL_TRANSITION_DURATION : 0,
              }}
            >
              {noun}
            </m.span>
          </AnimatePresence>
        </span>
      </LazyMotion>
    </span>
  );
}
