"use client";

import type {
  Easing,
  MotionStyle,
  TargetAndTransition,
  Transition,
} from "motion/react";
import { m } from "motion/react";
import { DRAW_IN } from "@/components/filters/drawn-glyph";
import { waitThen } from "@/components/filters/use-filter-motion";
import { cn } from "@/lib/utils";

/**
 * The mark both tests wear: lucide's diagonal test tube (lucide-react, ISC
 * license), in lucide's own stroke order. The glass runs from the lip down
 * the near wall, round the bottom and back up; the rim closes the mouth; the
 * sample is the level line near the bottom.
 *
 * One tube for FIV and FeLV, and no tick anywhere in it. FIV wore ShieldCheck,
 * whose tick at rest is the panel's own mark for a chosen row, drawn on a row
 * whose real control is the tick box at the other end, and the same shield
 * already stands for a data-sharing shelter on /o-nas and for ownership on the
 * data policy page. FeLV wore this tube, which left the two halves of one
 * question looking like two unrelated facts. HEALTH_ICONS maps both tests to
 * the same lucide icon, so the chip, the dialog's pill and the poster's tile
 * draw what the row draws (health-cards.test.tsx holds them together).
 */
export const TEST_TUBE = {
  glass: "M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3",
  rim: "m16 2 6 6",
  sample: "M12 16H4",
} as const;

type TubeStroke = keyof typeof TEST_TUBE;

// In lucide's order, which is the order both layers draw them in.
const STROKES = Object.keys(TEST_TUBE) as TubeStroke[];

// The pick, "the clinic works": the tube inks in and the sample is drawn into
// it, brisk, and the tube is then raised once to be read, towards upright
// about its rim where a hand holds it, back through level and still.
//
// The draw lands at 0.2s: the glass first, the sample last.
const DRAW: Record<TubeStroke, { duration: number; delay: number }> = {
  glass: { duration: 0.14, delay: 0 },
  rim: { duration: 0.08, delay: 0.06 },
  sample: { duration: 0.12, delay: 0.08 },
};

/** When the last stroke of the draw has landed, measured from the press. */
export const DRAW_END = Math.max(
  ...STROKES.map((name) => DRAW[name].delay + DRAW[name].duration),
);

// The read starts a little before the sample lands, so it is the draw's
// follow-through rather than a second event after it. Four keyframes, so a
// tween: 3+ keyframes never run on a spring.
const TILT = [0, -12, 2.5, 0];
const TILT_TIMES = [0, 0.38, 0.74, 1];
const TILT_EASE: Easing[] = ["easeOut", "easeInOut", "easeOut"];
const TILT_AT = 0.16;
const TILT_DURATION = 0.34;

/** How far the read raises the tube, in degrees (negative is towards upright). */
export const TILT_PEAK = Math.min(...TILT);
/** When the tube is highest: the moment the result is read. */
export const READ_AT = TILT_AT + TILT_TIMES[1] * TILT_DURATION;
/** When the tube is still again, measured from the press. */
export const READ_END = TILT_AT + TILT_DURATION;

/**
 * When the box ticks: once the sample is in and before the tube is at its
 * highest, so the answer confirms as it is being read. The card's own fill
 * answers the press at once; the box waits for this.
 */
export const CHECK_DELAY = 0.26;

/**
 * The hover: the tube tips a third of the way towards the read and holds
 * while the pointer does, the gesture a pick would play, begun. On a spring,
 * because it is two values and has to give way in either direction at any
 * moment.
 */
export const PREVIEW_TIP = TILT_PEAK / 3;
const PREVIEW_SPRING: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 24,
};

/**
 * Letting go: the accent copy is laid aside, a small tip towards lying down
 * about the rim, and fades off the grey outline, which stays where it is. A
 * reset holds it back by the row's turn in the stagger.
 */
export const LEAVE_TIP = 6;
export const LEAVE = 0.22;

/**
 * How long the accent copy takes to come back on and stand up again. For a
 * fresh pick that is over before its strokes show much: they are still
 * undrawn and switch themselves on in turn. A test ticked again while its
 * accent is still leaving comes back from wherever the leave had got to, over
 * a few frames rather than in one.
 *
 * Not a transitionEnd that stands the copy up once it has gone: Motion reads
 * the value a transitionEnd leaves as the target, so a tick during the leave
 * saw no change to animate and the copy finished tipping over while lit.
 */
const INK_ON: Transition = { duration: 0.08, ease: "easeOut" };

/**
 * Where the tube is held: the middle of the rim, (19, 5) in the 24-unit box.
 * Motion owns transform-origin, so the pivot is spelled as originX and
 * originY. RIM is for the HTML spans around the glyph, which are the glyph's
 * own 20px box; RIM_IN_VIEW_BOX for the accent group inside the svg.
 */
export const RIM: MotionStyle = { originX: 19 / 24, originY: 5 / 24 };
const RIM_IN_VIEW_BOX: MotionStyle = { transformBox: "view-box", ...RIM };

