"use client";

import { Check } from "lucide-react";
import { cva } from "class-variance-authority";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// One shadcn-style surface contract for every compact filter choice. Layout
// stays with the caller; interaction, state, and accessibility chrome do not.
export const filterCardVariants = cva(
  "group relative min-w-0 overflow-hidden rounded-ui border border-border/80 bg-background shadow-xs outline-none transition-[border-color,background-color,box-shadow,color] duration-150 hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      selected: {
        true: "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)] shadow-xs hover:border-[var(--filter-accent-border)] hover:bg-[var(--filter-accent)] data-[state=on]:bg-[var(--filter-accent)]",
        false:
          "text-muted-foreground data-[state=off]:bg-background data-[state=off]:hover:bg-muted/40",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const COUNT_ROLL_DURATION = 0.28;

// A changed number slides in rather than swapping in place, so the narrowing
// is something you watch happen. Never on first paint: nothing narrowed
// there. Every caller already sits inside its own LazyMotion, so this reads
// domAnimation from that context instead of opening a second one.
export function CountRoll({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Each change bumps the epoch, which remounts the number so the slide runs
  // again. Epoch zero is the first paint and renders still.
  const [displayed, setDisplayed] = useState({ value, epoch: 0 });
  if (displayed.value !== value) {
    setDisplayed({ value, epoch: displayed.epoch + 1 });
  }

  if (shouldReduceMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <m.span
        key={displayed.epoch}
        className="block"
        initial={displayed.epoch > 0 ? { y: -6, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: COUNT_ROLL_DURATION, ease: "easeOut" }}
      >
        {value}
      </m.span>
    </span>
  );
}

export function FilterSelectionMark({
  checked,
  className,
  // Lets a caller hold the check back until its own gesture has landed.
  appearDelay = 0,
}: {
  checked: boolean;
  className?: string;
  appearDelay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <span
        aria-hidden
        className={cn(
          "relative grid size-4.5 shrink-0 place-items-center rounded-sm border transition-[border-color,background-color,color] duration-150",
          checked
            ? "border-[var(--filter-accent-strong)] bg-[var(--filter-accent-strong)] text-white"
            : "border-muted-foreground/40 bg-background text-transparent",
          className,
        )}
      >
        <m.span
          initial={false}
          animate={{
            opacity: checked ? 1 : 0,
            scale: checked ? 1 : 0.55,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : checked
                ? { duration: 0.14, delay: appearDelay, ease: "easeOut" }
                : { duration: 0.1, ease: "easeOut" }
          }
        >
          <Check className="size-3" strokeWidth={2.6} />
        </m.span>
      </span>
    </LazyMotion>
  );
}
