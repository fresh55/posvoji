/**
 * The three words the photo morph is spelled with: the name the two boxes
 * share, how long the browser carries one into the other, and the mark the
 * stylesheet scopes all of it to. What runs the morph is lib/view-transition.ts.
 *
 * Plain, with no "use client" and no imports, because the modules that need
 * these numbers are plain too: fan-options.ts and dialog-reveal.ts are read by
 * a server render, and a server import of a "use client" module's constant is
 * a client-reference proxy rather than the value.
 */

/** The name the two boxes share. The card's photo frame wears it for the
 *  moment the dialog opens, the fan's front print wears it for as long as it is
 *  the front print (fan-photo.tsx), and the card wears it again on the way
 *  back. Two elements wearing it in the same state make the browser skip the
 *  transition, which is why every caller takes it off. */
export const PHOTO_TRANSITION_NAME = "animal-photo";

/** How long the morph runs. globals.css states the same number, which is the
 *  one that draws; this is what everything waiting for the photo to land is
 *  timed against. */
export const PHOTO_MORPH_MS = 320;

/** Marks the document while a morph is running, so the dialog's own zoom and
 *  the root crossfade can stand aside for it (globals.css). The value says
 *  which way the photo is going, because only the close needs the root to
 *  crossfade. Exported because the fan's front print and the suites either side
 *  of it all spell the same attribute. */
export const PHOTO_MORPH_MARK = "data-photo-morph";
