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

/**
 * One shadcn-style surface contract for every compact filter choice. Geometry
 * stays with the caller; interaction, state and accessibility chrome do not.
 *
 * The surface is a variant rather than a class the caller appends, because cva
 * concatenates and does not merge. While the sidebar's treatment was a string
 * bolted on after the fact, the base's shadow-xs and the row's shadow-none
 * both stayed in the class list and the stylesheet decided between them:
 * Tailwind emits shadow-none before shadow-xs, so every sidebar row kept the
 * tile's resting box, and by the same alphabetical accident bg-transparent
 * outranked bg-brand, so a picked row lost its green fill. Sex and age kept
 * their fill only because ToggleGroupItem runs its className through cn(),
 * where toggleVariants' own accent outlived the merge.
 *
 * What makes the output safe is cn(). Every string this file builds runs
 * through it, so a collision between two of its own classes is settled by
 * position, the later one winning, rather than by the order Tailwind emits the
 * two utilities in, and cva lays the layout variant down before the compound
 * that answers it. A class spelled against an attribute sits outside that
 * arithmetic: tailwind-merge reads data-[state=on]:bg-brand and bg-brand as two
 * different keys, so anything an attribute selector sets has to be answered in
 * the same selector.
 *
 * The data-[state=...] and aria-pressed: repeats are not duplicates of the
 * plain classes beside them. ToggleGroupItem hands cn its own
 * data-[state=on]:bg-muted and toggleVariants its accent spelled against both
 * selectors, all ahead of this string; an attribute selector outranks a bare
 * utility, so the ones a row must not wear are overridden here by name. Both
 * spellings are needed: sex is a toggle group item and carries data-state,
 * while age wraps its items in a tooltip trigger whose own data-state="closed"
 * takes the attribute over, leaving aria-pressed as the only thing that says
 * the row is chosen. Plain buttons carry aria-pressed and nothing else.
 */
const cardVariants = cva(
  "group relative min-w-0 overflow-hidden rounded-ui border font-normal outline-none transition-[border-color,background-color,box-shadow,color,transform] duration-150 active:scale-[0.98] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      layout: {
        sheet:
          "border-border/80 bg-background shadow-xs hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground active:bg-muted/40",
        // Border transparent rather than none, so the row keeps its 1px and
        // the text does not shift when a picked row draws its fill or a
        // focused one its ring. bg-transparent is the ground at rest, and the
        // selected compound below is what answers it.
        //
        // The aria-pressed and data-[state=on] repeats say the same thing as
        // the plain border-transparent and shadow-none beside them, in the two
        // selectors toggleVariants spells its own border and shadow in. They
        // belong to the layout and not to the state: a row has no box whether
        // it is picked or not.
        sidebar:
          "border-transparent bg-transparent shadow-none hover:border-transparent hover:bg-muted/40 hover:text-foreground active:bg-muted/40 aria-pressed:border-transparent aria-pressed:shadow-none data-[state=on]:border-transparent data-[state=on]:shadow-none",
      },
      // Colour only. What the card is standing on is the layout's business.
      selected: {
        true: "text-brand-foreground",
        false: "text-muted-foreground",
      },
    },
    // The fill a picked card wears, which is the one thing the two layouts
    // paint differently and the only thing selection decides. A resting card
    // needs no compound of its own: nothing upstream is spelled against
    // data-[state=off], so the layout's own ground stands unopposed.
    compoundVariants: [
      {
        layout: "sheet",
        selected: true,
        class:
          "border-brand-border bg-brand hover:border-brand-border hover:bg-brand data-[state=on]:bg-brand",
      },
      {
        layout: "sidebar",
        selected: true,
        class:
          "bg-brand hover:bg-brand aria-pressed:bg-brand data-[state=on]:bg-brand",
      },
    ],
    defaultVariants: {
      layout: "sheet",
      selected: false,
    },
  },
);

/**
 * The tile is the default, so a caller outside the filters that wants the
 * plain card surface (the portal's choice cards) keeps its existing call.
 */
export function filterCardVariants(
  props?: Parameters<typeof cardVariants>[0],
): string {
  return cn(cardVariants(props));
}

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
export function isDeadOption(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

/**
 * Why the sidebar draws rows.
 *
 * The sheet draws tiles and the sidebar draws rows, and both wore the same
 * border, shadow and ground. In a column that already holds the map plate,
 * three or four more bordered boxes per section made the panel read as a
 * form: on the home page at 1440 the first screen was seventy-odd outlined
 * rectangles. A row is a line in a list. It keeps the icon, the drawn check
 * and the count, and it keeps the hover ground and the green fill when
 * picked, because those are states rather than furniture; only the box at
 * rest goes. The surface half of that lives in the layout variant above.
 *
 * Sex and size were the last two sections holding out as tiles, which left
 * the column saying "press me" in three different surfaces beside a grid of
 * borderless cards. They are rows here now and tiles in the sheet, like
 * everything else. What is left in the sidebar is rows and the map plate, and
 * the plate stays because it frames a picture.
 *
 * The row is 40px, not the 44px a finger needs. The sidebar is lg-only and
 * mouse-driven, the sheet is what a phone gets, and the panel had more to
 * show than it could: at 1440x900 its content ran 972px in an 876px box, so
 * two whole sections sat below its own fold.
 */
export function filterCardLayoutClass(layout: FilterCardLayout): string {
  return layout === "sheet"
    ? "min-h-[4.75rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center"
    : "h-10 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left";
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
            ? // The ink is a token and not text-white, because this is the one
              // place the strong accent is a ground and that ground is light in
              // dark mode: a white tick on it measured 2.39:1. See
              // --brand-strong-foreground in globals.css.
              "border-brand-strong bg-brand-strong text-brand-strong-foreground"
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

/**
 * The sheetColumns a section with this many answers asks for.
 *
 * The columns exist to fit several short labels side by side, so a section the
 * dataset answers only one facet of is a full-width tile rather than a third of
 * a row nothing is in. max is the section's own ceiling: three is for short
 * labels, and health and the household questions keep two because
 * "Sterilizacija" clips badly in a third of a 320px sheet.
 *
 * The class names are written out rather than built, because Tailwind reads
 * this file as text and generates only what it can see.
 */
export function sheetColumnsFor(count: number, max: 2 | 3 = 3): string {
  if (max === 3 && count > 2) return "grid-cols-3";
  return count > 1 ? "grid-cols-2" : "grid-cols-1";
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
        "pointer-events-none absolute rounded-full border border-brand-strong",
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

/**
 * The voice a sidebar row sets its label and its count in.
 *
 * Exported because the age rows cannot use FilterCardTail: that tail is a flex
 * line and the age row is a three-column grid, so it draws its own label and
 * count and borrows the sizes from here. Hand-copied they drifted, and Starost
 * printed 11px over 10px while every other section printed 12 over 11.
 */
export const SIDEBAR_LABEL_CLASS = "truncate text-xs";
export const SIDEBAR_COUNT_CLASS =
  "w-8 text-right text-2xs tabular-nums text-muted-foreground";

// Only a flex item can be squeezed by a long label, so shrink-0 rides with the
// line below rather than with the voice the age grid shares.
const SIDEBAR_COUNT_FLEX_CLASS = cn(SIDEBAR_COUNT_CLASS, "shrink-0");

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
        {renderCount("text-2xs tabular-nums text-muted-foreground")}
      </>
    );
  }

  return (
    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
      <span className={cn(SIDEBAR_LABEL_CLASS, checked && "font-medium")}>
        {label}
      </span>
      {renderCount(SIDEBAR_COUNT_FLEX_CLASS)}
    </span>
  );
}
