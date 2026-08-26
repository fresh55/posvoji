"use client";

import { Check } from "lucide-react";
import { cva } from "class-variance-authority";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  CollapsibleBody,
  FilterSectionHeader,
  SectionHint,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import { cn } from "@/lib/utils";

/** A card is a row in the sidebar's one column, a tile in the sheet's three. */
export type FilterCardLayout = "sidebar" | "sheet";

// One shadcn-style surface contract for every compact filter choice. Layout
// stays with the caller; interaction, state, and accessibility chrome do not.
export const filterCardVariants = cva(
  "group relative min-w-0 overflow-hidden rounded-ui border border-border/80 bg-background shadow-xs outline-none transition-[border-color,background-color,box-shadow,color,transform] duration-150 hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground active:scale-[0.98] active:bg-muted/40 focus-ring disabled:pointer-events-none disabled:opacity-50",
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

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
export function isDeadOption(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

/** The class the caller hands filterCardVariants for its layout. */
export function filterCardLayoutClass(layout: FilterCardLayout): string {
  return layout === "sheet"
    ? "min-h-[4.75rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center"
    : "h-11 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left";
}

function markClass(layout: FilterCardLayout): string {
  return layout === "sheet"
    ? "absolute right-1.5 top-1.5"
    : "absolute right-2.5 top-1/2 -translate-y-1/2";
}

function iconSizeClass(layout: FilterCardLayout): string {
  return layout === "sheet" ? "size-7" : "size-7.5";
}

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

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

// The section frame every card group shares: its heading and reset, the line
// saying where the answers come from, and the grid the cards sit in. A
// collapse contract turns the heading into a disclosure trigger and moves the
// hint into its tooltip; without one the section always shows everything, as
// the mobile sheet needs.
export function FilterCardSection({
  label,
  hint,
  active,
  onReset,
  resetAriaLabel,
  layout,
  collapse,
  sheetColumns = "grid-cols-3",
  children,
  footer,
}: {
  label: string;
  hint: string;
  active: boolean;
  onReset: () => void;
  resetAriaLabel: string;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
  /** The sheet's columns, for a section whose labels are too long for three. */
  sheetColumns?: string;
  children: ReactNode;
  /** What a section says about its cards once they are read together. */
  footer?: ReactNode;
}) {
  return (
    <section>
      <FilterSectionHeader
        label={label}
        active={active}
        onReset={onReset}
        resetAriaLabel={resetAriaLabel}
        collapse={collapse}
        hint={hint}
      />
      <CollapsibleBody collapse={collapse}>
        <SectionHint collapse={collapse}>{hint}</SectionHint>
        <LazyMotion features={domAnimation}>
          <div
            className={cn(
              "grid gap-1.5",
              layout === "sheet" ? sheetColumns : "grid-cols-1",
            )}
          >
            {children}
          </div>
        </LazyMotion>
        {footer}
      </CollapsibleBody>
    </section>
  );
}

/** The check, placed where the layout puts it. */
export function FilterCardMark({
  layout,
  checked,
  appearDelay,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  appearDelay: number;
}) {
  return (
    <FilterSelectionMark
      checked={checked}
      appearDelay={appearDelay}
      className={markClass(layout)}
    />
  );
}

// The icon column: a halo that lights when the card is chosen, and whatever the
// section draws over it. exitDelay lets a reset wink the cards out in order
// rather than all at once.
export function FilterCardIconWell({
  layout,
  checked,
  exitDelay = 0,
  children,
}: {
  layout: FilterCardLayout;
  checked: boolean;
  exitDelay?: number;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();
  const size = iconSizeClass(layout);

  return (
    <span
      aria-hidden
      className={cn("relative grid shrink-0 place-items-center", size)}
    >
      <m.span
        className={cn("absolute rounded-full bg-muted-foreground/10", size)}
        initial={false}
        animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.6 }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : checked
              ? { type: "spring", stiffness: 380, damping: 26 }
              : { duration: 0.15, delay: exitDelay, ease: "easeOut" }
        }
      />
      {children}
    </span>
  );
}

/** The ring leaving the icon as the card is switched on. */
export function FilterCardRipple({
  layout,
  opacity,
  scale,
  duration,
}: {
  layout: FilterCardLayout;
  opacity: number;
  scale: number;
  duration: number;
}) {
  return (
    <m.span
      className={cn(
        "pointer-events-none absolute rounded-full border border-[var(--filter-accent-strong)]",
        iconSizeClass(layout),
      )}
      initial={{ opacity, scale: 0.7 }}
      animate={{ opacity: 0, scale }}
      transition={{ duration, ease: "easeOut" }}
    />
  );
}

/** The lift a pointer or keyboard focus gives the icon. */
export function FilterCardHoverLift({
  hovered,
  children,
}: {
  hovered: boolean;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <m.span
      // No will-change here. A standing will-change keeps the icon on its own
      // compositor layer even at rest, and a layer whose box lands on a
      // fractional pixel is rasterized off the grid: the sidebar glyphs
      // rendered visibly soft at 1x. Motion promotes the layer for the
      // moments it is actually animating.
      className="relative flex items-center justify-center"
      initial={false}
      animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : HOVER_SPRING}
    >
      {children}
    </m.span>
  );
}

// The label and count after the icon. The count is a render prop because a
// section may animate it, and its class comes from the layout either way.
export function FilterCardTail({
  layout,
  label,
  checked,
  renderCount,
}: {
  layout: FilterCardLayout;
  label: string;
  checked: boolean;
  renderCount: (className: string) => ReactNode;
}) {
  if (layout === "sheet") {
    return (
      <>
        {/* line-clamp-2, not truncate: at 320px in two columns a label like
            "Sterilizacija" clips to a couple of letters on one line, and the
            tile is tall enough (min-h-[4.75rem]) to hold a second line. */}
        <span
          className={cn(
            "mt-0.5 line-clamp-2 max-w-full text-xs leading-tight",
            checked && "font-medium",
          )}
        >
          {label}
        </span>
        {renderCount(
          cn(
            "text-2xs tabular-nums text-muted-foreground",
            // The selected card's wash is --filter-accent, and
            // text-muted-foreground was tuned against --background/--muted,
            // not this card's own bg: 4.417:1 there, under the 4.5:1 AA
            // floor for 11px text. --filter-accent-count-foreground is the
            // same hue at a darker tone built for this background instead.
            checked && "text-[var(--filter-accent-count-foreground)]",
          ),
        )}
      </>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
      <span className={cn("truncate text-xs", checked && "font-medium")}>
        {label}
      </span>
      {renderCount(
        cn(
          "w-8 shrink-0 text-right text-2xs tabular-nums text-muted-foreground",
          checked && "text-[var(--filter-accent-count-foreground)]",
        ),
      )}
    </span>
  );
}
