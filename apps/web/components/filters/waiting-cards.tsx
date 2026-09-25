"use client";

import type { TargetAndTransition, Transition } from "motion/react";
import { m, useReducedMotion } from "motion/react";
import { useId } from "react";
import {
  CountRoll,
  FilterCardHoverLift,
  FilterCardIconWell,
  FilterCardMark,
  FilterCardSection,
  FilterCardTail,
  filterCardLayoutClass,
  filterCardVariants,
  isDeadOption,
  sheetColumnsFor,
  type FilterCardLayout,
} from "@/components/filters/filter-card";
import type { SectionCollapse } from "@/components/filters/filter-section-header";
import { UnansweredNote } from "@/components/filters/unanswered-note";
import {
  useFilterCardGestures,
  useResetStagger,
  waitThen,
  type Pose as Track,
} from "@/components/filters/use-filter-motion";
import { useI18n } from "@/components/i18n-context";
import {
  groupLabel,
  type FilterOption,
  type Unanswered,
  type WaitingGroup,
} from "@/lib/filters";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The site marks a long wait with an hourglass: the dialog's stay line and
// the shelter picker's longest-waiting line both draw one. This section draws
// the same glass with the sand run through as far as the threshold, so the
// three rows read as one scale the way Velikost's paws do, and a chip here and
// the stay line in the dialog show the same thing.
//
// The glass is lucide's hourglass (lucide-react, ISC license). The sand is
// filled rather than stroked: at 20px an outline of a heap of sand is a
// squiggle, and the amount is the whole of what the three rows say.
//
// The glass is symmetric under a half turn about its centre (12, 12), which is
// what lets a pick turn it over without the outline changing.
const GLASS: readonly string[] = [
  "M5 22h14",
  "M5 2h14",
  "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",
  "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",
];

// The top bulb full, which is what a glass just turned over holds.
const FULL_TOP = "M7.9 4.2h8.2v2.4l-3.5 3.6h-1.2l-3.5-3.6Z";

/**
 * Each threshold's sand and how it runs. `sand` is what is left in the top
 * bulb and what has run into the bottom one, inside the glass's own walls:
 * each top is FULL_TOP cut level at `top`, so the pour, which draws FULL_TOP
 * under a falling edge, comes to rest on exactly this drawing. `top` and
 * `bottom` are where the top bulb's surface and the bottom heap's top stand
 * once the sand has run, in view-box units, and `duration` is how long the
 * pour takes. The tempo is the threshold: six months is a short trickle,
 * three years a long pour.
 */
export type Pour = {
  sand: { top: string; bottom: string };
  top: number;
  bottom: number;
  duration: number;
};

export const POURS: Record<WaitingGroup, Pour> = {
  "over-6-months": {
    sand: { top: FULL_TOP, bottom: "M7.9 19.6h8.2v1.55H7.9Z" },
    top: 4.2,
    bottom: 19.6,
    duration: 0.1,
  },
  "over-1-year": {
    sand: {
      top: "M8.48 7.2h7.04l-2.92 3h-1.2Z",
      bottom: "M8 17.4h8l.1 3.75H7.9Z",
    },
    top: 7.2,
    bottom: 17.4,
    duration: 0.18,
  },
  "over-3-years": {
    sand: {
      top: "M10.62 9.4h2.76l-.78.8h-1.2Z",
      bottom: "M10.4 14.8h3.2l2.5 2.6v3.75H7.9V17.4Z",
    },
    top: 9.4,
    bottom: 14.8,
    duration: 0.28,
  },
};

// A folded run of thresholds in the chips row shows the longest wait.
function thresholdOf(value = "over-3-years"): WaitingGroup {
  return Object.hasOwn(POURS, value) ? (value as WaitingGroup) : "over-3-years";
}

