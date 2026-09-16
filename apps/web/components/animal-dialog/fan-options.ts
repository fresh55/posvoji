import type { Transition } from "motion/react";

export const ENTRANCE_STAGGER = 0.04;

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
