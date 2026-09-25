"use client";

import {
  domAnimation,
  m,
  useReducedMotion,
  type MotionStyle,
  type TargetAndTransition,
  type Transition,
} from "motion/react";
import { memo, type ReactNode } from "react";
import { LazyMotion } from "@/components/motion-scope";
import { DRAW_IN } from "@/components/filters/drawn-glyph";
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
  useFilterCardGestures,
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
 * than across it. The stroke and its branches are the reach, one part,
 * because the gestures move them together and leave the ring where it is.
 */
type Stroke = { d: string; step: "stem" | "branches" };
const SEX_GLYPHS: Record<SexKind, { ring: string; reach: readonly Stroke[] }> = {
  male: {
    ring: "M16 14a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    reach: [
      { d: "M14.25 9.75 21 3", step: "stem" },
      { d: "M21 3H16", step: "branches" },
      { d: "M21 3V8", step: "branches" },
    ],
  },
  female: {
    ring: "M18 9a6 6 0 1 0-12 0 6 6 0 1 0 12 0",
    reach: [
      { d: "M12 15v7", step: "stem" },
      { d: "M12 19H9", step: "branches" },
      { d: "M12 19H15", step: "branches" },
    ],
  },
};

function isSexKind(value: string): value is SexKind {
  return value in SEX_GLYPHS;
}

// The draw, one step per part. The last branch lands at 0.40s, which is where
// the pop peaks.
type DrawStep = { duration: number; delay: number };
export const SEX_DRAW = {
  ring: { duration: 0.18, delay: 0 },
  stem: { duration: 0.16, delay: 0.12 },
  branches: { duration: 0.14, delay: 0.26 },
} as const satisfies Record<"ring" | Stroke["step"], DrawStep>;
const DRAW = SEX_DRAW;
const LANDED = DRAW.branches.delay + DRAW.branches.duration;

const DESELECT_DURATION = 0.24;
// How faint the outline under a chosen sign is. It shows only where the ink
// has not reached yet, and while the sign goes back into it on an untick.
const OUTLINE_UNDER_INK = 0.2;

/**
 * How one part of the faint outline goes faint as the card is ticked, and
 * comes back as it is unticked.
 *
 * On a tick each part fades on the clock its ink is drawn on, so the sign is
 * inked over in the order it is built and is whole in every frame. The layer
 * used to fade as one piece in 0.15s while the ink took 0.40s to reach the
 * arrowhead or the crossbar, and for about 140ms the sign was a ring with a
 * stub, or a ring on a stick. The ease is the draw's opposite: the part the
 * pen has not reached keeps most of its ink until the pen is nearly there.
 *
 * The untick is one crossfade for the whole sign, which keeps it whole on the
 * way out, and waits for the card's turn in a reset.
 */
export function outlineFade(
  step: DrawStep,
  {
    checked,
    reduceMotion,
    wait,
  }: { checked: boolean; reduceMotion: boolean; wait: number },
): Transition {
  if (reduceMotion) return OFF;
  if (checked) {
    return { duration: step.duration, delay: step.delay, ease: "easeIn" };
  }
  return { duration: DESELECT_DURATION, delay: wait, ease: "easeOut" };
}

const POP = { duration: 0.36, peak: 1.08 } as const;
const POP_DELAY = LANDED - POP.duration / 2;

type Move = {
  pose: TargetAndTransition;
  transition: Transition;
  style?: MotionStyle;
};
type Part = "whole" | "ring" | "reach";

// The end of the handle, (12, 22) in the 24-unit box, where a hand would hold
// the mirror. Motion owns transform-origin, so the pivot is spelled as
// originX and originY.
const HANDLE_END: MotionStyle = {
  transformBox: "view-box",
  originX: 0.5,
  originY: 22 / 24,
};

const THRUST_UNITS = 1.2;
const RECOIL_UNITS = 0.5;
const TILT_DURATION = 0.7;
const FINISH_DELAY = LANDED - 0.06;
const THRUST: Transition = {
  duration: 0.36,
  times: [0, 0.3, 0.7, 1],
  ease: "easeOut",
  delay: FINISH_DELAY,
};

