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
