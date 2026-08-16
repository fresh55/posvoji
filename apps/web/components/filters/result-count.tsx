"use client";

import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import type { Locale } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function ResultCount({
  count,
  locale,
  announce = true,
  className,
}: {
  count: number;
  locale: Locale;
  announce?: boolean;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const label = animalCount(count, locale);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 justify-end overflow-hidden text-xs tabular-nums",
        className,
      )}
    >
      {announce && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {label}
        </span>
      )}
      <LazyMotion features={domAnimation}>
        <AnimatePresence initial={false} mode="wait">
          <m.span
            key={count}
            aria-hidden={announce || undefined}
            initial={shouldReduceMotion ? false : { opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 3 }
            }
            transition={{ duration: shouldReduceMotion ? 0 : 0.13 }}
          >
            {label}
          </m.span>
        </AnimatePresence>
      </LazyMotion>
    </span>
  );
}
