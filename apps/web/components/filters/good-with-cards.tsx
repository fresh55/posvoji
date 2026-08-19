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
  SectionHint,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import {
  useFilterCardHover,
  useOneShotCelebration,
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

const HOVER_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const GESTURE_DURATION = 0.35;
const GESTURE_MS = 500;
// The check confirms as the icon gesture lands, not before it starts.
const GESTURE_CHECK_DELAY = 0.2;
const RIPPLE_DURATION = 0.35;
const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

export function GoodWithCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
  collapse,
}: {
  options: GoodWithOption[];
  counts: Map<string, number>;
  selected: GoodWithKey[];
  onToggle: (key: GoodWithKey) => void;
  onToggleMany: (values: GoodWithKey[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages } = useI18n();
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

  const celebrationIndex = options.findIndex(
    ({ key }) => key === celebration?.value,
  );

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
      <CollapsibleBody collapse={collapse}>
      <SectionHint collapse={collapse}>{messages.goodWithFilterHint}</SectionHint>
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
      </CollapsibleBody>
    </section>
  );
}
