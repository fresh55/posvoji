import type { Transition } from "motion/react";
import { PHOTO_MORPH_MS } from "@/lib/view-transition";

// Only constants may be taken from that module here. It is "use client", and a
// server import of one would receive a client-reference proxy: the lead below
// is computed at module scope, so it would throw while the page is being
// built rather than in anything a test runs.

export const ENTRANCE_STAGGER = 0.04;

// What the whole cascade waits for: the browser carrying the card's
// photograph into the front seat, which is PHOTO_MORPH_MS long
// (lib/view-transition.ts). The side prints used to come in under it, so at
// the moment the visitor was watching one photograph land, four more were
// sliding out from behind it. They arrive after it instead.
//
// A fixed wait rather than the transition's own promise: the fan is mounted by
// a render inside that transition and has no handle on it, and the number is
// the one the stylesheet draws. What the wait is not is unconditional; see
// printEntrance below.
export const ENTRANCE_LEAD = PHOTO_MORPH_MS / 1000;

// A fixed nudge per photo keeps the fan from looking machine cut. It is picked
// by position, never at random, so the same animal always fans out the same.
export const TILT_NUDGE = [0, -1.2, 0.8, -0.6, 1.4];

// A flick this much harder than the one that turns a photo carries two of
// them. The fan's own number, and the one thing about its swipe that no other
// surface shares: well past the SWIPE_VELOCITY_PX_MS that commits a step, so
// it is a gesture somebody meant rather than an ordinary swipe that ran fast.
// Two and never more: past that a flick would be a scrub, and the fan has no
// scrub. Only for a set the fan cannot show at once, because on a short one
// two steps walk past the whole thing and back.
export const FLICK_TWO_PX_MS = 1.4;

// How a print that arrives or leaves mid-walk is drawn in and out. A tween and
// not a spring: nothing about it is a movement, it is a photograph being
// shown or taken away, and the walk it happens inside of is already carrying
// every other print. Short enough to be over before the fan settles.
export const MOUNT_FADE: Transition = { duration: 0.15, ease: "easeOut" };

// What the same thing is where motion was asked for none: the print is simply
// there, or gone.
export const NO_FADE: Transition = { duration: 0 };

/**
 * Which of the fan's prints are drawn, and how they arrive.
 *
 * "front" is the commit the visitor is waiting on where the browser is
 * carrying the card's photograph in: the print that photograph lands in, and
 * nothing else. It is not drawn in at all, because what arrives there is the
 * photograph and a fade under it would be a second photo appearing behind the
 * one already landing. The four seats behind it are not drawn for the length
 * of the lead, so they are not mounted either; mounting them was most of a
 * synchronous commit that a mid-range phone spent half a second on, and what
 * it bought was four motion elements standing invisible behind a photograph.
 *
 * "sides" is the lead being up. They cascade in where they always did, which
 * is why the delay here is the stagger alone: the lead has already been waited
 * out by the timer that moved the fan into this phase.
 *
 * "settled" is the fan working: every print is mounted and a print that steps
 * into the window arrives mid-walk, where a cascade delay would have it appear
 * after the fan had already stopped moving, so it is a plain fade. It used to
 * be drawn at full opacity in one frame, which on a gallery past the fan's
 * reach was a photograph switching on at the leading tier as the step landed.
 *
 * It is also where a fan with nothing travelling starts, and that is the whole
 * of what the lead is gated on. A step to the next animal (the fan is keyed by
 * the animal, so each step is a fresh mount), a deep link, an animal with no
 * photograph, a browser without the API and a visitor who asked for less
 * movement all mount a fan nothing is being carried into: there the front
 * print would snap in at full strength and the rest would stand out a third of
 * a second beside it on an empty stage. They fade in together instead, and
 * nothing is held back from a commit that would have drawn it.
 */
export type FanMount = "front" | "sides" | "settled";

export function printEntrance({
  mount,
  reduced,
  active,
  offset,
  fresh,
}: {
  mount: FanMount;
  reduced: boolean;
  /** Whether this is the print in front. */
  active: boolean;
  /** Its seat, counted from the front one. */
  offset: number;
  /** Whether this print is drawn under a key nothing was drawn under before. */
  fresh: boolean;
}): number | "fade" | false {
  if (reduced) return false;
  if (mount === "front") return false;
  if (mount === "sides") {
    return active ? false : Math.abs(offset) * ENTRANCE_STAGGER;
  }
  return fresh ? "fade" : false;
}
