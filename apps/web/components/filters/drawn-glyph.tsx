"use client";

import { m, useReducedMotion } from "motion/react";

/**
 * Drawing one stroke in: the length is the gesture, the opacity only takes the
 * stroke away while none of it is drawn yet. A pathLength of 0 with a round
 * cap still paints a dot, so a stroke waiting for its turn needs the switch.
 *
 * Both on one transition, which is what the energy glyphs do, faded the whole
 * stroke up over the draw's own duration and the wash of colour arrived ahead
 * of the tip. The draws there run 0.2s, where the two are the same event; a
 * long coat runs 0.46 and they are not. Opacity is the switch and pathLength
 * is the animation. The coat strands, the Spol signs and DrawnGlyph all draw
 * this way.
 */
export const DRAW_IN = (duration: number, delay: number) => ({
  pathLength: { duration, delay, ease: "easeOut" as const },
  opacity: { duration: 0.08, delay },
});

/** How a section's drawing inks in: how long each stroke takes, how far apart
 *  the strokes start, and how long the accent takes to fade on the way out. */
export type DrawTempo = { draw: number; stagger: number; fade: number };

/**
 * Two layers of one line drawing: a muted outline that is always there, and
 * an accent copy that draws itself on stroke by stroke when the card is
 * chosen. Lahko ponudim draws this way.
 */
export function DrawnGlyph({
  strokes,
  checked,
  resetDelay,
  tempo,
  className,
}: {
  strokes: readonly string[];
  checked: boolean;
  /** Holds the drawing back so a reset empties the section in order. */
  resetDelay: number;
  tempo: DrawTempo;
  className: string;
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
      <g className="text-muted-foreground" stroke="currentColor">
        {strokes.map((d) => (
          <path key={d} d={d} />
        ))}
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
              // A stroke waiting for its turn is hidden, not a round-cap dot.
              animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : checked
                    ? DRAW_IN(tempo.draw, index * tempo.stagger)
                    : // The drawn length drops only once the layer has faded
                      // out, so letting go never runs the draw backwards.
                      { duration: 0, delay: wait + tempo.fade }
              }
            />
          ))}
        </g>
      </m.g>
    </svg>
  );
}
