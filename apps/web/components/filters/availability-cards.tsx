"use client";

import { m, useReducedMotion } from "motion/react";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
  countClass,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { FACET_ICONS } from "@/lib/animal-icons";
import { groupLabel, type FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The facet's mark, as its chip wears it (lib/animal-icons.ts): the key to
// a new home, turned once in its lock as the row is switched on.
const AvailabilityIcon = FACET_ICONS.availability;
const TURN = { rotate: [0, 70, 0] };
const REST = { rotate: 0 };
const TURN_DURATION = 0.36;
const TURN_MS = 480;
const CHECK_DELAY = 0.24;

// On the phone the one option is a bordered row the height of the Kje row
// above it, 52px, rather than a tile. A tile is sized for three across, and
// alone at full width it was a tall box with its icon floating in the middle
// of it, standing between the top of the sheet and Spol, which an earlier
// pass had folded Kje onto one line to bring above the fold.
const SHEET_ROW_CLASS = `${DEAD_OPTION_CLASS} min-h-13 flex-row items-center justify-start gap-2.5 px-3 py-2 pr-10 text-left`;

/**
 * Posvojitev: one row, "Samo na voljo".
 *
 * The site lists animals that cannot be adopted right now: a quarantine,
 * a mother and her litter, a trial placement. They are sorted last and wear a
 * badge, but they were counted in every option, so "Mladiček 5" on Psi was
 * four Zonzani puppies in quarantine and one litter card. This row takes them
 * out on request, and its count says how many can be adopted before anything
 * is pressed.
 *
 * A section that does not fold, like Kje above it: it holds one control, and
 * folding it would hide the whole of it behind its own heading. It is drawn
 * once the list has someone to leave out (visibleGroups), and then stays
 * until the species tab changes (use-animal-filter-model.ts).
 */
export function AvailabilityCards({
  options,
  counts,
  selected,
  onToggle,
  layout,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  layout: FilterCardLayout;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(TURN_MS);
  const { hoveredValue, handlers: hoverHandlers } = useFilterCardHover<string>();

  return (
    <FilterCardSection
      label={groupLabel("availability", locale)}
      active={selected.length > 0}
      // No Ponastavi: the one row is its own way off, and the link beside a
      // heading that does not fold is a smaller target than the row it would
      // repeat (filter-section-header.tsx).
      layout={layout}
      sheetColumns="grid-cols-1"
    >
      {options.map(({ value, label }) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const celebrating =
          celebration?.value === value && checked && !shouldReduceMotion;

        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              if (checked) clearCelebration();
              else celebrate(value);
              onToggle(value);
            }}
            disabled={isDeadOption(count, checked)}
            {...hoverHandlers(value)}
            aria-pressed={checked}
            aria-label={`${label}, ${animalCount(count, locale)}`}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn(
                "flex",
                layout === "sheet"
                  ? SHEET_ROW_CLASS
                  : filterCardLayoutClass(layout),
              ),
            })}
          >
            <FilterCardMark
              // A row either way, so the tick sits where a row keeps it.
              layout="sidebar"
              checked={checked}
              appearDelay={CHECK_DELAY}
            />
            <FilterCardIconWell layout={layout} checked={checked}>
              {celebrating ? (
                <FilterCardRipple
                  key={celebration?.id}
                  layout={layout}
                  opacity={0.5}
                  scale={1.35}
                  duration={0.35}
                />
              ) : null}
              <FilterCardHoverLift hovered={hoveredValue === value}>
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={celebrating ? TURN : REST}
                  transition={
                    celebrating
                      ? { duration: TURN_DURATION, ease: "easeOut" }
                      : { duration: 0.16 }
                  }
                >
                  <AvailabilityIcon
                    aria-hidden
                    className={cn(
                      "size-5 transition-colors duration-150",
                      checked ? "text-brand-strong" : "text-muted-foreground",
                    )}
                    strokeWidth={1.65}
                  />
                </m.span>
              </FilterCardHoverLift>
            </FilterCardIconWell>
            {layout === "sheet" ? (
              // The row's line in the sheet's own voice: the 14px the Kje row
              // prints its sentence in, and the 12px count every tile has.
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 text-sm leading-tight",
                    checked && "font-medium",
                  )}
                >
                  {label}
                </span>
                <CountRoll
                  value={count}
                  className={cn(countClass(layout, checked), "shrink-0")}
                />
              </span>
            ) : (
              <FilterCardTail
                layout={layout}
                label={label}
                checked={checked}
                renderCount={(className) => (
                  <CountRoll value={count} className={className} />
                )}
              />
            )}
          </button>
        );
      })}
    </FilterCardSection>
  );
}