// The pick. The glass turns over, a half turn with a little overshoot, and the
// sand pours once it is upright: a stream from the neck, the heap rising in
// the bottom bulb, the top going down. Quick, because a threshold is being
// picked; the longest runs 0.5s.
const TURN: number[] = [180, -8, 0];
const TURN_DURATION = 0.24;
const TURN_TIMES = [0, 0.7, 1];
/** When the sand starts to run: as the turn reaches its overshoot. */
export const POUR_AT = 0.16;
/** How long the head of the stream takes from the neck to the floor. */
const STREAM_FALL = 0.05;
/** How long the last of the stream takes to fall once the top has stopped. */
const STREAM_TAIL = 0.06;
/** How long the accent takes to come on, inside the first part of the turn. */
const INK_IN = 0.1;
/** How long the accent takes to drain out when the threshold is let go. */
const LEAVE = 0.2;
const REST_TURN_DURATION = 0.16;
const REST_TURN: Transition = { duration: REST_TURN_DURATION, ease: "easeOut" };

// The surface of a full top bulb, which six months has not yet drawn down,
// and a level under the floor of the bottom one where none of the heap is
// drawn yet.
const TOP_FULL = POURS["over-6-months"].top;
const BOTTOM_EMPTY = 21.6;
// The stream runs down the middle, from the tip of the top heap to the floor.
// Below the heap's surface it is inside the sand and draws nothing of its own.
const STREAM = "M12 10.2V21.15";
const STREAM_WIDTH = 1.2;

const SAND_REST_OPACITY = 0.45;
// Inside the accent layer, so it multiplies with the layer's own opacity.
const SAND_LIT_OPACITY = 0.85;

/** When the sand has stopped running, measured from the press. */
function pourEnd(pour: Pour): number {
  return POUR_AT + pour.duration;
}

/** When the round mark comes on: as the sand settles. */
export function checkDelayOf(threshold: WaitingGroup): number {
  return pourEnd(POURS[threshold]);
}

/** When the last of a pick has stopped moving, measured from the press. */
export function pickEnd(pour: Pour): number {
  return Math.max(TURN_DURATION, pourEnd(pour) + STREAM_TAIL);
}

type TrackName = "turn" | "ink" | "top" | "bottom" | "stream" | "rest";

const STILL: Transition = { duration: 0 };

/** Where every part stands once a glass has settled. */
function restState(
  pour: Pour,
  checked: boolean,
): Record<TrackName, TargetAndTransition> {
  return {
    turn: { rotate: 0 },
    ink: { opacity: checked ? 1 : 0 },
    top: { attrY: pour.top },
    bottom: { attrY: pour.bottom },
    stream: { opacity: 0, pathLength: 0, pathOffset: 0 },
    rest: { opacity: checked ? 0 : SAND_REST_OPACITY },
  };
}

/**
 * Every moving part of one glass, for one state.
 *
 * turn is the half turn, on the span that holds the drawing. ink is the accent
 * copy of the glass and its sand; top and bottom are the edges the accent sand
 * is cut at, and stream the sliver falling between them. rest is the muted
 * sand drawn when the threshold is not picked.
 *
 * Letting go, a second pick replacing this one included, drains the accent out
 * over the muted drawing rather than snapping it off, and a reset holds that
 * back by the row's turn in the stagger. The muted sand waits for the glass
 * to stand upright, since a pick let go mid-turn would show it tilted. The cut
 * edges settle only once the accent is gone, so letting go never runs the
 * pour backwards.
 *
 * Under reduced motion nothing turns or pours: every part lands where it
 * rests at once.
 */
