"use client";

import {
  domAnimation,
  m,
  useReducedMotion,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import type { ReactNode } from "react";
import { LazyMotion } from "@/components/motion-scope";
import {
  CountRoll,
  DEAD_OPTION_CLASS,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardTail,
  FilterSelectionMark,
  countClass,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { groupLabel, type FilterOption } from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

type SexKind = "male" | "female";

/**
 * Lucide's outlines, split in construction order: the ring, the stroke that
 * leaves it, then the two branches, each drawn out from its junction rather
 * than across it. The stroke and its branches are one part, because the
 * finishing gesture moves them together and leaves the ring where it is.
 */
const SEX_GLYPHS: Record<
  SexKind,
  { ring: string; stem: string; branches: readonly [string, string] }
> = {
  male: {
    ring: "M16 14a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    stem: "M14.25 9.75 21 3",
    branches: ["M21 3H16", "M21 3V8"],
  },
  female: {
    ring: "M18 9a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    stem: "M12 15v7",
    branches: ["M12 19H9", "M12 19H15"],
  },
};

function isSexKind(value: string): value is SexKind {
  return value in SEX_GLYPHS;
}

/**
 * The draw, one step per part. The last branch lands at 0.40s.
 *
 * It ran 0.52s before, and the pop that went with it peaked at 0.28s, while
 * only the ring and half the stroke were down. The branches, which are what
 * make the sign read as one sex or the other, then drew on a glyph that had
 * already settled, so nothing marked the moment the sign was finished.
 */
const DRAW = {
  ring: { duration: 0.18, delay: 0 },
  stem: { duration: 0.16, delay: 0.12 },
  branches: { duration: 0.14, delay: 0.26 },
} as const;
const LANDED = DRAW.branches.delay + DRAW.branches.duration;

const FADE_DURATION = 0.15;
const DESELECT_DURATION = 0.24;

// The pop rises into the landing and peaks as the last branch lands.
const POP = { duration: 0.36, peak: 1.08 } as const;
const POP_DELAY = LANDED - POP.duration / 2;

/**
 * What each sign does once it is whole, taken from what the sign is drawn
 * after. ♂ is Mars's shield and spear: the spear thrusts out along its
 * diagonal and the shield takes the recoil the other way. ♀ is Venus's hand
 * mirror: it tilts on its handle as if raised to look into, a glint crosses
 * the glass and a spark catches its rim.
 *
 * The thrust and the recoil part the arrow from the ring by 1.7 units at
 * most. The arrow's round cap reaches one unit back from its root and the
 * ring's stroke one unit out from its path, so the two stay joined under 2.
 *
 * Every finish starts a little before the landing, so it reads as the draw's
 * follow-through rather than a second event after it. Tweens, because these
 * have more than two keyframes.
 */
type Move = {
  pose: TargetAndTransition;
  transition: Transition;
  style?: MotionStyle;
};
type Part = "whole" | "ring" | "reach";

const THRUST_UNITS = 1.2;
const RECOIL_UNITS = 0.5;
const THRUST: Transition = {
  duration: 0.36,
  times: [0, 0.3, 0.7, 1],
  ease: "easeOut",
};
const TILT_DURATION = 0.7;
const FINISH_DELAY = LANDED - 0.06;

const FINISH: Record<SexKind, Partial<Record<Part, Move>>> = {
  male: {
    reach: {
      pose: {
        x: [0, THRUST_UNITS, -0.3, 0],
        y: [0, -THRUST_UNITS, 0.3, 0],
      },
      transition: THRUST,
    },
    ring: {
      pose: {
        x: [0, -RECOIL_UNITS, 0.15, 0],
        y: [0, RECOIL_UNITS, -0.15, 0],
      },
      transition: THRUST,
    },
  },
  female: {
    whole: {
      pose: { rotate: [0, -6, -6, 1.5, 0] },
      transition: {
        duration: TILT_DURATION,
        times: [0, 0.25, 0.6, 0.85, 1],
        ease: "easeInOut",
      },
      // The end of the handle, (12, 22) in the 24-unit box, where a hand
      // would hold it. Motion owns transform-origin, so the pivot is spelled
      // as originX and originY.
      style: { transformBox: "view-box", originX: 0.5, originY: 22 / 24 },
    },
  },
};

/**
 * The mirror's light, drawn only while it finishes. The glint is an arc
 * inside the glass on its upper left, the side a highlight sits on in line
 * art, one step thinner than the sign so it reads as light and not as part
 * of the frame. The spark is a small cross clear of the rim on the upper
 * right, where the ring's outer edge is 7 units from the centre and the
 * cross comes no nearer than 7.2.
 */
const GLINT = "M8.52 8.07A3.6 3.6 0 0 1 10.77 5.62";
const SPARK = "M18.4 1.4v2.4M17.2 2.6h2.4";
const GLINT_DELAY = FINISH_DELAY + 0.1;
const SPARK_DELAY = FINISH_DELAY + 0.3;
const SPARK_DURATION = 0.36;
const LIGHT_ORIGIN: MotionStyle = {
  transformBox: "fill-box",
  originX: 0.5,
  originY: 0.5,
};

// The gesture state clears once the longest finish, the tilt, has run.
const HOLD_MS = Math.ceil((FINISH_DELAY + TILT_DURATION) * 1000) + 50;

const AT_REST: TargetAndTransition = { x: 0, y: 0, rotate: 0 };
const OFF: Transition = { duration: 0 };

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

function SexGlyph({
  kind,
  checked,
  finishing,
  resetDelay,
}: {
  kind: SexKind;
  checked: boolean;
  finishing: boolean;
  resetDelay: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { ring, stem, branches } = SEX_GLYPHS[kind];
  const finish = FINISH[kind];
  const leaving = DESELECT_DURATION + resetDelay;

  // One rule for every drawn stroke: opacity is the switch and pathLength is
  // the draw. A pathLength of 0 with a round cap still paints a dot, and the
  // arrow's two branches start at its tip, so without the switch a green dot
  // sat at the tip from the first frame until the branches drew.
  const drawn = (step: { duration: number; delay: number }) => ({
    initial: false as const,
    animate: { pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 },
    transition: shouldReduceMotion
      ? { duration: 0 }
      : checked
        ? {
            pathLength: { ...step, ease: "easeOut" as const },
            opacity: { duration: 0.05, delay: step.delay },
          }
        : // The stroke comes off only once the layer has faded out, so
          // unticking never runs the draw backwards.
          { duration: 0, delay: leaving },
  });

  const moving = finishing && !shouldReduceMotion;

  // A part of the sign that takes its share of the finish. The same moves
  // run in both layers, so the faint outline underneath goes with the ink.
  const part = (name: Part, children: ReactNode) => {
    const move = finish[name];
    if (!move) return children;
    return (
      <m.g
        initial={false}
        style={move.style}
        animate={moving ? move.pose : AT_REST}
        transition={moving ? { ...move.transition, delay: FINISH_DELAY } : OFF}
      >
        {children}
      </m.g>
    );
  };

  const reach = (paths: (d: string, step: "stem" | "branches") => ReactNode) =>
    part(
      "reach",
      <>
        {paths(stem, "stem")}
        {branches.map((d) => paths(d, "branches"))}
      </>,
    );

  const layers = (
    <>
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
          delay: shouldReduceMotion || checked ? 0 : resetDelay,
          ease: "easeOut",
        }}
      >
        {part("ring", <path d={ring} />)}
        {reach((d) => (
          <path key={d} d={d} />
        ))}
      </m.g>
      <m.g
        stroke="var(--brand-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : DESELECT_DURATION,
          delay: shouldReduceMotion || checked ? 0 : resetDelay,
          ease: "easeOut",
        }}
      >
        {part("ring", <m.path d={ring} {...drawn(DRAW.ring)} />)}
        {reach((d, step) => (
          <m.path key={d} d={d} {...drawn(DRAW[step])} />
        ))}
        {kind === "female" && <MirrorLight moving={moving} />}
      </m.g>
    </>
  );

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
      {part("whole", layers)}
    </svg>
  );
}

