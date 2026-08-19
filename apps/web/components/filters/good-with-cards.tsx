"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  sectionHintClass,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  useFilterCardHover,
  useOneShotCelebration,
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

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

// Long enough to cover the longest gesture above, so the check and the ripple
// never cut a hop or a blink short.
const GESTURE_MS = 650;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_DURATION = 0.35;
const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;

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

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
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
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<GoodWithKey>(GESTURE_MS);
  const [isResetting, setIsResetting] = useState(false);
  const { hoveredValue: hoveredKey, handlers: hoverHandlers } =
    useFilterCardHover();

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const chosen = orderedSelection(selected);

  const celebrationIndex = options.findIndex(
    ({ key }) => key === celebration?.value,
  );

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
    <section>
      <FilterSectionHeader
        label={messages.goodWith}
        active={selected.length > 0}
        onReset={() => {
          clearCelebration();
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetGoodWithFilters}
        collapse={collapse}
        hint={messages.goodWithFilterHint}
      />
      <CollapsibleBody open={collapse?.open ?? true} id={collapse?.contentId}>
      {/* The sidebar carries the hint in its header, where only a pointer can
          reach it. The sheet and every touch screen keep the sentence here. */}
      <p className={sectionHintClass(collapse)}>{messages.goodWithFilterHint}</p>
      <LazyMotion features={domAnimation}>
        <div
          className={cn(
            "grid gap-1.5",
            layout === "sheet" ? "grid-cols-3" : "grid-cols-1",
          )}
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
                disabled={isDead(count, checked)}
                {...hoverHandlers(key)}
                aria-pressed={checked}
                aria-label={`${label}, ${animalCount(count, locale)}`}
                className={filterCardVariants({
                  selected: checked,
                  className: cn(
                    "flex",
                    layout === "sheet"
                      ? "min-h-[4.75rem] flex-col items-center justify-center gap-0.5 px-1.5 py-2 text-center"
                      : "h-11 flex-row items-center justify-start gap-2.5 px-2.5 py-1.5 pr-9 text-left",
                  ),
                })}
              >
                <FilterSelectionMark
                  checked={checked}
                  appearDelay={GESTURE_CHECK_DELAY}
                  className={cn(
                    layout === "sheet"
                      ? "absolute right-1.5 top-1.5"
                      : "absolute right-2.5 top-1/2 -translate-y-1/2",
                  )}
                />

                <span
                  aria-hidden
                  className={cn(
                    "relative grid shrink-0 place-items-center",
                    layout === "sheet" ? "size-7" : "size-7.5",
                  )}
                >
                  <m.span
                    className={cn(
                      "absolute rounded-full bg-muted-foreground/10",
                      layout === "sheet" ? "size-7" : "size-7.5",
                    )}
                    initial={false}
                    animate={{
                      opacity: checked ? 1 : 0,
                      scale: checked ? 1 : 0.6,
                    }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : checked
                          ? { type: "spring", stiffness: 380, damping: 26 }
                          : {
                              duration: 0.15,
                              // A reset winks the rows out in order rather than
                              // all at once.
                              delay: isResetting ? index * RESET_STAGGER : 0,
                              ease: "easeOut",
                            }
                    }
                  />
                  {celebrating && !shouldReduceMotion ? (
                    <m.span
                      key={celebration?.id}
                      className={cn(
                        "pointer-events-none absolute rounded-full border border-[var(--filter-accent-strong)]",
                        layout === "sheet" ? "size-7" : "size-7.5",
                      )}
                      initial={{ opacity: 0.5, scale: 0.7 }}
                      animate={{ opacity: 0, scale: 1.35 }}
                      transition={{
                        duration: RIPPLE_DURATION,
                        ease: "easeOut",
                      }}
                    />
                  ) : null}
                  <m.span
                    className="relative flex items-center justify-center will-change-transform"
                    initial={false}
                    animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
                    transition={
                      shouldReduceMotion ? { duration: 0 } : HOVER_SPRING
                    }
                  >
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
                  </m.span>
                </span>

                {layout === "sheet" ? (
                  <>
                    <span
                      className={cn(
                        "mt-0.5 max-w-full truncate text-xs",
                        checked && "font-medium",
                      )}
                    >
                      {label}
                    </span>
                    <CountRoll
                      value={count}
                      className="text-[11px] tabular-nums text-muted-foreground"
                    />
                  </>
                ) : (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span
                      className={cn("truncate text-xs", checked && "font-medium")}
                    >
                      {label}
                    </span>
                    <CountRoll
                      value={count}
                      className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground"
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </LazyMotion>

      {/* The one place the section says its choices hold at once, and the one
          the screen reader hears. Nothing selected says nothing. */}
      <p
        aria-live="polite"
        className="mt-2 text-[11px] leading-snug text-muted-foreground empty:mt-0"
      >
        {outcome}
      </p>
      </CollapsibleBody>
    </section>
  );
}

// Commas and the joining word are the sentence's own punctuation; the words
// being joined all come from the message catalogue.
function joinPhrases(phrases: string[], joiner: string): string {
  if (phrases.length < 2) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} ${joiner} ${phrases[phrases.length - 1]}`;
}