export function waitingTracks(
  pour: Pour,
  {
    checked,
    reduced,
    resetDelay,
  }: { checked: boolean; reduced: boolean; resetDelay: number },
): Record<TrackName, Track> {
  if (reduced) {
    const rest = restState(pour, checked);
    return {
      turn: { animate: rest.turn, transition: STILL },
      ink: { animate: rest.ink, transition: STILL },
      top: { animate: rest.top, transition: STILL },
      bottom: { animate: rest.bottom, transition: STILL },
      stream: { animate: rest.stream, transition: STILL },
      rest: { animate: rest.rest, transition: STILL },
    };
  }

  if (!checked) {
    const rest = restState(pour, false);
    const drain: Transition = {
      duration: LEAVE,
      delay: resetDelay,
      ease: "easeIn",
    };
    const afterDrain: Transition = { duration: 0, delay: resetDelay + LEAVE };
    return {
      turn: { animate: rest.turn, transition: REST_TURN },
      ink: { animate: rest.ink, transition: drain },
      top: { animate: rest.top, transition: afterDrain },
      bottom: { animate: rest.bottom, transition: afterDrain },
      stream: { animate: rest.stream, transition: afterDrain },
      rest: {
        animate: rest.rest,
        transition: {
          ...drain,
          delay: resetDelay + REST_TURN_DURATION,
          ease: "easeOut",
        },
      },
    };
  }

  // The sand holds a full top and an empty bottom through the turn. The hold
  // is written into the keyframes (waitThen) rather than passed as a delay,
  // which is how every keyframe track in the panel spells a wait.
  const top = waitThen(POUR_AT, [TOP_FULL, pour.top], {
    duration: pour.duration,
    ease: "linear",
  });
  const bottom = waitThen(POUR_AT, [BOTTOM_EMPTY, pour.bottom], {
    duration: pour.duration,
    ease: "easeOut",
  });
  // Opacity is the switch and the drawn length is the stream: the head falls
  // from the neck to the floor, and once the top has stopped the tail falls
  // after it. Butt caps, so neither end paints a dot, and hidden by opacity
  // either side of the pour all the same.
  const running = pour.duration + STREAM_TAIL;
  const opacity = waitThen(POUR_AT, [0, 1, 1, 0], {
    duration: running,
    times: [0, 0.02 / running, (running - 0.02) / running, 1],
    ease: "linear",
  });
  const head = waitThen(POUR_AT, [0, 1, 1], {
    duration: running,
    times: [0, STREAM_FALL / running, 1],
    ease: ["easeIn", "linear"],
  });
  const tail = waitThen(pourEnd(pour), [0, 1], {
    duration: STREAM_TAIL,
    ease: "easeIn",
  });
  return {
    turn: {
      animate: { rotate: TURN },
      transition: {
        duration: TURN_DURATION,
        times: TURN_TIMES,
        ease: ["easeOut", "easeInOut"],
      },
    },
    ink: {
      animate: { opacity: 1 },
      transition: { duration: INK_IN, ease: "easeOut" },
    },
    top: { animate: { attrY: top.keyframes }, transition: top.transition },
    bottom: {
      animate: { attrY: bottom.keyframes },
      transition: bottom.transition,
    },
    stream: {
      animate: {
        opacity: opacity.keyframes,
        pathLength: head.keyframes,
        pathOffset: tail.keyframes,
      },
      transition: {
        opacity: opacity.transition,
        pathLength: head.transition,
        pathOffset: tail.transition,
      },
    },
    // Gone at once, because the drawing is about to be half a turn round and
    // the muted sand would be seen upside down.
    rest: { animate: { opacity: 0 }, transition: STILL },
  };
}

// The hover: one grain, then a second, fall from the neck onto the heap,
// once. Only on a threshold that is not picked, like Energija's preview: a
// picked glass has nothing left to show. The grain starts under the crossing
// of the walls, where the strokes would hide it.
const GRAIN_START = 12.6;
const GRAIN_SIZE = 1.3;
const GRAIN_FALL = 0.24;
const GRAIN_DELAYS = [0, 0.12];
const GRAIN_OPACITY = 0.75;

export function grainTrack(pour: Pour, delay: number): Track {
  const attrY = waitThen(delay, [GRAIN_START, pour.bottom - GRAIN_SIZE], {
    duration: GRAIN_FALL,
    ease: "easeIn",
  });
  const opacity = waitThen(delay, [0, GRAIN_OPACITY, GRAIN_OPACITY, 0], {
    duration: GRAIN_FALL,
    times: [0, 0.03 / GRAIN_FALL, (GRAIN_FALL - 0.04) / GRAIN_FALL, 1],
    ease: "linear",
  });
  return {
    animate: { attrY: attrY.keyframes, opacity: opacity.keyframes },
    transition: { attrY: attrY.transition, opacity: opacity.transition },
  };
}