/** The glint across the mirror's glass and the spark on its rim. */
function MirrorLight({ moving }: { moving: boolean }) {
  return (
    <>
      <m.path
        d={GLINT}
        strokeWidth={1.5}
        initial={false}
        animate={
          moving
            ? { pathLength: [0, 1, 1, 1], opacity: [0, 0.7, 0.7, 0] }
            : { pathLength: 0, opacity: 0 }
        }
        transition={
          moving
            ? {
                duration: 0.42,
                times: [0, 0.4, 0.6, 1],
                delay: GLINT_DELAY,
                ease: "easeOut",
              }
            : OFF
        }
      />
      <m.path
        d={SPARK}
        strokeWidth={1.25}
        style={LIGHT_ORIGIN}
        initial={false}
        animate={
          moving
            ? { scale: [0, 1, 0], rotate: [0, 45], opacity: [0, 1, 0] }
            : { scale: 0, rotate: 0, opacity: 0 }
        }
        transition={
          moving
            ? { duration: SPARK_DURATION, delay: SPARK_DELAY, ease: "easeOut" }
            : OFF
        }
      />
    </>
  );
}

const NO_RESET_DELAY = () => 0;

export function SexCards({
  options,
  counts,
  selected,
  onToggle,
  layout = "sidebar",
  resetDelay = NO_RESET_DELAY,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  layout?: FilterCardLayout;
  /** The turn each card takes when the section's Ponastavi clears it. */
  resetDelay?: (index: number) => number;
}) {
  const { locale } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const {
    celebration,
    celebrate,
    clear: clearCelebration,
  } = useOneShotCelebration<string>(HOLD_MS);
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
        // The sheet keeps the two tiles side by side, where a drawer three
        // columns wide has the room for them. The sidebar stacks them as rows
        // for the reason filter-card.tsx records: one column of rows reads as
        // a list, and two outlined boxes in it read as a form.
        orientation={layout === "sheet" ? "horizontal" : "vertical"}
        // Every other section is plain buttons, where each option is its own
        // tab stop. Radix's roving focus would make this group one stop that
        // arrow keys move inside, so the same panel would answer Tab in two
        // ways depending on which section you were in.
        rovingFocus={false}
        spacing={1.5}
        className={cn(
          "w-full items-stretch",
          layout === "sheet" && "grid grid-cols-2",
        )}
      >
        {options.map(({ value, label }, index) => {
          if (!isSexKind(value)) return null;
          const count = counts.get(value) ?? 0;
          const checked = selected.includes(value);
          const celebrating = celebration?.value === value && checked;
          const hovered = hoveredSex === value;
          const exitDelay = resetDelay(index);

          // The glyph and its gestures are the same drawing on both surfaces;
          // only what stands around it changes.
          const glyph = (
            <FilterCardHoverLift hovered={hovered}>
              <m.span
                className="flex items-center justify-center"
                initial={false}
                animate={
                  !shouldReduceMotion && celebrating
                    ? { scale: [1, POP.peak, 1] }
                    : { scale: 1 }
                }
                transition={
                  !shouldReduceMotion && celebrating
                    ? { duration: POP.duration, delay: POP_DELAY, ease: "easeOut" }
                    : { duration: 0 }
                }
              >
                <SexGlyph
                  kind={value}
                  checked={checked}
                  finishing={celebrating}
                  resetDelay={exitDelay}
                />
              </m.span>
            </FilterCardHoverLift>
          );

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              disabled={isDeadOption(count, checked)}
              {...hoverHandlers(value)}
              aria-label={`${label}, ${animalCount(count, locale)}`}
              className={filterCardVariants({
                layout,
                selected: checked,
                className:
                  layout === "sheet"
                    ? cn(
                        DEAD_OPTION_CLASS,
                        "h-[4.75rem] min-w-0 flex-1 flex-col gap-1 px-2 py-2 text-center",
                      )
                    : cn("flex", filterCardLayoutClass(layout)),
              })}
            >
              {layout === "sheet" ? (
                <>
                  <FilterSelectionMark
                    checked={checked}
                    className="absolute right-2 top-2"
                  />
                  {glyph}
                  <span className={cn("text-xs", checked && "font-medium")}>
                    {label}
                  </span>
                  {/* The shared voice, not a hand-spelled one. This tile drew
                      its count at 11px where every section that goes through
                      FilterCardTail draws the sheet's 12px, and it kept the
                      resting ink on the green fill when chosen. */}
                  <CountRoll
                    value={count}
                    className={countClass(layout, checked)}
                  />
                </>
              ) : (
                <>
                  {/* No appearDelay: the draw is the confirmation here and it
                      starts at once, unlike the paw landing or the plant
                      growing, which the check waits out. */}
                  <FilterCardMark
                    layout={layout}
                    checked={checked}
                    appearDelay={0}
                  />
                  <FilterCardIconWell
                    layout={layout}
                    checked={checked}
                    exitDelay={exitDelay}
                  >
                    {glyph}
                  </FilterCardIconWell>
                  <FilterCardTail
                    layout={layout}
                    label={label}
                    checked={checked}
                    renderCount={(className) => (
                      <CountRoll value={count} className={className} />
                    )}
                  />
                </>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </LazyMotion>
  );
}
