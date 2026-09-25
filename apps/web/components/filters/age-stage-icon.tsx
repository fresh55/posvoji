"use client";

import { m, type Transition } from "motion/react";
import { memo, type CSSProperties } from "react";
import {
  AGE_STAGE_PATHS as PATHS,
  type AgeStage,
  type AgeStagePath,
} from "@/components/filters/age-stage-paths";
import { waitThen } from "@/components/filters/use-filter-motion";
import { cn } from "@/lib/utils";

// Re-exported so the callers that have always read the stage union from the
// component keep their import; the geometry itself now lives in a module the
// server-rendered poster can read too (age-stage-paths.ts).
export type { AgeStage };

const UNDRAW_SECONDS = 0.12;
// Long enough to land on a frame, short enough that the stroke is not seen
// washing in ahead of its own tip.
const PEN_DOWN_SECONDS = 0.04;

// pathLength and opacity keep separate clocks. A path waiting for its turn
// sits at pathLength 0, and with round caps that still paints a dot where the
// path starts: the sprout's soil showed one under the stem it had not reached
// yet. Opacity holds the stroke off until its own delay is up.
export function agePathTransition({
  draw,
  reduceMotion,
  path,
}: {
  draw: boolean;
  reduceMotion: boolean;
  path: Pick<AgeStagePath, "delay" | "duration">;
}) {
  if (reduceMotion) return { duration: 0, delay: 0 };
  if (!draw) return { duration: UNDRAW_SECONDS, ease: "easeOut" as const };
  return {
    pathLength: {
      duration: path.duration,
      delay: path.delay,
      ease: "easeOut" as const,
    },
    opacity: { duration: PEN_DOWN_SECONDS, delay: path.delay },
  };
}

/**
 * The sprout's wilt: its leaves fold down in the first third, hang, and come
 * back up. The grove bends the whole plant on the same clock, so it lives
 * here where both can read it.
 */
export const AGE_WILT = {
  duration: 0.8,
  times: [0, 0.3, 0.55, 1],
};

type FoldPose = {
  animate: { rotate?: number | (number | null)[] };
  transition: { rotate?: Transition };
};

// Paths without fold data never turn.
const NO_FOLD: FoldPose = { animate: {}, transition: {} };

// A leaf folds from wherever it is, after the same wait as the plant's own
// farewell (waitThen), so the two stay on one clock.
function foldPose(
  degrees: number,
  wilt: boolean,
  wiltDelay: number,
  reduceMotion: boolean,
): FoldPose {
  if (reduceMotion) {
    return { animate: { rotate: 0 }, transition: { rotate: { duration: 0 } } };
  }
  if (!wilt) {
    return {
      animate: { rotate: 0 },
      transition: { rotate: { duration: UNDRAW_SECONDS, ease: "easeOut" } },
    };
  }
  const fold = waitThen(wiltDelay, [0, degrees, degrees * 0.8, 0], {
    ...AGE_WILT,
    ease: "easeInOut",
    settle: wiltDelay,
  });
  return {
    animate: { rotate: fold.keyframes },
    transition: { rotate: fold.transition },
  };
}

// The stage with the latest path finishes last, so a caller that has to
// outlive the drawing reads the length from the paths instead of guessing.
export function ageDrawSeconds(stage: AgeStage, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  return PATHS[stage].reduce(
    (longest, path) => Math.max(longest, path.delay + path.duration),
    0,
  );
}

// Memoised because its props are a stage, colour classes, flags and a delay, and
// the grove above it is redrawn on every filter press for the counts beside
// it. Each icon is up to four motion paths, and they were most of the motion
// work a press spent in the age section while no stage had changed at all.
// A caller that passes a style passes it only while it matters, so the memo
// still holds at rest.
export const AgeStageIcon = memo(function AgeStageIcon({
  stage,
  className,
  woodClassName,
  style,
  draw = false,
  wilt = false,
  wiltDelay = 0,
  reduceMotion = false,
  soil = true,
}: {
  stage: AgeStage;
  className?: string;
  /** Colours the trunk and branches apart from the canopy. Left out, the mark
   *  is one colour, which is what the dialog's grey fact row wants. */
  woodClassName?: string;
  /** On the svg. The age rows put their reset turn here, as the delay of the
   *  colour they give back. */
  style?: CSSProperties;
  draw?: boolean;
  /** Folds the leaves that carry fold data down and back up once. */
  wilt?: boolean;
  /** Seconds the fold waits, for a plant that comes upright first. */
  wiltDelay?: number;
  reduceMotion?: boolean;
  /** The sprout's strip of soil. The grove turns it off and stands the plant
   *  on its own ground line. */
  soil?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      data-age-icon={stage}
      className={cn("shrink-0", className)}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[stage]
        .filter((path) => soil || !path.soil)
        .map((path) => {
          const drawing = draw && !reduceMotion;
          const { fold } = path;
          const turn = fold
            ? foldPose(fold.rotate, wilt, wiltDelay, reduceMotion)
            : NO_FOLD;
          return (
            <m.path
              key={path.d}
              d={path.d}
              className={path.wood ? woodClassName : undefined}
              // Motion writes transform-origin from originX/originY and
              // overwrites a transformOrigin passed beside them, so the pivot
              // is spelled its way, against the path's own box.
              style={
                fold
                  ? {
                      transformBox: "fill-box",
                      originX: fold.originX,
                      originY: fold.originY,
                    }
                  : undefined
              }
              initial={false}
              animate={{
                opacity: drawing ? [0, 1] : 1,
                pathLength: drawing ? [0, 1] : 1,
                ...turn.animate,
              }}
              transition={{
                ...agePathTransition({ draw, reduceMotion, path }),
                ...turn.transition,
              }}
            />
          );
        })}
    </svg>
  );
});