const GRAIN_REST: Track = {
  animate: { attrY: GRAIN_START, opacity: 0 },
  transition: STILL,
};
// The press: the glass is squeezed in the hand and springs back. The one
// gesture a phone gets.
const PRESS: Track = {
  animate: { scaleY: 0.9 },
  transition: { duration: 0.08, ease: "easeOut" },
};
const RELEASE: Track = {
  animate: { scaleY: 1 },
  transition: { type: "spring", stiffness: 600, damping: 14, mass: 0.5 },
};
// Under reduced motion there is no squeeze.
const UNPRESSED: Track = { animate: { scaleY: 1 }, transition: STILL };

/**
 * The glass and its sand, still, for the active-filters row. The chip for a
 * threshold showed a clock, the one place on the site time in the shelter was
 * not an hourglass.
 */
export function WaitingMark({
  value,
  className = "size-3.5",
}: {
  value?: string;
  className?: string;
}) {
  const { sand } = POURS[thresholdOf(value)];
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GLASS.map((d) => (
        <path key={d} d={d} />
      ))}
      <g fill="currentColor" stroke="none" opacity={0.6}>
        <path d={sand.top} />
        <path d={sand.bottom} />
      </g>
    </svg>
  );
}

// Two layers, as in the other drawn sections: the muted glass and sand that
// are always there, and an accent copy the pick turns over and pours.
function WaitingGlyph({
  threshold,
  tracks,
  previewing,
  className,
}: {
  threshold: WaitingGroup;
  tracks: ReturnType<typeof waitingTracks>;
  /** A mouse or keyboard focus is on a threshold nobody has picked, and
   *  motion is not reduced. */
  previewing: boolean;
  className: string;
}) {
  const pour = POURS[threshold];
  const { sand } = pour;
  // Stripped, because a clip is named in url(#...) and React's ids carry
  // characters that would have to be escaped there.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const topClip = `waiting-top-${uid}`;
  const bottomClip = `waiting-bottom-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      data-waiting-glyph={threshold}
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <defs>
        {/* The edges the accent sand is cut at. Everything below each edge
            is drawn, so the top goes down by its edge falling and the heap
            rises by its edge climbing. */}
        <clipPath id={topClip}>
          <m.rect
            data-edge="top"
            width={24}
            height={24}
            initial={false}
            animate={tracks.top.animate}
            transition={tracks.top.transition}
          />
        </clipPath>
        <clipPath id={bottomClip}>
          <m.rect
            data-edge="bottom"
            width={24}
            height={24}
            initial={false}
            animate={tracks.bottom.animate}
            transition={tracks.bottom.transition}
          />
        </clipPath>
      </defs>
      <g className="text-muted-foreground">
        <g stroke="currentColor">
          {GLASS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <m.g
          data-sand="rest"
          fill="currentColor"
          initial={false}
          animate={tracks.rest.animate}
          transition={tracks.rest.transition}
        >
          <path d={sand.top} />
          <path d={sand.bottom} />
        </m.g>
        {GRAIN_DELAYS.map((delay) => {
          const grain = previewing ? grainTrack(pour, delay) : GRAIN_REST;
          return (
            <m.rect
              key={delay}
              data-grain
              x={12 - STREAM_WIDTH / 2}
              width={STREAM_WIDTH}
              height={GRAIN_SIZE}
              rx={0.4}
              fill="currentColor"
              initial={false}
              animate={grain.animate}
              transition={grain.transition}
            />
          );
        })}
      </g>
      <m.g
        data-ink
        stroke="var(--brand-strong)"
        initial={false}
        animate={tracks.ink.animate}
        transition={tracks.ink.transition}
      >
        {GLASS.map((d) => (
          <path key={d} d={d} />
        ))}
        <g
          data-sand="lit"
          fill="var(--brand-strong)"
          stroke="none"
          opacity={SAND_LIT_OPACITY}
        >
          <path d={FULL_TOP} clipPath={`url(#${topClip})`} />
          <path d={sand.bottom} clipPath={`url(#${bottomClip})`} />
          <m.path
            data-stream
            d={STREAM}
            stroke="var(--brand-strong)"
            strokeWidth={STREAM_WIDTH}
            strokeLinecap="butt"
            initial={false}
            animate={tracks.stream.animate}
            transition={tracks.stream.transition}
          />
        </g>
      </m.g>
    </svg>
  );
}

