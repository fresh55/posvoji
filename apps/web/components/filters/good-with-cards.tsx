"use client";

import { m, useReducedMotion } from "motion/react";
import {
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
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import { GOOD_WITH_ICONS } from "@/lib/animal-icons";
import type { GoodWithKey } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type GoodWithOption = { key: GoodWithKey; label: string };

type IconGesture = {
  rotate: number | number[];
  scale: number | number[];
  x: number | number[];
  y: number | number[];
};

const GESTURE_REST: IconGesture = { rotate: 0, scale: 1, x: 0, y: 0 };

// Each icon acts out its own answer once, as it is switched on: the child
// bounces, the dog wags, the cat flicks an ear.
const GOOD_WITH_GESTURES: Record<GoodWithKey, IconGesture> = {
  kids: { rotate: 0, scale: [1, 1.06, 1], x: 0, y: [0, -2.5, 0.5, 0] },
  dogs: { rotate: [0, -7, 6, 0], scale: 1, x: 0, y: 0 },
  cats: { rotate: [0, 7, -2, 0], scale: 1, x: [0, 1, 0], y: 0 },
};

const GESTURE_DURATION = 0.35;
const GESTURE_MS = 500;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;

export function GoodWithCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
}: {
  options: GoodWithOption[];
  counts: Map<string, number>;
  selected: GoodWithKey[];
  onToggle: (key: GoodWithKey) => void;
  onToggleMany: (values: GoodWithKey[]) => void;
  layout?: FilterCardLayout;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<GoodWithKey>(GESTURE_MS);
  const { beginReset, resetDelay } = useResetStagger(selected.length);
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover();

  const celebrationIndex = options.findIndex(
    ({ key }) => key === celebration?.value,
  );

  return (
    <FilterCardSection
      label={messages.goodWith}
      hint={messages.goodWithFilterHint}
      active={selected.length > 0}
      onReset={() => {
        clearCelebration();
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetGoodWithFilters}
      layout={layout}
    >
      {options.map(({ key, label }, index) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        const Icon = GOOD_WITH_ICONS[key];
        const hovered = hoveredKey === key;
        const celebrating = celebration?.value === key && checked;
        // The card that did not change leans away from the one that did.
        const reacting = celebrationIndex >= 0 && !celebrating;
        const tiltDirection = Math.sign(index - celebrationIndex) || 1;

        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (checked) {
                clearCelebration();
              } else {
                celebrate(key);
              }
              onToggle(key);
            }}
            disabled={isDeadOption(count, checked)}
            {...hoverHandlers(key)}
            aria-pressed={checked}
            aria-label={`${label}, ${animalCount(count, locale)}`}
            className={filterCardVariants({
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={GESTURE_CHECK_DELAY}
            />

            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={resetDelay(index)}
            >
              {celebrating && !shouldReduceMotion ? (
                <FilterCardRipple
                  key={celebration?.id}
                  layout={layout}
                  opacity={RIPPLE_OPACITY}
                  scale={RIPPLE_SCALE}
                  duration={RIPPLE_DURATION}
                />
              ) : null}
              <FilterCardHoverLift hovered={hovered}>
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={
                    shouldReduceMotion
                      ? GESTURE_REST
                      : celebrating
                        ? GOOD_WITH_GESTURES[key]
                        : reacting
                          ? {
                              rotate: [0, tiltDirection * 2.5, 0],
                              scale: 1,
                              x: 0,
                              y: 0,
                            }
                          : GESTURE_REST
                  }
                  transition={
                    celebrating && !shouldReduceMotion
                      ? { duration: GESTURE_DURATION, ease: "easeOut" }
                      : reacting && !shouldReduceMotion
                        ? { duration: 0.3, delay: 0.1, ease: "easeOut" }
                        : { duration: 0.16 }
                  }
                >
                  <Icon
                    className={cn(
                      "size-5 transition-colors duration-150",
                      checked
                        ? "text-[var(--filter-accent-strong)]"
                        : "text-muted-foreground",
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
                <span className={className}>{count}</span>
              )}
            />
          </button>
        );
      })}
    </FilterCardSection>
  );
}
