"use client";

import { m, useReducedMotion } from "motion/react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  sheetColumnsFor,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import {
  useFilterCardGestures,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { groupLabel, type FilterOption, type WaitingGroup } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The site marks a long wait with an hourglass: the dialog's stay line and
// the shelter picker's longest-waiting line both draw one. This section draws
// the same glass with the sand run through as far as the threshold, so the
// three rows read as one scale the way Velikost's paws do, and a chip here and
// the stay line in the dialog show the same thing.
//
// The glass is lucide's hourglass (lucide-react, ISC license). The sand is
// filled rather than stroked: at 20px an outline of a heap of sand is a
// squiggle, and the amount is the whole of what the three rows say.
const GLASS = [
  "M5 22h14",
  "M5 2h14",
  "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",
  "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
] as const;

// What is left in the top bulb and what has run into the bottom one, inside
// the glass's own walls.
const SAND: Record<WaitingGroup, { top: string; bottom: string }> = {
  "over-6-months": {
    top: "M7.9 4.2h8.2v2.4l-3.5 3.6h-1.2l-3.5-3.6Z",
    bottom: "M7.9 19.6h8.2v1.55H7.9Z",
  },
  "over-1-year": {
    top: "M8.1 7.2h7.8l-3.3 3h-1.2Z",
    bottom: "M8 17.4h8l.1 3.75H7.9Z",
  },
  "over-3-years": {
    top: "M10.6 9.4h2.8l-.8.8h-1.2Z",
    bottom: "M10.4 14.8h3.2l2.5 2.6v3.75H7.9V17.4Z",
  },
};

function sandOf(value: string): { top: string; bottom: string } {
  return Object.hasOwn(SAND, value)
    ? SAND[value as WaitingGroup]
    : SAND["over-3-years"];
}

// The glass draws, then the sand settles into it. Quick: this is a threshold
// being picked, not a gesture with a character of its own.
const DRAW_DURATION = 0.3;
const DRAW_STAGGER = 0.05;
const SAND_DELAY = DRAW_DURATION + 0.05;
const SAND_DURATION = 0.2;
const CHECK_DELAY = SAND_DELAY;
const SAND_REST_OPACITY = 0.45;

/**
 * The glass and its sand, still, for the active-filters row. The chip for a
 * threshold showed a clock, the one place on the site time in the shelter was
 * not an hourglass.
 */
export function WaitingMark({
  value,
  className = "size-3.5",
}: {
  value: string;
  className?: string;
}) {
  const sand = sandOf(value);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GLASS.map((d) => (
        <path key={d} d={d} />
      ))}
      <g fill="currentColor" stroke="none" opacity={0.6}>
        <path d={sand.top} />
        <path d={sand.bottom} />
      </g>
    </svg>
  );
}

// Two layers, the way the other drawn sections do it: a muted glass that is
// always there, and an accent copy that draws itself on when the row is
// picked, the sand last.
function WaitingGlyph({
  value,
  checked,
  resetDelay,
  className,
}: {
  value: string;
  checked: boolean;
  /** Holds the glass back so a reset empties the section in order. */
  resetDelay: number;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const sand = sandOf(value);
  const wait = shouldReduceMotion || checked ? 0 : resetDelay;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="text-muted-foreground">
        <g stroke="currentColor">
          {GLASS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g fill="currentColor" opacity={SAND_REST_OPACITY}>
          <path d={sand.top} />
          <path d={sand.bottom} />
        </g>
      </g>
      <m.g
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : 0.12,
          delay: wait,
          ease: "easeOut",
        }}
      >
        <g stroke="var(--brand-strong)">
          {GLASS.map((d, index) => (
            <m.path
              key={d}
              d={d}
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
                    : // The length drops once the layer has faded, so letting go
                      // never runs the draw backwards.
                      { duration: 0, delay: wait + 0.12 }
              }
            />
          ))}
        </g>
        <m.g
          fill="var(--brand-strong)"
          initial={false}
          animate={{ opacity: checked ? 0.85 : 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : checked
                ? { duration: SAND_DURATION, delay: SAND_DELAY, ease: "easeOut" }
                : { duration: 0.12, delay: wait, ease: "easeOut" }
          }
        >
          <path d={sand.top} />
          <path d={sand.bottom} />
        </m.g>
      </m.g>
    </svg>
  );
}

export function WaitingCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
  collapse,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
}) {
  const { locale } = useI18n();
  const label = groupLabel("waiting", locale);
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures<string>();

  return (
    <FilterCardSection
      label={label}
      hint={
        locale === "sl"
          ? "Po znanem datumu sprejema v zavetišče."
          : "Based on the recorded shelter intake date."
      }
      active={selected.length > 0}
      onReset={() => {
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={(locale === "sl" ? "Ponastavi: " : "Reset: ") + label}
      layout={layout}
      collapse={collapse}
      // One row of three on the phone: the three glasses read as one scale.
      sheetColumns={sheetColumnsFor(options.length)}
    >
      {options.map(({ value, label: option }, index) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const dead = isDeadOption(count, checked);
        const exitDelay = resetDelay(index);

        return (
          <button
            key={value}
            type="button"
            aria-pressed={checked}
            aria-label={option + ", " + animalCount(count, locale)}
            disabled={dead}
            {...gestureHandlers(value)}
            onClick={() => {
              releasePress(value);
              onToggle(value);
            }}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={CHECK_DELAY}
            />
            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={exitDelay}
            >
              <FilterCardHoverLift hovered={hoveredValue === value}>
                <WaitingGlyph
                  value={value}
                  checked={checked}
                  resetDelay={exitDelay}
                  className={cn(
                    "size-5 transition-[opacity,transform] duration-200",
                    // A glass nobody is waiting in has tipped over.
                    dead && "rotate-[10deg] opacity-60",
                  )}
                />
              </FilterCardHoverLift>
            </FilterCardIconWell>
            <FilterCardTail
              layout={layout}
              label={option}
              checked={checked}
              renderCount={(className) => (
                <CountRoll value={count} className={className} />
              )}
            />
          </button>
        );
      })}
    </FilterCardSection>
  );
}
