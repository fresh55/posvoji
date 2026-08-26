"use client";

import { Leaf } from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AgeStageIcon,
  ageDrawSeconds,
  type AgeStage,
} from "@/components/filters/age-stage-icon";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
} from "@/components/filters/filter-card";
import {
  CollapsibleBody,
  FilterSectionHeader,
  type SectionCollapse,
} from "@/components/filters/filter-section-header";
import { useFilterCardHover } from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  swayDegrees: number;
};

const STAGES: Record<AgeStage, Stage> = {
  mladicek: {
    colorClassName: "text-[var(--age-young)]",
    groveClassName: "size-7",
    rowClassName: "size-5",
    rangeKey: "ageRangeYoung",
    swayDegrees: 4.5,
  },
  odrasel: {
    colorClassName: "text-[var(--age-grown)]",
    groveClassName: "size-9",
    rowClassName: "size-5.5",
    rangeKey: "ageRangeAdult",
    swayDegrees: 3,
  },
  senior: {
    colorClassName: "text-[var(--age-grown)]",
    groveClassName: "size-11",
    rowClassName: "size-6",
    rangeKey: "ageRangeSenior",
    swayDegrees: 2,
  },
};

const STANDARD_EASE = [0.16, 1, 0.3, 1] as const;

// The sway starts once the drawing is under way and rings out past it, so the
// celebration has to be held for the whole span or the tail snaps to rotate 0.
const SWAY_DELAY = 0.08;
const SWAY_TAIL = 0.12;
const CELEBRATION_GUARD_MS = 80;
// The check confirms once the plant has grown, not while it is still drawing.
const GROWTH_CHECK_DELAY = 0.3;
const RESET_STAGGER = 0.045;
const RESET_CLEAR_MS = 280;

