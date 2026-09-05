"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterSelectionMark,
  filterCardVariants,
  isDeadOption,
} from "@/components/filters/filter-card";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-provider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { groupLabel, type FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Lucide outlines split in construction order: circle, shaft/stem, then two
// branches. Each branch draws out from its junction rather than across it.
const SEX_GLYPHS: Record<string, string[]> = {
  male: [
    "M16 14a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    "M14.25 9.75 21 3",
    "M21 3H16",
    "M21 3V8",
  ],
  female: [
    "M18 9a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    "M12 15v7",
    "M12 19H9",
    "M12 19H15",
  ],
};

// Give the stroke time to read at 24px, then settle with the same ease-out
// used by the other filter gestures.
const DRAW_STEPS = [
  { duration: 0.22, delay: 0 },
  { duration: 0.24, delay: 0.14 },
  { duration: 0.18, delay: 0.34 },
] as const;
const FADE_DURATION = 0.15;
const DESELECT_DURATION = 0.24;
const POP_DURATION = 0.52;
const POP_MS = 600;

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

function SexGlyph({ paths, checked }: { paths: string[]; checked: boolean }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      // Alone among the filter glyphs this one draws at 24px, lucide's
      // own grid, where the paths sit on whole coordinates. A stroke of
      // 2 is the width that grid is cut for: its edges land on pixel
      // boundaries instead of straddling them. The size-5 glyphs
      // elsewhere scale off the grid regardless, so they keep 1.65.
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <m.g
        className="text-muted-foreground"
        stroke="currentColor"
        initial={false}
        animate={{ opacity: checked ? 0.2 : 1 }}
        transition={{
          duration: shouldReduceMotion
            ? 0
            : checked
              ? FADE_DURATION
              : DESELECT_DURATION,
          ease: "easeOut",
        }}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </m.g>
      <m.g
        stroke="var(--filter-accent-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : DESELECT_DURATION,
          ease: "easeOut",
        }}
      >
        {paths.map((d, index) => (
          <m.path
            key={d}
            d={d}
            initial={false}
            animate={{ pathLength: checked ? 1 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : checked
                  ? {
                      ...DRAW_STEPS[Math.min(index, 2)],
                      ease: "easeOut",
                    }
                  : // The drawn length drops only once the overlay has faded
                    // out, so unchecking never runs the draw backwards.
                    { duration: 0, delay: DESELECT_DURATION }
            }
          />
        ))}
      </m.g>
    </svg>
  );
}

export function SexCards({
  options,
  counts,
  selected,
  onToggle,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(POP_MS);
  const { hoveredValue: hoveredSex, handlers: hoverHandlers } =
    useFilterCardHover();

  return (
    <LazyMotion features={domAnimation}>
      <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={(nextSelected) => {
          const changed = changedValue(selected, nextSelected);
          if (!changed) return;

          if (nextSelected.includes(changed) && !shouldReduceMotion) {
            celebrate(changed);
          } else {
            clearCelebration();
          }
          onToggle(changed);
        }}
        aria-label={groupLabel("sex", locale)}
        spacing={1.5}
        className="grid w-full grid-cols-2 items-stretch"
      >
        {options.map(({ value, label }) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const paths = SEX_GLYPHS[value];
          if (!paths) return null;

          const celebrating = celebration?.value === value && checked;
          const hovered = hoveredSex === value;

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={isDeadOption(count, checked)}
              {...hoverHandlers(value)}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                selected: checked,
                className:
                  "h-[4.75rem] min-w-0 flex-1 flex-col gap-1 px-2 py-2 text-center",
              })}
            >
              <FilterSelectionMark
                checked={checked}
                className="absolute right-2 top-2"
              />

              <FilterCardHoverLift hovered={hovered}>
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={
                    !shouldReduceMotion && celebrating
                      ? { scale: [1, 1.1, 1] }
                      : { scale: 1 }
                  }
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: POP_DURATION, ease: "easeOut" }
                  }
                >
                  <SexGlyph paths={paths} checked={checked} />
                </m.span>
              </FilterCardHoverLift>
              <span className={cn("text-xs", checked && "font-medium")}>
                {label}
              </span>
              <CountRoll
                value={count}
                className="text-2xs tabular-nums text-muted-foreground"
              />
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </LazyMotion>
  );
}
