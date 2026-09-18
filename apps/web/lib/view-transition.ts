"use client";

import { PHOTO_MORPH_MARK, PHOTO_TRANSITION_NAME } from "@/lib/photo-morph";
import { REDUCED_MOTION_QUERY } from "@/lib/viewport-queries";
import { flushSync } from "react-dom";

/**
 * The card's photograph travelling into the dialog, and back out of it.
 *
 * The browser does the carrying. Both boxes wear one view-transition-name, and
 * between the old state and the new one the platform morphs the first box into
 * the second on the compositor, the aspect included. What this file owns is the
 * running morph and the rule that the update has to be flushed before the
 * callback returns; the name, the duration and the mark are in
 * lib/photo-morph.ts, which the plain modules beside the dialog read too.
 */

// Handed on from there, so a client module that runs a morph and states its
// length has one import rather than two.
export {
  PHOTO_MORPH_MARK,
  PHOTO_MORPH_MS,
  PHOTO_TRANSITION_NAME,
} from "@/lib/photo-morph";

/** The morph this module started last: the box it named and which way the
 *  photograph is going. One record, because nothing sets either without the
 *  other and `done` is the only thing that clears them.
 *
 *  A press during a morph starts a second one: the pseudo-elements take no
 *  pointer events and the grid underneath is live, so a card clicked during the
 *  320ms close, or an Escape during the open, is an ordinary gesture. Two
 *  things follow from that. The browser rejects the first transition, and that
 *  rejection used to run the first morph's cleanup over the second morph's
 *  state, leaving the open unscoped with the dialog zooming out of the card;
 *  `done` compares identities to stop it, and an identity rather than a counter
 *  means there is nothing to reset. And the morph being taken over may have
 *  named a box nothing will clean up any more: the close puts the name on the
 *  card inside its own update and that cleanup is the only thing that ever
 *  removes it, so the card the photograph had just gone back into kept the name
 *  for the life of the page. Two elements then wear it on the next open, which
 *  is a transition the browser skips, and every one after it, and a real
 *  navigation lifts that card out of the page's own snapshot. */
let current: { photo: HTMLElement; direction: "open" | "close" } | null = null;

/** Whether the photo can be carried at all: the API, and a visitor who has not
 *  asked for less movement. Everything else falls back to the dialog's own fade
 *  and zoom out of the card's centre. */
export function canMorphPhoto(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** Which way a morph is going at this moment, or null while none is running.
 *
 *  The session above and not the mark on the document. This is asked from
 *  inside the transition's own flush, where the session is live, and a render
 *  has no business reading the document to find out what it is being mounted
 *  by.
 *
 *  Two callers. The dialog's `opened` record asks at the mount, because a morph
 *  is the only open where the card stands invisible for long enough to be
 *  filled out of sight (dialog-reveal.ts). And the close's focus restore asks
 *  whether the photograph is on its way back to the card it is about to focus,
 *  because a close with nothing travelling has to scroll that card into view
 *  and one with a morph must not, the scroll being a state the snapshot either
 *  side of the update would carry. */
export function morphInProgress(): "open" | "close" | null {
  return current?.direction ?? null;
}

/**
 * Runs `update` as a view transition with `photo` named as the box that
 * travels.
 *
 * Which half of the morph that box is follows from `direction`, and no other
 * pairing works. On the way in it is the box the photograph leaves from, named
 * before the update and cleared inside it, because by then the dialog's own
 * front print is wearing the name. On the way out it is the box the photograph
 * lands in, named inside the update for the same reason from the other end.
 *
 * The update is flushed rather than scheduled: the browser takes the new
 * snapshot the moment this callback returns, so a render React has not
 * committed yet is a state the morph never sees.
 */
export function morphPhoto({
  photo,
  direction,
  update,
}: {
  photo: HTMLElement;
  direction: "open" | "close";
  update: () => void;
}): void {
  const at = direction === "open" ? "old" : "new";
  const root = document.documentElement;
  const wear = (on: boolean) => {
    if (on) {
      photo.style.setProperty("view-transition-name", PHOTO_TRANSITION_NAME);
    } else {
      photo.style.removeProperty("view-transition-name");
    }
  };

  // Whatever the morph this one is taking over from left named, if that was
  // some other element: its own cleanup will not run any more.
  if (current && current.photo !== photo) {
    current.photo.style.removeProperty("view-transition-name");
  }

  root.setAttribute(PHOTO_MORPH_MARK, direction);
  if (at === "old") wear(true);

  const token = (current = { photo, direction });
  const done = () => {
    // Only for the morph that is still the current one; see `current` above.
    if (current !== token) return;
    current = null;
    wear(false);
    root.removeAttribute(PHOTO_MORPH_MARK);
  };

  try {
    const transition = document.startViewTransition(() => {
      // Named before the update and not after it. The old state was captured
      // before this callback ran, so the card's own name has no job inside it,
      // while the flush below is where the dialog's front print mounts wearing
      // the same name and where Radix runs its autofocus and its scroll lock.
      wear(at === "new");
      flushSync(update);
    });
    // Both ways round. A transition the browser skips, or one a second gesture
    // takes over, rejects this promise, and the name and the mark have to come
    // off either way or the next morph is skipped too.
    transition.finished.then(done, done);
  } catch (error) {
    // Only a synchronous throw from startViewTransition itself, since the
    // browser calls the update on its own schedule: a throw from inside the
    // update rejects `finished`, and the handler above cleans up. Under a stub
    // that runs the update in place it covers that throw as well. Either way
    // nothing would be subscribed to take the mark off: the dialog would never
    // zoom again and the print would keep its name across navigations. The
    // update is the caller's own render, so it is their throw to see.
    done();
    throw error;
  }
}