/**
 * What each sign does once it is whole, taken from what the sign is drawn
 * after. ♂ is Mars's shield and spear: the spear thrusts out along its
 * diagonal and the shield takes the recoil the other way. ♀ is Venus's hand
 * mirror: it tilts on its handle as if raised to look into, a glint crosses
 * the glass and a spark catches its rim (MirrorLight).
 *
 * The thrust and the recoil part the arrow from the ring by 1.7 units at
 * most. The arrow's round cap reaches one unit back from its root and the
 * ring's stroke one unit out from its path, so the two stay joined under 2.
 *
 * Every finish starts a little before the landing, so it reads as the draw's
 * follow-through rather than a second event after it. Tweens, because these
 * have more than two keyframes.
 */
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
        delay: FINISH_DELAY,
      },
      style: HANDLE_END,
    },
  },
};

/**
 * The wind-up while a pointer is held on the card, on the part that then
 * finishes: the spear draws back into the shield, the mirror dips on its
 * handle. It is the one gesture a phone gets before the pick, since a touch
 * never hovers. Two keyframes, so springs; the release overshoots a little,
 * which is what makes letting go read as the spring being let off.
 *
 * It sits on its own element inside the finish's, so the two poses never
 * share a property and the press springs back under the finish rather than
 * being held until the finish takes over. The spear drawn back overlaps the
 * ring rather than parting from it.
 */
const PRESS: Record<SexKind, { part: Part } & Omit<Move, "transition">> = {
  male: { part: "reach", pose: { x: -0.5, y: 0.5 } },
  female: { part: "whole", pose: { rotate: 3, y: 0.4 }, style: HANDLE_END },
};
const PRESS_SPRING: Transition = { type: "spring", stiffness: 520, damping: 30 };
const RELEASE_SPRING: Transition = {
  type: "spring",
  stiffness: 700,
  damping: 18,
};

/**
 * What the ink does as a card is unticked, while it fades: the spear is
 * sheathed back through the shield, the mirror is lowered. Ink only: the
 * faint outline the card rests with stays where it is, so the sign is seen
 * going back into it. It runs on Ponastavi too, in each card's turn.
 */
const EXIT: Record<
  SexKind,
  { part: "reach" | "all" } & Omit<Move, "transition">
> = {
  male: { part: "reach", pose: { x: -0.9, y: 0.9 } },
  female: { part: "all", pose: { rotate: 5, y: 1 }, style: HANDLE_END },
};

