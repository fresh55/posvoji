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
 * The ink half of a quiet link: foreground text under a standing underline that
 * the border colour keeps quiet until it is hovered.
 *
 * Three places wrote this out by hand before it had a name, each with its own
 * paragraph re-deriving the same measured fact: FOOTER_ACTION in
 * site-footer.tsx, the lookup link in found-animal-button.tsx, and
 * MUTED_SENTENCE_LINK below. The fact is that a muted hover-underline link goes
 * unread on a phone, where there is no hover, among text that is already muted.
 *
 * Only the four classes all three agreed on live here. What they genuinely
 * disagree about is the touch box, and that stays with each caller: the footer
 * draws one because its links are crowded, the other two take the overlay. The
 * underline offset stays with the caller too, because the footer sets none and
 * the other two want 4.
 */
export const QUIET_UNDERLINE =
  "text-foreground underline decoration-border hover:decoration-foreground";

/**
 * SOURCE_LINK's sibling for a link spliced into a muted running sentence,
 * where that rule stops working.
 *
 * SOURCE_LINK carries no colour of its own and no standing underline: it reads
 * as a link because the prose around it is foreground ink and the link is
 * heavier. Drop it into a `text-muted-foreground` paragraph and both halves of
 * that signal are gone. Measured on /o-nas/vsebine: the address inside the exit
 * rule computed to the same colour as the sentence carrying it in both themes,
 * leaving weight 500 against 400 as the only cue.
 *
 * That page's address is how a shelter asks to be taken off the site, so it is
 * the last link on the site that should read as small print.
 */
export const MUTED_SENTENCE_LINK = `font-medium ${QUIET_UNDERLINE} underline-offset-4 pointer-coarse:tap-target`;

/**
 * The quiet link that a content page hangs under a paragraph: the about page's
 * policy link, the new page's technical footnote, Srečko's own link.
 *
 * Written out by hand in about-page.tsx and srecko-link.tsx before this, each
 * spelling the ring and the underline again, and both now call this. PAGE_TITLE
 * above records what happens without a home: a string drifts, and five pages
 * were printing the wrong heading size by the time anyone measured it.
 *
 * Not every muted underlined link is one of these. demo-gate-page.tsx and
 * shelters-atlas.tsx spell MUTED_LINK plus `underline` without the ring, and
 * srecko-page.tsx adds a shape and a height; converting those would change what
 * they draw, so they were left alone rather than swept in.
 *
 * MUTED_LINK carries the colour, the size and the coarse-pointer box; this adds
 * the standing underline and the ring, and nothing else. `w-fit` stays with the
 * caller, because only a link inside a flex column needs it.
 */
export const QUIET_DOC_LINK = `${MUTED_LINK} rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4`;

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

/**
 * The sentence under a page's title. 16px on a phone, one step under the
 * 20px section headings that follow it and two under the title. At 18px the
 * About lead was the largest block on the first screen, three grey lines
 * the eye landed on instead of the title, and level with the section
 * headings under it.
 */
export const PAGE_LEAD =
  "text-base leading-relaxed text-muted-foreground sm:text-lg";
