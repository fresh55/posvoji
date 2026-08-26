"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import type { SpeciesFilter } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ANNOUNCEMENT_DELAY_MS = 250;
const LABEL_TRANSITION_DURATION = 0.14;
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
  return (
    typeof window.matchMedia !== "function" ||
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
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

  return (
    <span
      className={cn(
        "relative isolate inline-flex shrink-0 items-center overflow-hidden tabular-nums",
        // A fact about the results, not a control, so it reads as plain text:
        // no border, no fill, no icon, nothing that looks pressable next to
        // the shelter picker and the sort control it sits between.
        variant === "standalone"
          ? "text-sm text-muted-foreground"
          : "justify-end text-xs",
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
        <span
          aria-hidden="true"
          className="relative inline-flex items-center gap-1"
        >
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
                className="col-start-1 row-start-1"
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
