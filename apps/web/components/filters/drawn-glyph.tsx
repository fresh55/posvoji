"use client";

import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** How a section's drawing inks in: how long each stroke takes, how far apart
 *  the strokes start, and how long the accent takes to fade on the way out. */
export type DrawTempo = { draw: number; stagger: number; fade: number };

/**
 * Two layers of one line drawing: a muted outline that is always there, and
 * an accent copy that draws itself on stroke by stroke when the card is
 * chosen. Lahko ponudim and V zavetišču both draw this way at their own tempo.
 *
 * `rest` and `lit` carry what is not a stroke, drawn under the muted outline
 * and inside the accent layer; V zavetišču's sand is both. `lit` is handed the
 * delay a reset holds the layer back by, so what it animates leaves in turn.
 */
export function DrawnGlyph({
  strokes,
  checked,
  resetDelay,
  tempo,
  className,
  rest,
  lit,
}: {
  strokes: readonly string[];
  checked: boolean;
  /** Holds the drawing back so a reset empties the section in order. */
  resetDelay: number;
  tempo: DrawTempo;
  className: string;
  rest?: ReactNode;
  lit?: (wait: number) => ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();
  // The whole retract waits its turn, fade and drawn length together, so the
  // section empties one row at a time. The delay used to stop at the icon
  // well's halo and never reach the drawing inside it, so the halos winked out
  // in order over drawings that had all gone grey at once.
  const wait = shouldReduceMotion || checked ? 0 : resetDelay;

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g className="text-muted-foreground">
        <g stroke="currentColor">
          {strokes.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {rest}
      </g>
      <m.g
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={{
          duration: shouldReduceMotion || checked ? 0 : tempo.fade,
          delay: wait,
          ease: "easeOut",
        }}
      >
        <g stroke="var(--brand-strong)">
          {strokes.map((d, index) => (
            <m.path
              key={d}
              d={d}
              initial={false}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : checked
                    ? {
                        duration: tempo.draw,
                        delay: index * tempo.stagger,
                        ease: "easeOut",
                      }
                    : // The drawn length drops only once the layer has faded
                      // out, so letting go never runs the draw backwards.
                      { duration: 0, delay: wait + tempo.fade }
              }
            />
          ))}
        </g>
        {lit?.(wait)}
      </m.g>
    </svg>
  );
}
