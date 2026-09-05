"use client";

import { m } from "motion/react";
import {
  AGE_STAGE_PATHS as PATHS,
  type AgeStage,
} from "@/components/filters/age-stage-paths";
import { cn } from "@/lib/utils";

// Re-exported so the callers that have always read the stage union from the
// component keep their import; the geometry itself now lives in a module the
// server-rendered poster can read too (age-stage-paths.ts).
export type { AgeStage };

export function agePathTransition({
  draw,
  reduceMotion,
  delay,
}: {
  draw: boolean;
  reduceMotion: boolean;
  delay: number;
}) {
  return reduceMotion
    ? { duration: 0, delay: 0 }
    : {
        duration: draw ? 0.16 : 0.12,
        delay: draw ? delay : 0,
        ease: "easeOut" as const,
      };
}

// The stage with the most paths finishes last, so a caller that has to outlive
// the drawing reads the length from the paths instead of guessing at it.
export function ageDrawSeconds(stage: AgeStage, reduceMotion: boolean): number {
  return PATHS[stage].reduce((longest, path) => {
    const transition = agePathTransition({
      draw: true,
      reduceMotion,
      delay: path.delay,
    });
    return Math.max(longest, transition.duration + transition.delay);
  }, 0);
}

export function AgeStageIcon({
  stage,
  className,
  draw = false,
  reduceMotion = false,
}: {
  stage: AgeStage;
  className?: string;
  draw?: boolean;
  reduceMotion?: boolean;
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
      {PATHS[stage].map(({ d, delay }) => (
        <m.path
          key={d}
          d={d}
          initial={false}
          animate={{
            opacity: 1,
            pathLength: draw && !reduceMotion ? [0, 1] : 1,
          }}
          transition={agePathTransition({ draw, reduceMotion, delay })}
        />
      ))}
    </svg>
  );
}
