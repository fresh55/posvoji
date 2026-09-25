"use client";

import { m } from "motion/react";
import type { TargetAndTransition, Transition } from "motion/react";
import {
  CAT_EYES,
  CAT_HEAD,
  CAT_NOSE,
  DOG_BODY,
  DOG_EYES,
  DOG_NOSE,
} from "@/components/filters/animal-glyph-paths";
import type { GoodWithKey } from "@/lib/filters";
import { cn } from "@/lib/utils";

// The three household icons, carried as paths instead of drawn by the lucide
// components, split into the parts that have to move on their own: a face
// cannot laugh and a pair of ears cannot flop while the icon is one rigid
// shape. Same viewBox, same stroke, so the resting glyph is the icon it was.
//
// The dog and the cat come from animal-glyph-paths.ts, because the species
// tabs draw the same two animals and one drawing kept in one place is what
// stops the pair drifting apart. The baby is only ever drawn here.
//
// The one edit to the geometry is the dog's ears: Lucide draws both of them
// and the crown between them as a single stroke (DOG_EARS), so it is cut into
// three here at the points where the original changes direction. The cut ends
// sit under each other's round caps, which is why the seam does not show.

export type GoodWithGesture = "rest" | "celebrate";

const BABY_HEAD =
  "M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1";
const BABY_EYES = ["M9 12h.01", "M15 12h.01"];
const BABY_MOUTH = "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5";

const DOG_CROWN = "M10.151 5.235A7.497 7.497 0 0 1 14 5.277";
const DOG_EAR_LEFT =
  "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235";
const DOG_EAR_RIGHT =
  "M14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5";

const REST = { rotate: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 } as const;
// Where a part comes back to, whether it is a pick cut short by another
// facet's pick or an unpick, or a hover preview the pointer left. Instant
// used to sit here, and a remounted key threw the live value away on every
// return; kept mounted, this now has an actual value to ease from. easeIn
// keeps the first frame after the interrupt small, which is what the click's
// own uneven sampling in that window otherwise turns into a visible step.
const RETURN_TRANSITION: Transition = { duration: 0.2, ease: "easeIn" };

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

// Every animated part answers the same question: act, sit at rest, or answer
// a hover with a taste of the act. The keyframes carry their own starting
// frame, so nothing here sets `initial`.
function acts(
  celebrating: boolean,
  keyframes: TargetAndTransition,
  transition: Transition,
) {
  return {
    animate: celebrating ? keyframes : REST,
    transition: celebrating ? transition : RETURN_TRANSITION,
  };
}

// The same question for the one part per facet that has something to preview.
// A pick and a preview never overlap (celebrating only ever happens on a
// checked card, previewing only on one that is not), so there is no ordering
// to argue about between them, just three answers in place of acts' two.
function actsWithPreview(
  celebrating: boolean,
  previewing: boolean,
  keyframes: TargetAndTransition,
  transition: Transition,
  preview: TargetAndTransition,
  previewTransition: Transition,
) {
  if (celebrating) return { animate: keyframes, transition };
  if (previewing) return { animate: preview, transition: previewTransition };
  return { animate: REST, transition: RETURN_TRANSITION };
}

function GlyphRoot({
  facet,
  dead,
  previewing,
  className,
  children,
}: {
  facet: GoodWithKey;
  /** No animals left to show for this option: the face goes to sleep rather
   *  than standing upright with nothing to say. CSS only, so an option
   *  nobody is looking at costs nothing to draw this way. */
  dead?: boolean;
  /** Not read for styling: a plain seam so a test can tell the gating logic
   *  (mouse only, not a checked or dead card, settled after a click) ran,
   *  without asserting on the animated pose it leads to. */
  previewing?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      data-good-with-glyph={facet}
      data-preview={previewing ? "true" : undefined}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", dead && "translate-y-0.5 opacity-60", className)}
    >
      {children}
    </svg>
  );
}

// The pose a dead option's eyes hold: the same closed-eye shape the cat's own
// blink closes to, scaled down rather than swapped for a different mark, so
// three different eye shapes all read as one thing (asleep). Plain CSS, not
// a motion target: a dead option never celebrates, so there is nothing here
// for a transition to interrupt.
const DEAD_EYE_STYLE = { transformBox: "fill-box", transformOrigin: "50% 50%" } as const;
const DEAD_EYE_CLASS = "scale-y-[0.08]";

// A third of the mouth's own overshoot (0.35/0.25 at the laugh's peak),
// held rather than played through and back: a smile offered before the
// question is answered, not the laugh itself.
const MOUTH_PREVIEW = { scaleX: 1.12, scaleY: 1.08 };
const MOUTH_PREVIEW_TRANSITION: Transition = { duration: 0.22, ease: "easeOut" };

