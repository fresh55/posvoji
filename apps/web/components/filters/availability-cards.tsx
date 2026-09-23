"use client";

import { DoorOpen } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardRipple,
  FilterCardSection,
  FilterCardTail,
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
import { groupLabel, type FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The door swings on its hinge once as the row is switched on: the way home
// is open for these animals now.
const SWING = { rotateY: [0, -38, 0], x: [0, -0.6, 0] };
const REST = { rotateY: 0, x: 0 };
const SWING_DURATION = 0.42;
const SWING_MS = 560;
const CHECK_DELAY = 0.24;

/**
 * Posvojitev: one row, "Samo na voljo".
 *
 * The site lists animals that cannot be adopted right now: a quarantine,
 * a mother still nursing, a trial placement. They are sorted last and wear a
 * badge, but they were counted in every option, so "Mladiček 5" on Psi was
 * four Zonzani puppies in quarantine and one litter card. This row takes them
 * out on request, and its count says how many can be adopted before anything
 * is pressed.
 *
 * A section that does not fold, like Kje above it: it holds one control, and
 * folding it would hide the whole of it behind its own heading. It is drawn
 * only while the list has someone to leave out (visibleGroups).
 */
export function AvailabilityCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout: FilterCardLayout;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(SWING_MS);
  const { hoveredValue, handlers: hoverHandlers } = useFilterCardHover<string>();

  return (
    <FilterCardSection
      label={groupLabel("availability", locale)}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetAvailabilityFilters}
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
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
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
                  // Depth for the swing. Motion writes it into the same
                  // transform as the turn, so no wrapper has to carry it.
                  style={{ transformPerspective: 60 }}
                  initial={false}
                  animate={celebrating ? SWING : REST}
                  transition={
                    celebrating
                      ? { duration: SWING_DURATION, ease: "easeOut" }
                      : { duration: 0.16 }
                  }
                >
                  <DoorOpen
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
            <FilterCardTail
              layout={layout}
              label={label}
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
