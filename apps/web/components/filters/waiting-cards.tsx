"use client";

import { m, useReducedMotion } from "motion/react";
import { DrawnGlyph, type DrawTempo } from "@/components/filters/drawn-glyph";
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
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  useFilterCardGestures,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  groupLabel,
  type FilterOption,
  type Unanswered,
  type WaitingGroup,
} from "@/lib/filters";
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
const GLASS: readonly string[] = [
  "M5 22h14",
  "M5 2h14",
  "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",
  "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
];

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

// A folded run of thresholds in the chips row shows the longest wait.
function sandOf(value = "over-3-years"): { top: string; bottom: string } {
  return Object.hasOwn(SAND, value)
    ? SAND[value as WaitingGroup]
    : SAND["over-3-years"];
}

// The glass draws, then the sand settles into it. Quick: this is a threshold
// being picked, not a gesture with a character of its own.
const TEMPO: DrawTempo = { draw: 0.3, stagger: 0.05, fade: 0.12 };
const SAND_DELAY = TEMPO.draw + 0.05;
const SAND_DURATION = 0.2;
const CHECK_DELAY = SAND_DELAY;
const SAND_REST_OPACITY = 0.45;
const SAND_LIT_OPACITY = 0.85;

/**
 * The glass and its sand, still, for the active-filters row. The chip for a
 * threshold showed a clock, the one place on the site time in the shelter was
 * not an hourglass.
 */
export function WaitingMark({
  value,
  className = "size-3.5",
}: {
  value?: string;
  className?: string;
}) {
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
        <Sand value={value} />
      </g>
    </svg>
  );
}

function Sand({ value }: { value?: string }) {
  const sand = sandOf(value);
  return (
    <>
      <path d={sand.top} />
      <path d={sand.bottom} />
    </>
  );
}

// The drawn glass of the other sections, with the sand muted under the
// outline and lit last in the accent.
function WaitingGlyph({
  value,
  checked,
  resetDelay,
  className,
}: {
  value: string;
  checked: boolean;
  resetDelay: number;
  className: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <DrawnGlyph
      strokes={GLASS}
      checked={checked}
      resetDelay={resetDelay}
      tempo={TEMPO}
      className={className}
      rest={
        <g fill="currentColor" opacity={SAND_REST_OPACITY}>
          <Sand value={value} />
        </g>
      }
      lit={(wait) => (
        <m.g
          fill="var(--brand-strong)"
          initial={false}
          animate={{ opacity: checked ? SAND_LIT_OPACITY : 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : checked
                ? { duration: SAND_DURATION, delay: SAND_DELAY, ease: "easeOut" }
                : { duration: TEMPO.fade, delay: wait, ease: "easeOut" }
          }
        >
          <Sand value={value} />
        </m.g>
      )}
    />
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
  unanswered,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
  unanswered?: Unanswered;
}) {
  const { locale, messages } = useI18n();
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
      hint={messages.waitingFilterHint}
      active={selected.length > 0}
      onReset={() => {
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetWaitingFilters}
      layout={layout}
      collapse={collapse}
      // One row of three on the phone: the three glasses read as one scale.
      sheetColumns={sheetColumnsFor(options.length)}
      footer={<UnansweredNote tally={unanswered} />}
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
              // One threshold at a time (SINGLE_CHOICE_GROUPS), so the round
              // mark: a tick box that unticks itself when its neighbour is
              // pressed is a box doing what no other box in the panel does.
              shape="dot"
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