export function WaitingCards({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  layout,
  collapse,
  unanswered,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  layout: FilterCardLayout;
  collapse?: SectionCollapse;
  unanswered?: Unanswered;
}) {
  const { locale, messages } = useI18n();
  const reduced = useReducedMotion() ?? false;
  const label = groupLabel("waiting", locale);
  const hintId = useId();
  const { beginReset, resetDelay } = useResetStagger(
    selected.length,
    options.length,
  );
  const {
    hoveredValue,
    previewing,
    settle,
    pressedValue,
    release: releasePress,
    handlers: gestureHandlers,
  } = useFilterCardGestures<string>();

  return (
    <FilterCardSection
      label={label}
      hint={messages.waitingFilterHint}
      // Each row takes the hint as its description: the round marks say one
      // threshold at a time, and a screen reader hears nothing of them.
      hintId={hintId}
      active={selected.length > 0}
      onReset={() => {
        beginReset();
        onToggleMany(selected);
      }}
      resetAriaLabel={messages.resetWaitingFilters}
      layout={layout}
      collapse={collapse}
      // One row of three on the phone: the three glasses read as one scale.
      sheetColumns={sheetColumnsFor(options.length)}
      footer={<UnansweredNote tally={unanswered} />}
    >
      {options.map(({ value, label: option }, index) => {
        const count = counts.get(value) ?? 0;
        const checked = selected.includes(value);
        const dead = isDeadOption(count, checked);
        const exitDelay = resetDelay(index);
        const threshold = thresholdOf(value);
        const tracks = waitingTracks(POURS[threshold], {
          checked,
          reduced,
          resetDelay: exitDelay,
        });
        const press = reduced
          ? UNPRESSED
          : pressedValue === value
            ? PRESS
            : RELEASE;

        return (
          <button
            key={value}
            type="button"
            aria-pressed={checked}
            aria-label={option + ", " + animalCount(count, locale)}
            aria-describedby={hintId}
            disabled={dead}
            {...gestureHandlers(value)}
            onClick={() => {
              releasePress(value);
              // Letting go under the mouse is the drain, and grains falling
              // into the glass straight after would be a second answer to one
              // press. They wait for the pointer to come back.
              settle(value);
              onToggle(value);
            }}
            className={filterCardVariants({
              layout,
              selected: checked,
              className: cn("flex", filterCardLayoutClass(layout)),
            })}
          >
            <FilterCardMark
              layout={layout}
              checked={checked}
              appearDelay={checkDelayOf(threshold)}
              // One threshold at a time (SINGLE_CHOICE_GROUPS), so the round
              // mark: a tick box that unticks itself when its neighbour is
              // pressed is a box doing what no other box in the panel does.
              shape="dot"
            />
            <FilterCardIconWell
              layout={layout}
              checked={checked}
              exitDelay={exitDelay}
            >
              <FilterCardHoverLift hovered={hoveredValue === value}>
                {/* The turn and the squeeze on spans of their own, so a
                    press let go under a turn springs back without cutting
                    the turn short. */}
                <m.span
                  className="flex items-center justify-center"
                  initial={false}
                  animate={tracks.turn.animate}
                  transition={tracks.turn.transition}
                >
                  <m.span
                    className="flex items-center justify-center"
                    initial={false}
                    animate={press.animate}
                    transition={press.transition}
                  >
                    <WaitingGlyph
                      threshold={threshold}
                      tracks={tracks}
                      previewing={
                        previewing(value) && !checked && !dead && !reduced
                      }
                      className={cn(
                        "size-5 transition-[opacity,transform] duration-200",
                        // A glass nobody is waiting in has tipped over.
                        dead && "rotate-[10deg] opacity-60",
                      )}
                    />
                  </m.span>
                </m.span>
              </FilterCardHoverLift>
            </FilterCardIconWell>
            <FilterCardTail
              layout={layout}
              label={option}
              checked={checked}
              renderCount={(className) => (
                <CountRoll value={count} className={className} />
              )}
            />
          </button>
        );
      })}
    </FilterCardSection>
  );
}