/**
 * The mirror's light. The glint is an arc inside the glass on its upper left,
 * the side a highlight sits on in line art, one step thinner than the sign so
 * it reads as light and not as part of the frame. The spark is a small cross
 * clear of the rim on the upper right, where the ring's outer edge is 7 units
 * from the centre and the cross comes no nearer than 7.2.
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

const AT_REST = { x: 0, y: 0, rotate: 0 } as const;
const OFF: Transition = { duration: 0 };

function changedValue(selected: string[], nextSelected: string[]) {
  return (
    nextSelected.find((value) => !selected.includes(value)) ??
    selected.find((value) => !nextSelected.includes(value))
  );
}

// Memoised: every prop is a primitive, and the section renders again for each
// hover and press on either card, where this sign is over a dozen motion
// elements.
const SexGlyph = memo(function SexGlyph({
  kind,
  checked,
  finishing,
  pressing,
  resetDelay,
}: {
  kind: SexKind;
  checked: boolean;
  finishing: boolean;
  pressing: boolean;
  resetDelay: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { ring, reach } = SEX_GLYPHS[kind];
  const finish = FINISH[kind];
  const press = PRESS[kind];
  const exit = EXIT[kind];
  const moving = finishing && !shouldReduceMotion;
  const held = pressing && !shouldReduceMotion;
  // What an untick waits before it starts, so a reset leaves in turn.
  const wait = shouldReduceMotion || checked ? 0 : resetDelay;

  const drawn = (step: DrawStep) => ({
    initial: false as const,
    animate: { pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 },
    transition: shouldReduceMotion
      ? OFF
      : checked
        ? DRAW_IN(step.duration, step.delay)
        : // The stroke comes off only once the layer has faded out, so
          // unticking never runs the draw backwards.
          { duration: 0, delay: DESELECT_DURATION + resetDelay },
  });

  // The same part of the faint outline, going faint as its ink draws over it.
  const outlined = (step: DrawStep) => ({
    initial: false as const,
    animate: { opacity: checked ? OUTLINE_UNDER_INK : 1 },
    transition: outlineFade(step, {
      checked,
      reduceMotion: shouldReduceMotion ?? false,
      wait,
    }),
  });

  // A part of the sign that takes its share of the finish, the wind-up, or
  // both, on nested elements. The same moves run in both layers, so the faint
  // outline underneath goes with the ink.
  const part = (name: Part, children: ReactNode) => {
    const move = finish[name];
    let node = children;
    if (press.part === name) {
      node = (
        <m.g
          initial={false}
          style={press.style}
          animate={held ? press.pose : AT_REST}
          transition={
            shouldReduceMotion ? OFF : held ? PRESS_SPRING : RELEASE_SPRING
          }
        >
          {node}
        </m.g>
      );
    }
    if (move) {
      node = (
        <m.g
          initial={false}
          style={move.style}
          animate={moving ? move.pose : AT_REST}
          transition={
            moving ? move.transition : shouldReduceMotion ? OFF : RELEASE_SPRING
          }
        >
          {node}
        </m.g>
      );
    }
    return node;
  };

  // The ink's way out; see EXIT. It snaps back while the ink is hidden, so a
  // card ticked again draws in place.
  //
  // The pose does not ask about reduced motion, only the transition does.
  // The server cannot know the setting, so it renders an unticked sign's
  // hidden ink in the exit pose, and a client that answered AT_REST here
  // under reduced motion hydrated a different transform: React's attribute
  // mismatch, the dev overlay's issue badge over the dock. The ink is at
  // opacity 0 in that pose, and the transition below is instant under
  // reduced motion either way.
  const sheathe = (children: ReactNode) => (
    <m.g
      initial={false}
      style={exit.style}
      animate={checked ? AT_REST : exit.pose}
      transition={
        checked || shouldReduceMotion
          ? OFF
          : { duration: DESELECT_DURATION, delay: resetDelay, ease: "easeIn" }
      }
    >
      {children}
    </m.g>
  );

  const reachInk = part(
    "reach",
    reach.map(({ d, step }) => <m.path key={d} d={d} {...drawn(DRAW[step])} />),
  );
  const ink = (
    <>
      {part("ring", <m.path d={ring} {...drawn(DRAW.ring)} />)}
      {exit.part === "reach" ? sheathe(reachInk) : reachInk}
      {kind === "female" && <MirrorLight moving={moving} />}
    </>
  );

  const layers = (
    <>
      <g className="text-muted-foreground" stroke="currentColor">
        {part("ring", <m.path d={ring} {...outlined(DRAW.ring)} />)}
        {part(
          "reach",
          reach.map(({ d, step }) => (
            <m.path key={d} d={d} {...outlined(DRAW[step])} />
          )),
        )}
      </g>
      <m.g
        stroke="var(--brand-strong)"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : DESELECT_DURATION,
          delay: wait,
          ease: "easeOut",
        }}
      >
        {exit.part === "all" ? sheathe(ink) : ink}
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
});

/**
 * The glint across the mirror's glass and the spark on its rim, hidden at
 * rest. Always mounted: mounted only for the finish, the keyframes landed
 * on their last values at once and neither light was ever seen.
 */
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
  const {
    hoveredValue: hoveredSex,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures();

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
          // Touch browsers can skip pointerleave when the finger slides off,
          // and pointercancel does not cover every path, so the click clears
          // the press too.
          releasePress(changed);
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
          // The wind-up yields the moment the finish takes over.
          const pressing = pressedValue === value && !celebrating;
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
                    : OFF
                }
              >
                <SexGlyph
                  kind={value}
                  checked={checked}
                  finishing={celebrating}
                  pressing={pressing}
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
              {...gestureHandlers(value)}
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
