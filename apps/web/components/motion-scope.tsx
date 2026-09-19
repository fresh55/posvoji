"use client";

import { LazyMotion as Features, MotionConfig } from "motion/react";
import type { ComponentProps } from "react";

/** Keep animation policy with animated surfaces, out of static-page roots. */
export function LazyMotion(props: ComponentProps<typeof Features>) {
  return (
    <MotionConfig reducedMotion="user">
      <Features {...props} />
    </MotionConfig>
  );
}
