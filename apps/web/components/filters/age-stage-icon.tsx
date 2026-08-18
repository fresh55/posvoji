"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";

export type AgeStage = "mladicek" | "odrasel" | "senior";

type PathDefinition = {
  d: string;
  delay: number;
};

// The paths are adapted from Lucide's Sprout, Shrub and TreeDeciduous icons
// (lucide-react, ISC license). Keeping the geometry local lets Motion draw the
// stem and canopy separately instead of moving the whole icon as one rigid
// shape.
const PATHS: Record<AgeStage, PathDefinition[]> = {
  mladicek: [
    {
      d: "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
      delay: 0,
    },
    { d: "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4", delay: 0.035 },
    { d: "M5 21h14", delay: 0.07 },
  ],
  odrasel: [
    { d: "M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5", delay: 0 },
    { d: "M14.5 14.5 12 17", delay: 0.03 },
    {
      d: "M17 8.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8a5 5 0 0 1 10 0z",
      delay: 0.06,
    },
  ],
  senior: [
    { d: "M12 19v3", delay: 0 },
    {
      d: "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z",
      delay: 0.04,
    },
  ],
};

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
