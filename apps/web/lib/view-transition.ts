"use client";

import { flushSync } from "react-dom";

/**
 * The card's photograph travelling into the dialog, and back out of it.
 *
 * The browser does the carrying. Both boxes wear one view-transition-name, and
 * between the old state and the new one the platform morphs the first box into
 * the second on the compositor, the aspect included. What this file owns is the
 * name, the mark the stylesheet reads, and the rule that the update has to be
 * flushed before the callback returns.
 */

/** The name the two boxes share. The card's photo frame wears it for the
 *  moment the dialog opens, the fan's front print wears it for as long as it is
 *  the front print (fan-photo.tsx), and the card wears it again on the way
 *  back. Two elements wearing it in the same state make the browser skip the
 *  transition, which is why every caller here takes it off. */
export const PHOTO_TRANSITION_NAME = "animal-photo";

/** How long the morph runs. globals.css states the same number, which is the
 *  one that draws; this is what everything waiting for the photo to land is
 *  timed against. */
export const PHOTO_MORPH_MS = 320;

/** Marks the document while a morph is running, so the dialog's own zoom and
 *  the root crossfade can stand aside for it (globals.css). The value says
 *  which way the photo is going, because only the close needs the root to
 *  crossfade. */
const MORPH_MARK = "data-photo-morph";

/** The morph this module started last, and the only one whose cleanup may run.
 *
 *  A press during a morph starts a second one: the pseudo-elements take no
 *  pointer events and the grid underneath is live, so a card clicked during
 *  the 320ms close, or an Escape during the open, is an ordinary gesture. The
 *  browser then rejects the first transition's `finished`, and that rejection
 *  used to run the first morph's cleanup over the second morph's state: the
 *  mark and the inline name came off the transition that had just started, and
 *  the open ran unscoped with the dialog zooming out of the card. Identity
 *  rather than a counter, so there is nothing to reset. */
let current: object | null = null;

/** The element the last morph named, so a morph that takes over from another
 *  can take that one's name off.
 *
 *  The guard above stops a superseded morph's cleanup from running, and on the
 *  close that cleanup is the only thing that ever removes the name: it is put
 *  on the card inside the update. A card clicked during the 320ms close
 *  therefore left the name on the card the photograph had just gone back into,
 *  for the life of the page. Two elements then wear it on the next open, which
 *  is a transition the browser skips, and every one after it, and a real
 *  navigation lifts that card out of the page's own snapshot. */
let named: HTMLElement | null = null;

/** Whether the photo can be carried at all: the API, and a visitor who has not
 *  asked for less movement. Everything else falls back to the dialog's own fade
 *  and zoom out of the card's centre. */
export function canMorphPhoto(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Which way a morph is going at this moment, or null while none is running.
 *
 *  The mark is written before the transition starts and taken off when it has
 *  finished, so anything mounted by the render inside the update can ask
 *  whether its own arrival is being carried by one. Two things wait on the
 *  photograph and must not wait on anything else: the fan holds its side
 *  prints back until it has landed (fan-options.ts), and the dialog's card
 *  fades in behind it (animal-dialog.tsx). A step to the next animal, a deep
 *  link, an animal with no photograph, a browser without the API and a visitor
 *  who asked for less movement all mount the same components with nothing
 *  travelling, and there both waits are a third of a second of empty stage.
 *
 *  Asked once, at the mount. The mark is gone before either wait is over. */
export function morphInProgress(): "open" | "close" | null {
  if (typeof document === "undefined") return null;
  const mark = document.documentElement.getAttribute(MORPH_MARK);
  return mark === "open" || mark === "close" ? mark : null;
}

/**
 * Runs `update` as a view transition with `photo` named as the box that
 * travels.
 *
 * `at` says which half of the morph that box is. "old" is the box the photo
 * leaves from, named before the update and cleared inside it, because by then
 * the dialog's own front print is wearing the name. "new" is the box it lands
 * in, named inside the update for the same reason from the other end.
 *
 * The update is flushed rather than scheduled: the browser takes the new
 * snapshot the moment this callback returns, so a render React has not
 * committed yet is a state the morph never sees.
 */
export function morphPhoto({
  photo,
  at,
  direction,
  update,
}: {
  photo: HTMLElement;
  at: "old" | "new";
  direction: "open" | "close";
  update: () => void;
}): void {
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
  if (named && named !== photo) {
    named.style.removeProperty("view-transition-name");
  }
  named = photo;

  root.setAttribute(MORPH_MARK, direction);
  if (at === "old") wear(true);

  const token = (current = {});
  const done = () => {
    // Only for the morph that is still the current one; see `current` above.
    if (current !== token) return;
    current = null;
    named = null;
    wear(false);
    root.removeAttribute(MORPH_MARK);
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
    // Nothing subscribed to `finished`, so nothing would ever take the mark
    // off: every fan mounted after this would hold its side prints for a morph
    // that is not running, the dialog would never zoom, and the print would
    // keep its name across navigations. The update is the caller's own render,
    // so it is their throw to see.
    done();
    throw error;
  }
}
