"use client";

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
  sheetColumnsFor,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import {
  GoodWithGlyph,
  LONGEST_GOOD_WITH_GESTURE_MS,
} from "@/components/filters/good-with-glyphs";
import {
  resetDelayStyle,
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { GOOD_WITH_KEYS, type GoodWithKey } from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type GoodWithOption = { key: GoodWithKey; label: string };

const GESTURE_REST = { rotate: 0, scale: 1, x: 0, y: 0 };

// The hold comes from the glyphs themselves, so the check and the ripple
// never cut a laugh or a blink short when the choreography changes.
const GESTURE_MS = LONGEST_GOOD_WITH_GESTURE_MS;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;

const LEAD_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithLeadKids",
  dogs: "goodWithLeadDogs",
  cats: "goodWithLeadCats",
};

const TAIL_KEYS: Record<GoodWithKey, TranslationKey> = {
  kids: "goodWithTailKids",
  dogs: "goodWithTailDogs",
  cats: "goodWithTailCats",
};

/** Fixed facet order, so the sentence does not reshuffle as you pick. */
function orderedSelection(selected: GoodWithKey[]): GoodWithKey[] {
  return GOOD_WITH_KEYS.filter((key) => selected.includes(key));
}

export function GoodWithCards({
  options,
  counts,
  selected,
  resultCount,
  total,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  options: GoodWithOption[];
  counts: Map<string, number>;
  selected: GoodWithKey[];
  /** Animals the current filters leave, and the pool they were taken from. */
  resultCount: number;
  total: number;
  onToggle: (key: GoodWithKey) => void;
  onToggleMany: (values: GoodWithKey[]) => void;
  layout?: FilterCardLayout;
  collapse?: SectionCollapse;
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<GoodWithKey>(GESTURE_MS);
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover<GoodWithKey>();

  const celebrationIndex = options.findIndex(
    ({ key }) => key === celebration?.value,
  );

  const chosen = orderedSelection(selected);

  const outcome =
    chosen.length === 0
      ? null
      : t("goodWithOutcome", {
          list: joinPhrases(
            chosen.map((key, index) =>
              index === 0 ? t(LEAD_KEYS[key]) : t(TAIL_KEYS[key]),
            ),
            messages.goodWithJoiner,
          ),
          count: resultCount,
          total,
        });

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
      collapse={collapse}
      // As many columns as there are answers. The three columns are for the
      // three facets this section can hold, and a dataset that answers only
      // two of them (today: psi and mačke) left a third of the row empty.
      sheetColumns={sheetColumnsFor(options.length)}
      // The one place the section says its choices hold at once, and the one
      // the screen reader hears. Nothing selected says nothing.
      footer={
        <p
          aria-live="polite"
          className="mt-2 text-2xs leading-snug text-muted-foreground empty:mt-0"
        >
          {outcome}
        </p>
      }
    >
      {options.map(({ key, label }, index) => {
        const count = counts.get(key) ?? 0;
        const checked = selected.includes(key);
        const hovered = hoveredKey === key;
        const celebrating = celebration?.value === key && checked;
        // The card that did not change leans away from the one that did.
        const reacting = celebrationIndex >= 0 && !celebrating;
        const tiltDirection = Math.sign(index - celebrationIndex) || 1;
        const exitDelay = resetDelay(index);

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
              layout,
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
              exitDelay={exitDelay}
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
                {/* The gesture now lives inside the glyph, one part at a
                    time. What is left out here is the neighbour's lean, which
                    is the whole icon leaning away and nothing else. */}
                <m.span
                  // The colour rides the wrapper rather than the glyph. It is
                  // a class here and not a motion target, so the only place to
                  // put the reset's turn is a transition-delay, and the glyph
                  // itself takes no style prop. The strokes are currentColor,
                  // so they inherit the value as it transitions.
                  className={cn(
                    "flex items-center justify-center transition-colors duration-150",
                    checked ? "text-brand-strong" : "text-muted-foreground",
                  )}
                  style={resetDelayStyle(checked, exitDelay)}
                  initial={false}
                  animate={
                    reacting && !shouldReduceMotion
                      ? { rotate: [0, tiltDirection * 2.5, 0], scale: 1, y: 0 }
                      : GESTURE_REST
                  }
                  transition={
                    reacting && !shouldReduceMotion
                      ? { duration: 0.3, delay: 0.1, ease: "easeOut" }
                      : { duration: 0.16 }
                  }
                >
                  <GoodWithGlyph
                    // Remounting is what restarts the gesture: motion holds a
                    // keyframe run to its own timeline, so swapping the target
                    // on a live element does not replay it.
                    key={celebrating ? celebration?.id : "rest"}
                    facet={key}
                    gesture={celebrating ? "celebrate" : "rest"}
                    shouldReduceMotion={shouldReduceMotion ?? false}
                    className="size-5"
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

// Commas and the joining word are the sentence's own punctuation; the words
// being joined all come from the message catalogue.
function joinPhrases(phrases: string[], joiner: string): string {
  if (phrases.length < 2) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${joiner} ${phrases[phrases.length - 1]}`;
}
