"use client";

import { m } from "motion/react";
import { memo } from "react";
import {
  AGE_STAGE_PATHS as PATHS,
  type AgeStage,
  type AgeStagePath,
} from "@/components/filters/age-stage-paths";
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

// The stage with the latest path finishes last, so a caller that has to
// outlive the drawing reads the length from the paths instead of guessing.
export function ageDrawSeconds(stage: AgeStage, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  return PATHS[stage].reduce(
    (longest, path) => Math.max(longest, path.delay + path.duration),
    0,
  );
}

// Memoised because its props are a stage, a colour class and three flags, and
// the grove above it is redrawn on every filter press for the counts beside
// it. Each icon is up to four motion paths, and they were most of the motion
// work a press spent in the age section while no stage had changed at all.
export const AgeStageIcon = memo(function AgeStageIcon({
  stage,
  className,
  woodClassName,
  draw = false,
  reduceMotion = false,
  soil = true,
}: {
  stage: AgeStage;
  className?: string;
  /** Colours the trunk and branches apart from the canopy. Left out, the mark
   *  is one colour, which is what the dialog's grey fact row wants. */
  woodClassName?: string;
  draw?: boolean;
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
        .map((path) => (
          <m.path
            key={path.d}
            d={path.d}
            className={path.wood ? woodClassName : undefined}
            initial={false}
            animate={
              draw && !reduceMotion
                ? { opacity: [0, 1], pathLength: [0, 1] }
                : { opacity: 1, pathLength: 1 }
            }
            transition={agePathTransition({ draw, reduceMotion, path })}
          />
        ))}
    </svg>
  );
});
