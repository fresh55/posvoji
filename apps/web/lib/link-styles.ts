/**
 * The site's quiet secondary link: muted until hovered, and a finger wide on a
 * coarse pointer without growing the line it sits in.
 *
 * Gated on the pointer rather than on the width. At 1180px with touch this
 * link hit-tested 20px tall, because max-lg reads a laptop window's width as a
 * mouse and a tablet's as one too; the rule on tap-target in globals.css makes
 * the general case.
 *
 * In lib rather than beside BackLink, which is the component that wears it
 * most, because server components need it too and a "use client" module's
 * exports cross the boundary as client references rather than as the plain
 * string a className wants.
 */
export const MUTED_LINK =
  "inline-flex pointer-coarse:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

/**
 * A link that carries its own weight in a sentence: the source credit under a
 * map, the law behind a duty, the register a count came from. Foreground ink
 * and a standing underline offset, because it is the thing the sentence is
 * for, and a finger's box on a coarse pointer the same way MUTED_LINK gets
 * one.
 *
 * inline-block and not inline-flex: these sit inside running text, and a flex
 * box takes the link out of the line's own box, which drops the wrap.
 */
export const SOURCE_LINK =
  "inline-block font-medium underline-offset-4 hover:underline pointer-coarse:tap-target";

/**
 * A control that reads as a link or a quiet button in a page's own flow, and
 * that a thumb has to be able to hit: the empty state's actions, the grid's
 * "show more", the about page's contact buttons. The height floor and the
 * wider padding are one decision, and it was written out in three places
 * before this.
 */
export const COARSE_ACTION = "pointer-coarse:min-h-11 pointer-coarse:px-4";

/**
 * The size of a page's own title. One decision, and the phone step was missing
 * from five pages at once because the string had no home: they printed 30px on
 * a 390 viewport where the home page's own title prints 20.
 */
export const PAGE_TITLE =
  "text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl";