// The child hears the answer and laughs: the head tips over, the eyes squeeze
// shut through the middle of it and the mouth pulls wide. The mouth is the part
// that makes it read as a laugh rather than a nod.
function KidsGlyph({
  celebrating,
  previewing,
  dead,
  className,
}: {
  celebrating: boolean;
  previewing: boolean;
  dead: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="kids" dead={dead} previewing={previewing} className={className}>
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
            drawn by blinking them out while the mouth is at its widest. A
            dead option closes them instead, plain CSS in place of the blink. */}
        {BABY_EYES.map((d) =>
          dead ? (
            <path key={d} d={d} style={DEAD_EYE_STYLE} className={DEAD_EYE_CLASS} />
          ) : (
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
          ),
        )}
        <m.path
          d={BABY_MOUTH}
          style={partStyle("50% 50%")}
          {...actsWithPreview(
            celebrating,
            previewing,
            { scaleX: [1, 1.35, 1], scaleY: [1, 1.25, 1] },
            { duration: KIDS, ease: "easeOut" },
            MOUTH_PREVIEW,
            MOUTH_PREVIEW_TRANSITION,
          )}
        />
      </m.g>
    </GlyphRoot>
  );
}

// A third of the ears' own -34/+34 swing (the first and biggest move of the
// pick), held up rather than played through the bounce: a dog that has
// noticed, not one that has heard its name yet.
const EAR_PREVIEW_LEFT = { rotate: -11 };
const EAR_PREVIEW_RIGHT = { rotate: 11 };
const EAR_PREVIEW_TRANSITION: Transition = { duration: 0.2, ease: "easeOut" };

// The dog hears its own name: both ears fly up and drop back with a damped
// bounce, and the head lifts a little under them.
function DogsGlyph({
  celebrating,
  previewing,
  dead,
  className,
}: {
  celebrating: boolean;
  previewing: boolean;
  dead: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="dogs" dead={dead} previewing={previewing} className={className}>
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
          {...actsWithPreview(
            celebrating,
            previewing,
            { rotate: [0, -34, 12, -8, 3, 0] },
            { duration: DOGS, ease: "easeOut" },
            EAR_PREVIEW_LEFT,
            EAR_PREVIEW_TRANSITION,
          )}
        />
        <m.path
          d={DOG_EAR_RIGHT}
          style={partStyle("10% 90%")}
          {...actsWithPreview(
            celebrating,
            previewing,
            { rotate: [0, 34, -12, 8, -3, 0] },
            { duration: DOGS, ease: "easeOut" },
            EAR_PREVIEW_RIGHT,
            EAR_PREVIEW_TRANSITION,
          )}
        />
        {/* A dead option closes these; otherwise they never move on their
            own, so there is nothing to hand a gesture to. */}
        {DOG_EYES.map((d) => (
          <path
            key={d}
            d={d}
            style={dead ? DEAD_EYE_STYLE : undefined}
            className={dead ? DEAD_EYE_CLASS : undefined}
          />
        ))}
        <path d={DOG_NOSE} />
      </m.g>
    </GlyphRoot>
  );
}

// A third of the head's own tilt (3.5 degrees at the blink's hold), held
// rather than played through: ears up, watching, before the slow blink
// answers. Slower to arrive than the dog's or the child's preview, because
// unhurried is this animal's whole character.
const HEAD_PREVIEW = { rotate: 1.2 };
const HEAD_PREVIEW_TRANSITION: Transition = { duration: 0.4, ease: "easeOut" };

// The slow blink is how a cat says yes, so it is deliberately unhurried: the
// head tips, the eyes close near the middle and stay closed for a beat.
function CatsGlyph({
  celebrating,
  previewing,
  dead,
  className,
}: {
  celebrating: boolean;
  previewing: boolean;
  dead: boolean;
  className?: string;
}) {
  return (
    <GlyphRoot facet="cats" dead={dead} previewing={previewing} className={className}>
      <m.g
        style={partStyle("50% 90%")}
        {...actsWithPreview(
          celebrating,
          previewing,
          { rotate: [0, 3.5, 3.5, 0] },
          { duration: CATS, times: [0, 0.25, 0.7, 1], ease: "easeInOut" },
          HEAD_PREVIEW,
          HEAD_PREVIEW_TRANSITION,
        )}
      >
        <path d={CAT_HEAD} />
        {CAT_EYES.map((d) =>
          dead ? (
            <path key={d} d={d} style={DEAD_EYE_STYLE} className={DEAD_EYE_CLASS} />
          ) : (
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
          ),
        )}
        <path d={CAT_NOSE} />
      </m.g>
    </GlyphRoot>
  );
}

const GLYPHS: Record<
  GoodWithKey,
  (props: {
    celebrating: boolean;
    previewing: boolean;
    dead: boolean;
    className?: string;
  }) => React.ReactElement
> = {
  kids: KidsGlyph,
  dogs: DogsGlyph,
  cats: CatsGlyph,
};

export function GoodWithGlyph({
  facet,
  gesture,
  previewing = false,
  dead = false,
  shouldReduceMotion = false,
  className,
}: {
  facet: GoodWithKey;
  gesture: GoodWithGesture;
  /** Answers a hover with a taste of the pick gesture, held rather than
   *  played through. The caller keeps this off a checked or celebrating
   *  card, so it and `gesture: "celebrate"` never have to argue about which
   *  one wins. */
  previewing?: boolean;
  /** No animals left to show for this option: the face goes to sleep. */
  dead?: boolean;
  shouldReduceMotion?: boolean;
  className?: string;
}) {
  const Glyph = GLYPHS[facet];
  return (
    <Glyph
      celebrating={gesture === "celebrate" && !shouldReduceMotion}
      previewing={previewing && !shouldReduceMotion}
      dead={dead}
      className={className}
    />
  );
}
