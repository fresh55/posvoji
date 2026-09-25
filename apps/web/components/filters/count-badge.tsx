"use client";

import {
  AnimatePresence,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { CountRoll } from "@/components/filters/filter-card";
import { LazyMotion } from "@/components/motion-scope";
import { Badge } from "@/components/ui/badge";

// The 95% scale the badge used to enter on (tw-animate's zoom-in-95 over
// 200ms), in both directions now.
const SHOWN = { opacity: 1, scale: 1 } as const;
const HIDDEN = { opacity: 0, scale: 0.95 } as const;
const FADE = { duration: 0.2, ease: "easeOut" } as const;

/**
 * How many filters are on, beside "Filtri" in the sidebar's heading and on
 * the phone's dock. Nothing at zero.
 *
 * The number rolls the way every count on the panel does, and the badge
 * leaves on its last number rather than vanishing in one frame when the last
 * filter comes off. Its own LazyMotion, because neither place it is drawn
 * opens one. transition-none because the badge's own CSS transition eases
 * opacity and transform, and a CSS transition under a Motion one lags a frame
 * behind it.
 */
export function CountBadge({
  count,
  hidden = false,
}: {
  count: number;
  /** For a control whose own name already carries the count. */
  hidden?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {count > 0 && (
          <Badge
            key="count"
            asChild
            variant="secondary"
            aria-hidden={hidden || undefined}
            className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums transition-none"
          >
            <m.span
              initial={HIDDEN}
              animate={SHOWN}
              exit={HIDDEN}
              transition={shouldReduceMotion ? { duration: 0 } : FADE}
            >
              <CountRoll value={count} />
            </m.span>
          </Badge>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
