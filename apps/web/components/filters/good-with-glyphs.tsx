"use client";

import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import type { GoodWithKey } from "@/lib/filters";
import { cn } from "@/lib/utils";

// The three household icons, carried here as paths instead of drawn by the
// lucide components. The geometry is Lucide's Baby, Dog and Cat (lucide-react,
// ISC license), split into the parts that have to move on their own: a face
// cannot laugh and a pair of ears cannot flop while the icon is one rigid
// shape. Same viewBox, same stroke, so the resting glyph is the icon it was.
//
// The one edit to the geometry is the dog: Lucide draws both ears and the
// crown between them as a single stroke, so it is cut into three at the points
// where the original changes direction. The cut ends sit under each other's
// round caps, which is why the seam does not show.

export type GoodWithGesture = "rest" | "celebrate";

const BABY_HEAD =
  "M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1";
const BABY_EYES = ["M9 12h.01", "M15 12h.01"];
const BABY_MOUTH = "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5";

const DOG_BODY =
  "M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309";
const DOG_CROWN = "M10.151 5.235A7.497 7.497 0 0 1 14 5.277";
const DOG_EAR_LEFT =
  "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235";
const DOG_EAR_RIGHT =
  "M14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5";
const DOG_EYES = ["M8 14v.5", "M16 14v.5"];
const DOG_NOSE = "M11.25 16.25h1.5L12 17z";

const CAT_HEAD =
  "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z";
const CAT_EYES = ["M8 14v.5", "M16 14v.5"];
const CAT_NOSE = "M11.25 16.25h1.5L12 17l-.75-.75Z";

const REST = { rotate: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 } as const;
const INSTANT: Transition = { duration: 0 };

// How long each glyph acts for. Exported so a caller holding the celebration
// open can outlast the gesture instead of hard-coding a number that drifts
// when the choreography changes.
export const GOOD_WITH_GESTURE_SECONDS: Record<GoodWithKey, number> = {
  kids: 0.55,
  dogs: 0.6,
  cats: 0.85,
};

export const LONGEST_GOOD_WITH_GESTURE_MS = Math.round(
  Math.max(...Object.values(GOOD_WITH_GESTURE_SECONDS)) * 1000,
);

const { kids: KIDS, dogs: DOGS, cats: CATS } = GOOD_WITH_GESTURE_SECONDS;

// A part that only ever sits still still needs the fill-box origin, so that
// switching it on mid-gesture does not move it.
function partStyle(transformOrigin: string) {
  return { transformBox: "fill-box", transformOrigin } as const;
}

// Every animated part answers the same question: act, or sit at rest. The
// keyframes carry their own starting frame, so nothing here sets `initial`.
function acts(
  celebrating: boolean,
  keyframes: TargetAndTransition,
  transition: Transition,
) {
  return {
    animate: celebrating ? keyframes : REST,
    transition: celebrating ? transition : INSTANT,
  };
}

function GlyphRoot({
  facet,
  className,
  children,
}: {
  facet: GoodWithKey;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      data-good-with-glyph={facet}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

// The child hears the answer and laughs: the head tips over, the eyes squeeze
// shut through the middle of it and the mouth pulls wide. The mouth is the part
// that makes it read as a laugh rather than a nod.
function KidsGlyph({
  celebrating,
  className,
}: {
  celebrating: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="kids" className={className}>
      <m.g
        style={partStyle("50% 70%")}
        {...acts(
          celebrating,
          { rotate: [0, -5, 4, -2, 0], y: [0, -0.8, 0.4, -0.3, 0] },
          { duration: KIDS, ease: "easeOut" },
        )}
      >
        <path d={BABY_HEAD} />
        {/* The eyes are dot strokes with no height to scale, so a squeeze is
            drawn by blinking them out while the mouth is at its widest. */}
        {BABY_EYES.map((d) => (
          <m.path
            key={d}
            d={d}
            {...acts(
              celebrating,
              { opacity: [1, 1, 0, 0, 1, 1] },
              {
                duration: KIDS,
                times: [0, 0.15, 0.3, 0.55, 0.8, 1],
                ease: "easeOut",
              },
            )}
          />
        ))}
        <m.path
          d={BABY_MOUTH}
          style={partStyle("50% 50%")}
          {...acts(
            celebrating,
            { scaleX: [1, 1.35, 1], scaleY: [1, 1.25, 1] },
            { duration: KIDS, ease: "easeOut" },
          )}
        />
      </m.g>
    </GlyphRoot>
  );
}

// The dog hears its own name: both ears fly up and drop back with a damped
// bounce, and the head lifts a little under them.
function DogsGlyph({
  celebrating,
  className,
}: {
  celebrating: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="dogs" className={className}>
      <m.g
        style={partStyle("50% 90%")}
        {...acts(
          celebrating,
          { y: [0, -2, 0.5, 0] },
          { duration: DOGS, ease: "easeOut" },
        )}
      >
        <path d={DOG_BODY} />
        <path d={DOG_CROWN} />
        <m.path
          d={DOG_EAR_LEFT}
          // The base of the ear, where it meets the crown, is the hinge.
          style={partStyle("90% 90%")}
          {...acts(
            celebrating,
            { rotate: [0, -34, 12, -8, 3, 0] },
            { duration: DOGS, ease: "easeOut" },
          )}
        />
        <m.path
          d={DOG_EAR_RIGHT}
          style={partStyle("10% 90%")}
          {...acts(
            celebrating,
            { rotate: [0, 34, -12, 8, -3, 0] },
            { duration: DOGS, ease: "easeOut" },
          )}
        />
        {DOG_EYES.map((d) => (
          <path key={d} d={d} />
        ))}
        <path d={DOG_NOSE} />
      </m.g>
    </GlyphRoot>
  );
}

// The slow blink is how a cat says yes, so it is deliberately unhurried: the
// head tips, the eyes close near the middle and stay closed for a beat.
function CatsGlyph({
  celebrating,
  className,
}: {
  celebrating: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="cats" className={className}>
      <m.g
        style={partStyle("50% 90%")}
        {...acts(
          celebrating,
          { rotate: [0, 3.5, 3.5, 0] },
          { duration: CATS, times: [0, 0.25, 0.7, 1], ease: "easeInOut" },
        )}
      >
        <path d={CAT_HEAD} />
        {CAT_EYES.map((d) => (
          <m.path
            key={d}
            d={d}
            style={partStyle("50% 50%")}
            {...acts(
              celebrating,
              { scaleY: [1, 1, 0.08, 0.08, 1] },
              {
                duration: CATS,
                times: [0, 0.3, 0.42, 0.62, 1],
                ease: "easeInOut",
              },
            )}
          />
        ))}
        <path d={CAT_NOSE} />
      </m.g>
    </GlyphRoot>
  );
}

const GLYPHS: Record<
  GoodWithKey,
  (props: { celebrating: boolean; className?: string }) => React.ReactElement
> = {
  kids: KidsGlyph,
  dogs: DogsGlyph,
  cats: CatsGlyph,
};

export function GoodWithGlyph({
  facet,
  gesture,
  shouldReduceMotion = false,
  className,
}: {
  facet: GoodWithKey;
  gesture: GoodWithGesture;
  shouldReduceMotion?: boolean;
  className?: string;
}) {
  const Glyph = GLYPHS[facet];
  return (
    <Glyph
      celebrating={gesture === "celebrate" && !shouldReduceMotion}
      className={className}
    />
  );
}
