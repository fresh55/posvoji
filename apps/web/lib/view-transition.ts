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

  root.setAttribute(MORPH_MARK, direction);
  if (at === "old") wear(true);

  const done = () => {
    wear(false);
    root.removeAttribute(MORPH_MARK);
  };

  const transition = document.startViewTransition(() => {
    flushSync(update);
    wear(at === "new");
  });
  // Both ways round. A transition the browser skips, or one a second gesture
  // takes over, rejects this promise, and the name and the mark have to come
  // off either way or the next morph is skipped too.
  transition.finished.then(done, done);
}