// The section body folds inside an `AnimatePresence initial={false}`, which
// tells Motion the fold is already present on first paint. Motion applies that
// to everything under the fold rather than to the fold alone, and it keeps
// applying it: whatever mounts in there later counts as already present, so
// its mount animation is skipped and it is written straight to the pose it
// should have ended on. The sway and the ground line are unharmed because they
// animate on update. The two below exist only to be mounted and watched, so
// each needs a presence boundary of its own, carrying the default `initial`,
// or it never plays.
//
// Named for what it does to its child rather than for the shape of the
// animation: "one shot" is already taken in this codebase by
// useOneShotCelebration, which is a different thing (a celebration that fires
// once per selection), and a wrapper sharing that word read as its JSX form.
function PlaysOnMount({ children }: { children: ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}

function swaySeconds(stage: AgeStage, reduceMotion: boolean) {
  return SWAY_DELAY + ageDrawSeconds(stage, reduceMotion) + SWAY_TAIL;
}

// The leaf starts at top-1 of the column and the ground line sits at bottom-1
// of the grove, so the drop is the grove height less both insets and the leaf.
function leafFallDistance(layout: "sidebar" | "sheet") {
  return (layout === "sheet" ? 48 : 56) - 4 - 4 - 10;
}

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
  collapse,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout?: "sidebar" | "sheet";
  collapse?: SectionCollapse;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const [celebration, setCelebration] = useState<{
    value: AgeStage;
    id: number;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const { hoveredValue: hoveredAge, handlers: hoverHandlers } =
    useFilterCardHover();
  const [fallingLeafId, setFallingLeafId] = useState(0);
  const celebratingAge = celebration?.value ?? null;
  const leafFall = leafFallDistance(layout);

  useEffect(() => {
    if (!celebration) return;
    const ms =
      swaySeconds(celebration.value, shouldReduceMotion) * 1000 +
      CELEBRATION_GUARD_MS;
    const timer = window.setTimeout(() => setCelebration(null), ms);
    return () => window.clearTimeout(timer);
  }, [celebration, shouldReduceMotion]);

  useEffect(() => {
    if (!isResetting || selected.length > 0) return;
    const timer = window.setTimeout(
      () => setIsResetting(false),
      RESET_CLEAR_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isResetting, selected.length]);

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebratingAge,
  );

  return (
    <LazyMotion features={domAnimation}>
      <section>
        <FilterSectionHeader
          label={groupLabel("age", locale)}
          active={selected.length > 0}
          onReset={() => {
            setCelebration(null);
            setFallingLeafId(0);
            setIsResetting(true);
            onToggleMany(selected);
          }}
          resetAriaLabel={messages.resetAgeFilters}
          collapse={collapse}
        />

        <CollapsibleBody collapse={collapse}>
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
            {options.map(({ value }, index) => {
              if (!isAgeStage(value)) return null;

              const stage = STAGES[value];
              const active = isAgeStageActive(selected, value);
              const celebrating = celebratingAge === value && active;
              const reacting = celebrationIndex >= 0 && !celebrating;
              // Neighbours lean away from the plant that just grew; the plant
              // itself leans right unless it is the last in the row.
              const windDirection = celebrating
                ? index === options.length - 1
                  ? -1
                  : 1
                : Math.sign(index - celebrationIndex) || 1;
              const hovered = hoveredAge === value;
              // A reset wakes the columns in order rather than all at once.
              const settleDelay = isResetting ? index * RESET_STAGGER : 0;

              return (
                <span
                  key={value}
                  data-age-stage={value}
                  data-stage-active={active ? "true" : "false"}
                  className="relative flex h-full items-end justify-center pb-1"
                >
                  <m.span
                    className="absolute inset-x-2 bottom-1 h-px origin-center bg-[var(--age-ground)]/55"
                    initial={false}
                    animate={{
                      opacity: active ? 1 : 0.12,
                      scaleX: active ? 1 : 0.25,
                    }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : {
                            duration: 0.18,
                            delay: settleDelay,
                            ease: STANDARD_EASE,
                          }
                    }
                  />
                  {celebrating && !shouldReduceMotion ? (
                    <span className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                      <PlaysOnMount>
                        <m.span
                          key={celebration?.id}
                          className="size-[3px] rounded-full bg-[var(--age-ground)]"
                          initial={{ opacity: 0.65, scale: 0.5 }}
                          animate={{ opacity: 0, scale: 2.5 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                      </PlaysOnMount>
                    </span>
                  ) : null}
                  {value === "senior" &&
                  fallingLeafId > 0 &&
                  !shouldReduceMotion ? (
                    <span className="pointer-events-none absolute inset-x-0 top-1 flex justify-center">
                      <PlaysOnMount>
                        <m.span
                          key={fallingLeafId}
                          initial={{ opacity: 0, x: 0, y: 0, rotate: -8 }}
                          animate={{
                            opacity: [0, 0.9, 0.85, 0.85, 0],
                            x: [0, 5, -4, 2, 2],
                            y: [
                              0,
                              leafFall * 0.3,
                              leafFall * 0.62,
                              leafFall,
                              leafFall,
                            ],
                            rotate: [-8, 24, -14, 34, 34],
                          }}
                          transition={{
                            duration: 1.25,
                            ease: "easeInOut",
                            // The last pair repeats the landed pose so the leaf
                            // rests on the ground line while it fades.
                            times: [0, 0.22, 0.52, 0.86, 1],
                          }}
                          onAnimationComplete={() => setFallingLeafId(0)}
                        >
                          <Leaf
                            className={cn("size-2.5", stage.colorClassName)}
                            strokeWidth={1.6}
                          />
                        </m.span>
                      </PlaysOnMount>
                    </span>
                  ) : null}
                  <m.span
                    className="flex origin-bottom items-end justify-center"
                    initial={false}
                    animate={
                      active
                        ? { opacity: 1, scale: hovered ? 1.04 : 1, y: 0 }
                        : hovered
                          ? { opacity: 0.75, scale: 0.9, y: 1 }
                          : { opacity: 0.5, scale: 0.84, y: 2 }
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : {
                            duration: 0.24,
                            delay: settleDelay,
                            ease: STANDARD_EASE,
                          }
                    }
                  >
                    <m.span
                      className="flex origin-bottom items-end justify-center"
                      initial={false}
                      animate={
                        shouldReduceMotion
                          ? { rotate: 0, x: 0, scaleX: 1, scaleY: 1 }
                          : celebrating
                            ? {
                                rotate: [
                                  0,
                                  windDirection * stage.swayDegrees,
                                  windDirection * -stage.swayDegrees * 0.42,
                                  0,
                                ],
                                x: [0, windDirection * 0.65, 0],
                                // Squash on the way up, stretch as it settles.
                                scaleX: [1, 1.04, 0.98, 1],
                                scaleY: [1, 0.95, 1.03, 1],
                              }
                            : reacting
                              ? {
                                  rotate: [0, windDirection * 1.2, 0],
                                  x: [0, windDirection * 0.4, 0],
                                  scaleX: 1,
                                  scaleY: 1,
                                }
                              : { rotate: 0, x: 0, scaleX: 1, scaleY: 1 }
                      }
                      transition={
                        celebrating
                          ? {
                              duration:
                                ageDrawSeconds(value, shouldReduceMotion) +
                                SWAY_TAIL,
                              delay: SWAY_DELAY,
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
                      <AgeStageIcon
                        stage={value}
                        draw={celebrating}
                        reduceMotion={shouldReduceMotion}
                        className={cn(
                          stage.colorClassName,
                          stage.groveClassName,
                        )}
                      />
                    </m.span>
                  </m.span>
                </span>
              );
            })}
          </div>

          <TooltipProvider>
            <ToggleGroup
              type="multiple"
              value={selected}
              onValueChange={(nextSelected) => {
                const changed = changedValue(selected, nextSelected);
                if (!changed) return;

                if (
                  nextSelected.length === options.length ||
                  !nextSelected.includes(changed) ||
                  !isAgeStage(changed)
                ) {
                  setCelebration(null);
                  if (
                    changed === "senior" &&
                    !nextSelected.includes(changed) &&
                    !shouldReduceMotion
                  ) {
                    setFallingLeafId((current) => current + 1);
                  }
                } else {
                  setCelebration((current) => ({
                    value: changed,
                    id: (current?.id ?? 0) + 1,
                  }));
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
                        {...hoverHandlers(value)}
                        aria-label={`${label}, ${messages[stage.rangeKey]}, ${animalCount(count, locale)}`}
                        className={filterCardVariants({
                          selected: checked,
                          className:
                            layout === "sheet"
                              ? "flex h-[4.75rem] flex-1 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 text-center"
                              // Three columns and pr-9, not four with a leading
                              // 1.25rem for the check. The check moved to the
                              // trailing edge, so the row opens with the
                              // sprout the way every other sidebar card opens
                              // with its icon; see the mark below.
                              : "grid h-11 w-full shrink grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-2 px-2.5 pr-9 text-left",
                        })}
                      >
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
                              "max-w-full text-2xs leading-tight",
                            checked && "font-medium",
                          )}
                        >
                          {label}
                        </span>
                        <CountRoll
                          value={count}
                          className={cn(
                            "tabular-nums text-muted-foreground",
                            layout === "sheet"
                              ? "text-3xs leading-tight"
                              : "w-8 text-right text-2xs",
                          )}
                        />
                        {/* Last, and at the trailing edge, the way every
                            other card in this sidebar places it
                            (filter-card.tsx). Leading, it made a square, an
                            icon, a label and a count: a checkbox list, which
                            is the shape this whole sidebar exists not to be.
                            One inset per shape: right-2.5 centred on the
                            row, right-1.5 top-1.5 on the tile. */}
                        <FilterSelectionMark
                          checked={checked}
                          appearDelay={GROWTH_CHECK_DELAY}
                          className={
                            layout === "sheet"
                              ? "absolute right-1.5 top-1.5"
                              : "absolute right-2.5 top-1/2 -translate-y-1/2"
                          }
                        />
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
        </CollapsibleBody>
      </section>
    </LazyMotion>
  );
}
