"use client";

import { m, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
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
import { GOOD_WITH_KEYS, type GoodWithKey } from "@/lib/filters";
import type { TranslationKey } from "@/lib/i18n";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type GoodWithOption = { key: GoodWithKey; label: string };

// Keyframe arrays within one gesture all share a length, so a single `times`
// on the transition lines them up.
type IconGesture = {
  transformOrigin: string;
  duration: number;
  times?: number[];
  keyframes: {
    rotate?: number[];
    scaleX?: number[];
    scaleY?: number[];
    x?: number[];
    y?: number[];
  };
};

const GESTURE_REST = {
  rotate: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  x: 0,
  y: 0,
};

// Each icon acts out its own answer once, as it is switched on. The transform
// origin is what separates them: the child pushes off the ground, the dog wags
// from the base of its tail, the cat sits and blinks.
const GOOD_WITH_GESTURES: Record<GoodWithKey, IconGesture> = {
  kids: {
    transformOrigin: "50% 100%",
    duration: 0.5,
    times: [0, 0.18, 0.45, 0.72, 1],
    keyframes: {
      scaleX: [1, 1.12, 0.94, 1.1, 1],
      scaleY: [1, 0.88, 1.08, 0.9, 1],
      y: [0, 0, -7, 0, 0],
    },
  },
  dogs: {
    transformOrigin: "70% 85%",
    duration: 0.55,
    keyframes: { rotate: [0, -9, 8, -7, 5, -2, 0] },
  },
  cats: {
    transformOrigin: "50% 90%",
    duration: 0.6,
    // The blink is the scaleY dip, and it lands after the ears have settled.
    times: [0, 0.12, 0.24, 0.38, 0.62, 0.74, 1],
    keyframes: {
      rotate: [0, -8, 4, -1, 0, 0, 0],
      scaleY: [1, 1.07, 1.04, 1, 0.82, 1, 1],
    },
  },
};

// Long enough to cover the longest gesture above, so the check and the ripple
// never cut a hop or a blink short.
const GESTURE_MS = 650;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_OPACITY = 0.5;
const RIPPLE_SCALE = 1.35;
const RIPPLE_DURATION = 0.35;
const COUNT_ROLL_DURATION = 0.28;

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

// A changed number slides in rather than swapping in place, so the narrowing
// is something you watch happen. Never on first paint: nothing narrowed there.
function CountRoll({ value, className }: { value: number; className?: string }) {
  const shouldReduceMotion = useReducedMotion();
  const hasPainted = useRef(false);

  useEffect(() => {
    hasPainted.current = true;
  }, []);

  if (shouldReduceMotion) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={cn("relative inline-block", className)}>
      <m.span
        key={value}
        className="block"
        initial={hasPainted.current ? { y: -6, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: COUNT_ROLL_DURATION, ease: "easeOut" }}
      >
        {value}
      </m.span>
    </span>
  );
}

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
}) {
  const { locale, messages, t } = useI18n();
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
      // The one place the section says its choices hold at once, and the one
      // the screen reader hears. Nothing selected says nothing.
      footer={
        <p
          aria-live="polite"
          className="mt-2 text-[11px] leading-snug text-muted-foreground empty:mt-0"
        >
          {outcome}
        </p>
      }
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
        const gesture = GOOD_WITH_GESTURES[key];

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
                  style={{
                    transformOrigin:
                      celebrating && !shouldReduceMotion
                        ? gesture.transformOrigin
                        : "50% 50%",
                  }}
                  initial={false}
                  animate={
                    shouldReduceMotion
                      ? GESTURE_REST
                      : celebrating
                        ? gesture.keyframes
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
                      ? {
                          duration: gesture.duration,
                          times: gesture.times,
                          ease: "easeOut",
                        }
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
