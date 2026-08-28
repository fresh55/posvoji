/**
 * The site's quiet secondary link: muted until hovered, and a finger wide
 * below lg without growing the line it sits in.
 *
 * In lib rather than beside BackLink, which is the component that wears it
 * most, because server components need it too and a "use client" module's
 * exports cross the boundary as client references rather than as the plain
 * string a className wants.
 */
export const MUTED_LINK =
  "inline-flex max-lg:tap-target text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
