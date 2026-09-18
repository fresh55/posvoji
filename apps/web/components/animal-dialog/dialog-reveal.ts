import { PHOTO_MORPH_MS } from "@/lib/photo-morph";
import type { Transition } from "motion/react";
import { NO_FADE } from "./fan-options";

/**
 * When the card under the photographs arrives, and what the opening commit
 * holds back until it can.
 *
 * A plain module beside fan-options.ts, which holds the same answers for the
 * fan: these are decisions about one open, they are read by the dialog and
 * pinned by its tests, and a component module marked "use client" is the wrong
 * place to reach into for either.
 */

// The last third of the morph, as one fade for the whole of the card.
//
// It used to be five children 40ms apart on a spring, which at the same moment
// as a flying copy, a zooming box and a cascading fan read as a ripple through
// the text rather than as a reveal. One subject at a time: for the length of
// the morph only the photograph moves, and the words follow it in.
const CARD_REVEAL = {
  duration: 0.2,
  delay: (PHOTO_MORPH_MS / 1000) * 0.66,
  ease: "easeOut",
} as const;

// The same fade with nothing to wait for. The delay above is the photograph's
// trip, so it belongs to the opens that have one: a deep link, an animal with
// no photograph and a browser without the API all open with nothing
// travelling, and there the delay is a fifth of a second of empty card under
// the photos.
const CARD_FADE = { ...CARD_REVEAL, delay: 0 } as const;

/** How the card under the photographs arrives, which is a question about this
 *  open and not about the dialog: see CARD_REVEAL and CARD_FADE. Where less
 *  movement was asked for the card is simply there, which is the fan's NO_FADE:
 *  one answer for everything this dialog mounts without drawing it in.
 *
 *  `spent` is how much of that wait has already gone by, in seconds. The card
 *  is held at nothing until what is in it has been drawn (see cardArrivesLate
 *  below), and on a phone that is a render of its own, some tens of
 *  milliseconds after the open. Counted from the render that starts the fade
 *  rather than from the open, those milliseconds would be added to the wait
 *  instead of spent inside it, and the card would arrive after the photograph
 *  had already landed. */
export function cardRevealTransition(
  reduced: boolean,
  morphing: boolean,
  spent = 0,
): Transition {
  if (reduced) return NO_FADE;
  if (!morphing) return CARD_FADE;
  return { ...CARD_REVEAL, delay: Math.max(0, CARD_REVEAL.delay - spent) };
}

/** Whether this open draws the card's facts and shelter block in a render of
 *  its own rather than in the commit the click is holding.
 *
 *  Under a morph, because that is the only open where the card is invisible
 *  for long enough to fill it without anyone seeing: the first two thirds of
 *  the morph are the photograph travelling with nothing under it. A deep link,
 *  a step to another animal, an animal with no photograph, a browser without
 *  the API and a visitor who asked for less movement all draw the card
 *  straight away, and nothing may be held back from a commit that would have
 *  drawn it.
 *
 *  And on the phone, because that is where holding it back costs no layout.
 *  The shell is anchored at the top of the screen with the photographs above
 *  the card, so what the card holds cannot move them. The desktop box is
 *  centred and as tall as its content, so it can: measured on the built export
 *  at 1280x800, a card drawn without those two blocks stands its front print
 *  162 to 171px lower, and the morph is aimed at where that print was when the
 *  update returned. It is also the layout where the freeze is smallest. */
export function cardArrivesLate(
  morphing: boolean,
  phoneShell: boolean,
): boolean {
  return morphing && phoneShell;
}