type Track = { animate: TargetAndTransition; transition: Transition };

export type TubeTracks = {
  /** The hover's tip, on the outer span. */
  preview: Track;
  /** The pick's read, on the inner span. */
  tilt: Track;
  /** The accent copy as a whole: switched on, and laid aside on the way out. */
  ink: Track;
  /** Each accent stroke's drawn length. */
  strokes: Record<TubeStroke, Track>;
};

const STILL: Transition = { duration: 0 };
const LEVEL: TargetAndTransition = { rotate: 0 };
const SETTLE: Transition = { duration: 0.16, ease: "easeOut" };

function eachStroke(
  track: (name: TubeStroke) => Track,
): Record<TubeStroke, Track> {
  return {
    glass: track("glass"),
    rim: track("rim"),
    sample: track("sample"),
  };
}

/**
 * Every moving part of one tube, for one state.
 *
 * `reading` is the pick playing: this row's one-shot, while it is ticked. The
 * read's wait is written into its keyframes (waitThen), so a read started
 * while the tube is still settling from the last one eases to level first
 * rather than jumping there. A tube let go mid-read settles to level.
 *
 * Letting go never runs the draw backwards: the accent fades and tips as a
 * whole, and the drawn lengths drop only once it is gone. The reset's turn
 * reaches that fade and the drop, not only the halo around them.
 *
 * Under reduced motion nothing tips, draws or fades: every part lands where
 * it rests at once.
 */
export function tubeTracks({
  checked,
  reading,
  previewing,
  reduced,
  resetDelay,
}: {
  checked: boolean;
  reading: boolean;
  /** A mouse or keyboard focus rests on a live row nobody has picked, and no
   *  click has landed on it since the pointer came. */
  previewing: boolean;
  reduced: boolean;
  /** The row's turn in a reset (useResetStagger), 0 otherwise. */
  resetDelay: number;
}): TubeTracks {
  if (reduced) {
    const shown = checked ? 1 : 0;
    return {
      preview: { animate: LEVEL, transition: STILL },
      tilt: { animate: LEVEL, transition: STILL },
      ink: { animate: { opacity: shown, rotate: 0 }, transition: STILL },
      strokes: eachStroke(() => ({
        animate: { pathLength: shown, opacity: shown },
        transition: STILL,
      })),
    };
  }

  const preview: Track = {
    animate: { rotate: previewing ? PREVIEW_TIP : 0 },
    transition: PREVIEW_SPRING,
  };

  if (!checked) {
    return {
      preview,
      tilt: { animate: LEVEL, transition: SETTLE },
      ink: {
        animate: { opacity: 0, rotate: LEAVE_TIP },
        transition: { duration: LEAVE, delay: resetDelay, ease: "easeIn" },
      },
      // A stroke with nothing drawn is switched off as well: a round cap at
      // pathLength 0 still paints a dot.
      strokes: eachStroke(() => ({
        animate: { pathLength: 0, opacity: 0 },
        transition: { duration: 0, delay: resetDelay + LEAVE },
      })),
    };
  }

  const read = reading
    ? waitThen(TILT_AT, TILT, {
        duration: TILT_DURATION,
        times: TILT_TIMES,
        ease: TILT_EASE,
        settle: TILT_AT,
      })
    : null;

  return {
    preview,
    tilt: read
      ? { animate: { rotate: read.keyframes }, transition: read.transition }
      : { animate: LEVEL, transition: SETTLE },
    ink: { animate: { opacity: 1, rotate: 0 }, transition: INK_ON },
    strokes: eachStroke((name) => ({
      animate: { pathLength: 1, opacity: 1 },
      transition: DRAW_IN(DRAW[name].duration, DRAW[name].delay),
    })),
  };
}

/**
 * Two layers of the tube, the way the other drawn sections draw: a muted
 * outline that is always there, and an accent copy that draws itself on when
 * the test is chosen. The read and the hover move the whole drawing from the
 * spans around it; only the way out moves the accent alone.
 *
 * overflow-visible, because the accent's tip on the way out carries the round
 * bottom a hair past the view box.
 */
export function TestTubeGlyph({
  tracks,
  className,
}: {
  tracks: TubeTracks;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      data-health-glyph=""
      className={cn("overflow-visible", className)}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="text-muted-foreground" stroke="currentColor">
        {STROKES.map((name) => (
          <path key={name} d={TEST_TUBE[name]} />
        ))}
      </g>
      <m.g
        data-ink=""
        stroke="var(--brand-strong)"
        style={RIM_IN_VIEW_BOX}
        initial={false}
        animate={tracks.ink.animate}
        transition={tracks.ink.transition}
      >
        {STROKES.map((name) => (
          <m.path
            key={name}
            d={TEST_TUBE[name]}
            initial={false}
            animate={tracks.strokes[name].animate}
            transition={tracks.strokes[name].transition}
          />
        ))}
      </m.g>
    </svg>
  );
}
