"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import {
  CountRoll,
  FilterSelectionMark,
  filterCardVariants,
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

// The lucide "mars" and "venus" nodes, with the circle rewritten as two arcs so
// the whole glyph is one list of paths that both layers can draw.
const SEX_GLYPHS: Record<string, string[]> = {
  male: ["M16 14a6 6 0 1 0-12 0 6 6 0 1 0 12 0", "M16 3h5v5", "m21 3-6.75 6.75"],
  female: ["M18 9a6 6 0 1 0-12 0 6 6 0 1 0 12 0", "M12 15v7", "M9 19h6"],
};

const DRAW_DURATION = 0.4;
const DRAW_STAGGER = 0.12;
const FADE_DURATION = 0.15;
const POP_DURATION = 0.42;
const POP_MS = 500;
// The glyph draws over DRAW_DURATION plus one stagger step, so the check waits
// for the drawing hand instead of racing it.
const DRAW_CHECK_DELAY = 0.3;

// A zero-count option is a dead end, but an active selection is never locked
// out of being unchecked.
function isDead(count: number, checked: boolean): boolean {
  return count === 0 && !checked;
}

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
      <g className="text-muted-foreground" stroke="currentColor">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <m.g
        stroke="var(--filter-accent-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : FADE_DURATION,
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
                      duration: DRAW_DURATION,
                      // Circle, then each stroke in turn, so the glyph reads as
                      // one hand drawing it.
                      delay: index * DRAW_STAGGER,
                      ease: "easeOut",
                    }
                  : // The drawn length drops only once the overlay has faded
                    // out, so unchecking never runs the draw backwards.
                    { duration: 0, delay: FADE_DURATION }
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

  const celebrationIndex = options.findIndex(
    ({ value }) => value === celebration?.value,
  );

  return (
    <LazyMotion features={domAnimation}>
      <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={(nextSelected) => {
          const changed = changedValue(selected, nextSelected);
          if (!changed) return;

          if (nextSelected.includes(changed)) {
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
        {options.map(({ value, label }, index) => {
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const paths = SEX_GLYPHS[value];
          if (!paths) return null;

          const celebrating = celebration?.value === value && checked;
          const reacting = celebrationIndex >= 0 && !celebrating;
          // The card that did not change leans away from the one that did.
          const tiltDirection = Math.sign(index - celebrationIndex) || 1;
          const hovered = hoveredSex === value;

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={isDead(count, checked)}
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
                appearDelay={DRAW_CHECK_DELAY}
                className="absolute right-2 top-2"
              />

              <m.span
                aria-hidden
                className="flex items-center justify-center"
                initial={false}
                animate={{ y: hovered ? -1 : 0, scale: hovered ? 1.05 : 1 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 26, mass: 0.5 }
                }
              >
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={
                    shouldReduceMotion
                      ? { scale: 1, rotate: 0, y: 0 }
                      : celebrating
                        ? value === "male"
                          ? { scale: [1, 1.12, 1], rotate: [0, -8, 0], y: 0 }
                          : { scale: [1, 1.12, 1], rotate: 0, y: [0, -1.5, 0] }
                        : reacting
                          ? {
                              scale: 1,
                              rotate: [0, tiltDirection * 2.5, 0],
                              y: 0,
                            }
                          : { scale: 1, rotate: 0, y: 0 }
                  }
                  transition={
                    celebrating
                      ? { duration: POP_DURATION, ease: "easeOut" }
                      : reacting
                        ? { duration: 0.3, delay: 0.1, ease: "easeOut" }
                        : { duration: 0.16 }
                  }
                >
                  <SexGlyph paths={paths} checked={checked} />
                </m.span>
              </m.span>
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
