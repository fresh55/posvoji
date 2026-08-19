"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AgeGrowthControl } from "@/components/filters/age-growth-control";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { FilterSectionHeader } from "@/components/filters/filter-section-header";
import {
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import { SexCards } from "@/components/filters/sex-cards";
import { SizePawCards } from "@/components/filters/size-paw-cards";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import {
  groupLabel,
  type FilterOption,
  type Filters,
  type MultiGroup,
  type ToggleDef,
  type ToggleKey,
} from "@/lib/filters";
import { useI18n } from "@/components/i18n-provider";
import { HEALTH_ICONS } from "@/lib/animal-icons";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type IconGesture = {
  rotate: number | number[];
  scale: number | number[];
  x: number | number[];
  y: number | number[];
};

const GESTURE_REST: IconGesture = { rotate: 0, scale: 1, x: 0, y: 0 };

// Each icon acts out the thing it stands for, once, as it is switched on.
const HEALTH_GESTURES: Record<ToggleKey, IconGesture> = {
  sterilizacija: { rotate: [0, -8, 5, 0], scale: 1, x: 0, y: 0 },
  // The lucide syringe carries its needle at the bottom left and its plunger at
  // the top right, so the press runs down that diagonal.
  cepljenje: { rotate: 0, scale: 1, x: [0, -1.2, 0], y: [0, 1.2, 0] },
  cip: { rotate: 0, scale: [1, 1.12, 1], x: 0, y: 0 },
  "brez-fiv": { rotate: 0, scale: [1, 1.1, 1], x: 0, y: 0 },
  "brez-felv": { rotate: [0, -6, 4, 0], scale: 1, x: 0, y: 0 },
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

type GroupProps = {
  group: CardGroup;
  ageLayout: "sidebar" | "sheet";
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
};

export type CardGroup = Exclude<MultiGroup, "shelter">;

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

function HealthToggleCards({
  toggles,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
}: {
  toggles: ToggleDef[];
  counts: Map<string, number>;
  selected: ToggleKey[];
  onToggle: (key: ToggleKey) => void;
  onToggleMany: (values: ToggleKey[]) => void;
  layout?: "sidebar" | "sheet";
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<ToggleKey>(GESTURE_MS);
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

  return (
    <section>
      <FilterSectionHeader
        label={messages.health}
        active={selected.length > 0}
        onReset={() => {
          clearCelebration();
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetHealthFilters}
      />
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
        {messages.healthFilterHint}
      </p>
      <LazyMotion features={domAnimation}>
        <div
          className={cn(
            "grid gap-1.5",
            layout === "sheet" ? "grid-cols-3" : "grid-cols-1",
          )}
        >
          {toggles.map(({ key, label }, index) => {
            const count = counts.get(key) ?? 0;
            const checked = selected.includes(key);
            const Icon = HEALTH_ICONS[key];
            const hovered = hoveredKey === key;
            const celebrating = celebration?.value === key && checked;

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
                        celebrating && !shouldReduceMotion
                          ? HEALTH_GESTURES[key]
                          : GESTURE_REST
                      }
                      transition={
                        celebrating && !shouldReduceMotion
                          ? { duration: GESTURE_DURATION, ease: "easeOut" }
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
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </>
                ) : (
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <span
                      className={cn("truncate text-xs", checked && "font-medium")}
                    >
                      {label}
                    </span>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </LazyMotion>
    </section>
  );
}

function SizeGroup({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
}: Omit<GroupProps, "group" | "ageLayout">) {
  const { locale, messages } = useI18n();
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  return (
    <section>
      <FilterSectionHeader
        label={groupLabel("size", locale)}
        active={selected.length > 0}
        onReset={() => {
          setIsResetting(true);
          onToggleMany(selected);
        }}
        resetAriaLabel={messages.resetSizeFilters}
      />
      <SizePawCards
        options={options}
        counts={counts}
        selected={selected}
        onToggle={onToggle}
        isResetting={isResetting}
      />
    </section>
  );
}

function FilterGroup({ group, ...rest }: GroupProps) {
  const { locale, messages } = useI18n();

  if (group === "age") {
    return (
      <AgeGrowthControl
        options={rest.options}
        counts={rest.counts}
        selected={rest.selected}
        onToggle={rest.onToggle}
        onToggleMany={rest.onToggleMany}
        layout={rest.ageLayout}
      />
    );
  }

  if (group === "sex") {
    return (
      <section>
        <FilterSectionHeader
          label={groupLabel(group, locale)}
          active={rest.selected.length > 0}
          onReset={() => rest.onToggleMany(rest.selected)}
          resetAriaLabel={messages.resetSexFilters}
        />
        <SexCards
          options={rest.options}
          counts={rest.counts}
          selected={rest.selected}
          onToggle={rest.onToggle}
        />
      </section>
    );
  }

  return (
    <SizeGroup
      options={rest.options}
      counts={rest.counts}
      selected={rest.selected}
      onToggle={rest.onToggle}
      onToggleMany={rest.onToggleMany}
    />
  );
}

// The desktop sidebar and the mobile sheet frame these differently but show the
// same controls, so the list lives here and each frame supplies only its chrome.
export function FilterGroupList({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  ageLayout = "sidebar",
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  ageLayout?: "sidebar" | "sheet";
} & FilterActionContract) {
  return (
    <>
      {groups.map(({ group, options }) => (
        <FilterGroup
          key={group}
          group={group}
          ageLayout={ageLayout}
          options={options}
          counts={counts[group]}
          selected={filters[group]}
          onToggle={(value) => onToggle(group, value)}
          onToggleMany={(values) => onToggleMany(group, values)}
        />
      ))}

      {toggles.length > 0 && (
        <HealthToggleCards
          toggles={toggles}
          counts={toggleTally}
          selected={filters.toggles}
          onToggle={onToggleProperty}
          onToggleMany={onToggleManyProperties}
          layout={ageLayout}
        />
      )}
    </>
  );
}
