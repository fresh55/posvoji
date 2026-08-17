"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import {
  AgeStageIcon,
  type AgeStage,
} from "@/components/filters/age-stage-icon";
import {
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import { FilterSectionHeader } from "@/components/filters/filter-section-header";
import { useI18n } from "@/components/i18n-provider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FilterOption } from "@/lib/filters";
import { groupLabel } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Stage = {
  colorClassName: string;
  groveClassName: string;
  rowClassName: string;
  rangeKey: "ageRangeYoung" | "ageRangeAdult" | "ageRangeSenior";
};

const STAGES: Record<AgeStage, Stage> = {
  mladicek: {
    colorClassName: "text-[#2f7d50]",
    groveClassName: "size-7",
    rowClassName: "size-5",
    rangeKey: "ageRangeYoung",
  },
  odrasel: {
    colorClassName: "text-[#92763b]",
    groveClassName: "size-9",
    rowClassName: "size-5.5",
    rangeKey: "ageRangeAdult",
  },
  senior: {
    colorClassName: "text-[#92763b]",
    groveClassName: "size-11",
    rowClassName: "size-6",
    rangeKey: "ageRangeSenior",
  },
};

const STANDARD_EASE = [0.16, 1, 0.3, 1] as const;

function isAgeStage(value: string): value is AgeStage {
  return value in STAGES;
}

export function isAgeStageActive(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value);
}

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

export function AgeGrowthControl({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout = "sidebar",
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout?: "sidebar" | "sheet";
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const [celebratingAge, setCelebratingAge] = useState<string | null>(null);

  return (
    <LazyMotion features={domAnimation}>
      <section>
        <FilterSectionHeader
          label={groupLabel("age", locale)}
          active={selected.length > 0}
          onReset={() => {
            setCelebratingAge(null);
            onToggleMany(selected);
          }}
          resetAriaLabel={messages.resetAgeFilters}
        />

        <p id={hintId} className="sr-only">
          {messages.ageFilterHint}
        </p>

        <div
          aria-hidden="true"
          data-age-view="grove"
          className={cn(
            "relative mb-2 grid grid-cols-3 items-end px-1",
            layout === "sheet" ? "h-12" : "h-14",
          )}
        >
          <span className="absolute inset-x-3 bottom-1 h-px bg-border" />
          {options.map(({ value }) => {
            if (!isAgeStage(value)) return null;

            const stage = STAGES[value];
            const active = isAgeStageActive(selected, value);
            const celebrating = celebratingAge === value && active;

            return (
              <span
                key={value}
                data-age-stage={value}
                data-stage-active={active ? "true" : "false"}
                className="relative flex h-full items-end justify-center pb-1"
              >
                <m.span
                  className="absolute inset-x-2 bottom-1 h-px origin-center bg-[#2f6f4e]/55"
                  initial={false}
                  animate={{
                    opacity: active ? 1 : 0.12,
                    scaleX: active ? 1 : 0.25,
                  }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.18, ease: STANDARD_EASE }
                  }
                />
                <m.span
                  className="flex origin-bottom items-end justify-center"
                  initial={false}
                  animate={
                    active
                      ? { opacity: 1, scale: 1, y: 0 }
                      : { opacity: 0.5, scale: 0.84, y: 2 }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.24, ease: STANDARD_EASE }
                  }
                >
                  <AgeStageIcon
                    stage={value}
                    draw={celebrating}
                    reduceMotion={shouldReduceMotion}
                    className={cn(stage.colorClassName, stage.groveClassName)}
                  />
                </m.span>
              </span>
            );
          })}
        </div>

        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
          <ToggleGroup
            type="multiple"
            value={selected}
            onValueChange={(nextSelected) => {
              const changed = changedValue(selected, nextSelected);
              if (!changed) return;

              if (nextSelected.length === options.length) {
                setCelebratingAge(null);
              } else {
                setCelebratingAge(
                  nextSelected.includes(changed) ? changed : null,
                );
              }
              onToggle(changed);
            }}
            aria-label={groupLabel("age", locale)}
            aria-describedby={hintId}
            orientation={layout === "sheet" ? "horizontal" : "vertical"}
            spacing={layout === "sheet" ? 1.5 : 1}
            className="w-full items-stretch"
          >
            {options.map(({ value, label }) => {
              if (!isAgeStage(value)) return null;

              const stage = STAGES[value];
              const count = counts.get(value) ?? 0;
              const checked = selected.includes(value);
              const celebrating = celebratingAge === value && checked;

              return (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={value}
                      disabled={count === 0 && !checked}
                      aria-label={`${label}, ${messages[stage.rangeKey]}, ${animalCount(count, locale)}`}
                      className={filterCardVariants({
                        selected: checked,
                        className:
                          layout === "sheet"
                            ? "flex h-[4.75rem] flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 text-center"
                            : "grid h-11 w-full shrink grid-cols-[1.25rem_1.5rem_minmax(0,1fr)_2rem] items-center gap-2 px-2.5 text-left",
                      })}
                    >
                      <FilterSelectionMark
                        checked={checked}
                        className={cn(
                          layout === "sheet" && "absolute right-1.5 top-1.5",
                        )}
                      />
                      <m.span
                        className="origin-bottom"
                        initial={false}
                        animate={
                          celebrating && !shouldReduceMotion
                            ? {
                                scale: [0.96, 1.05, 1],
                                y: [0, -0.5, 0],
                              }
                            : { scale: 1, y: 0 }
                        }
                        transition={
                          shouldReduceMotion
                            ? { duration: 0 }
                            : { duration: 0.19, ease: STANDARD_EASE }
                        }
                        onAnimationComplete={() => {
                          if (!celebrating) return;
                          setCelebratingAge((current) =>
                            current === value ? null : current,
                          );
                        }}
                      >
                        <AgeStageIcon
                          stage={value}
                          reduceMotion={shouldReduceMotion}
                          className={cn(
                            stage.colorClassName,
                            stage.rowClassName,
                          )}
                        />
                      </m.span>
                      <span
                        className={cn(
                          "min-w-0 truncate text-xs",
                          layout === "sheet" &&
                            "max-w-full text-[11px] leading-tight",
                          checked && "font-medium",
                        )}
                      >
                        {label}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums text-muted-foreground",
                          layout === "sheet"
                            ? "text-[10px] leading-tight"
                            : "w-8 text-right text-[11px]",
                        )}
                      >
                        {count}
                      </span>
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent
                    side={layout === "sheet" ? "top" : "right"}
                    sideOffset={6}
                  >
                    {label} · {messages[stage.rangeKey]}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </ToggleGroup>
        </TooltipProvider>
      </section>
    </LazyMotion>
  );
}
