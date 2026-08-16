"use client";

import {
  Shrub,
  Sprout,
  TreeDeciduous,
  type LucideIcon,
} from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import {
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
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
  icon: LucideIcon;
  colorClassName: string;
  groveClassName: string;
  rowClassName: string;
  rangeKey: "ageRangeYoung" | "ageRangeAdult" | "ageRangeSenior";
  growDuration: number;
  swayDegrees: number;
};

const STAGES: Record<string, Stage> = {
  mladicek: {
    icon: Sprout,
    colorClassName: "text-[#2f7d50]",
    groveClassName: "size-7",
    rowClassName: "size-5",
    rangeKey: "ageRangeYoung",
    growDuration: 0.38,
    swayDegrees: 4.5,
  },
  odrasel: {
    icon: Shrub,
    colorClassName: "text-[#92763b]",
    groveClassName: "size-9",
    rowClassName: "size-5.5",
    rangeKey: "ageRangeAdult",
    growDuration: 0.46,
    swayDegrees: 3,
  },
  senior: {
    icon: TreeDeciduous,
    colorClassName: "text-[#92763b]",
    groveClassName: "size-11",
    rowClassName: "size-6",
    rangeKey: "ageRangeSenior",
    growDuration: 0.54,
    swayDegrees: 2,
  },
};

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
  const shouldReduceMotion = useReducedMotion();
  const hintId = useId();
  const [celebratingAge, setCelebratingAge] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!celebratingAge) return;
    const timer = window.setTimeout(() => setCelebratingAge(null), 680);
    return () => window.clearTimeout(timer);
  }, [celebratingAge]);

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(() => setIsResetting(false), 280);
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebratingAge,
  );

  return (
    <section>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {groupLabel("age", locale)}
        </h3>
        {selected.length > 0 && (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => {
              setCelebratingAge(null);
              setIsResetting(true);
              onToggleMany(selected);
            }}
            aria-label={messages.resetAgeFilters}
            className="h-auto p-0 text-[11px] font-normal text-muted-foreground hover:text-foreground"
          >
            {messages.resetAges}
          </Button>
        )}
      </div>

      <p id={hintId} className="sr-only">
        {messages.ageFilterHint}
      </p>

      <LazyMotion features={domAnimation}>
        <div
          aria-hidden
          className={cn(
            "relative mb-2 grid grid-cols-3 items-end px-1",
            layout === "sheet" ? "h-12" : "h-14",
          )}
        >
          <span className="absolute inset-x-3 bottom-1 h-px bg-border" />
          <m.span
            className="absolute inset-x-3 bottom-1 h-px origin-center bg-[#2f6f4e]/45"
            initial={false}
            animate={{
              opacity: selected.length > 0 || isResetting ? 1 : 0,
              scaleX: selected.length > 0 || isResetting ? 1 : 0.25,
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.24, ease: "easeOut" }
            }
          />
          {options.map(({ value }, index) => {
          const stage = STAGES[value];
          if (!stage) return null;
          const Icon = stage.icon;
          const checked = selected.includes(value);
          const celebrating = celebratingAge === value && checked;
          const reacting = celebrationIndex >= 0 && !celebrating;
          const windDirection =
            celebrationIndex === options.length - 1 ? -1 : 1;

          return (
            <span
              key={value}
              className="relative flex h-full items-end justify-center pb-1"
            >
              <m.span
                className="flex origin-bottom items-end justify-center will-change-transform"
                initial={false}
                animate={
                  checked
                    ? { opacity: 1, y: 0, scale: 1 }
                    : { opacity: 0.22, y: 7, scale: 0.42 }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : checked
                      ? {
                          type: "spring",
                          stiffness: value === "mladicek" ? 440 : 360,
                          damping: value === "senior" ? 31 : 27,
                          mass: value === "senior" ? 0.72 : 0.5,
                        }
                      : {
                          duration: 0.18,
                          delay: isResetting ? index * 0.045 : 0,
                          ease: "easeOut",
                        }
                }
              >
                <m.span
                  className="flex origin-bottom items-end justify-center"
                  initial={false}
                  animate={
                    shouldReduceMotion
                      ? { rotate: 0, x: 0, y: 0 }
                      : celebrating
                        ? {
                            rotate: [
                              0,
                              windDirection * stage.swayDegrees,
                              windDirection * -stage.swayDegrees * 0.42,
                              0,
                            ],
                            x: [0, windDirection * 0.65, 0],
                            y: [0, -1.5, 0],
                          }
                        : reacting
                          ? {
                              rotate: [0, windDirection * 1.2, 0],
                              x: [0, windDirection * 0.4, 0],
                              y: 0,
                            }
                          : { rotate: 0, x: 0, y: 0 }
                  }
                  transition={
                    celebrating
                      ? {
                          duration: stage.growDuration + 0.12,
                          delay: 0.08,
                          ease: "easeOut",
                        }
                      : reacting
                        ? {
                            duration: 0.34,
                            delay:
                              0.1 +
                              Math.abs(index - celebrationIndex) * 0.045,
                            ease: "easeOut",
                          }
                        : { duration: 0.16 }
                  }
                >
                  <Icon
                    className={cn(
                      stage.colorClassName,
                      stage.groveClassName,
                    )}
                    strokeWidth={1.55}
                  />
                </m.span>
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
            setIsResetting(true);
          } else if (nextSelected.includes(changed)) {
            setCelebratingAge(changed);
          } else {
            setCelebratingAge(null);
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
          const stage = STAGES[value];
          if (!stage) return null;
          const Icon = stage.icon;
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);

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
              <Icon
                aria-hidden
                className={cn(stage.colorClassName, stage.rowClassName)}
                strokeWidth={1.7}
              />
              <span
                className={cn(
                  "min-w-0 truncate text-xs",
                  layout === "sheet" && "max-w-full text-[11px] leading-tight",
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
      </LazyMotion>
    </section>
  );
}
