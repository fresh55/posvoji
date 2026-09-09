/**
 * The bypass links and the landmarks they aim at.
 *
 * Both halves live here because neither is any use without the other, and
 * nothing else can check that they agree. A page that renders SiteHeader but
 * forgets the id on its own <main> ships a skip link that scrolls nowhere, in
 * both locales, and no test fails: the link is present, its target is not, and
 * the failure is only visible to somebody pressing Tab on that one page. The
 * id was written out thirteen times and the class string five times before
 * this, which is thirteen and five chances to make that mistake.
 *
 * lib and not a component, for the reason lib/link-styles.ts records: server
 * components need these too, and a "use client" module's exports cross the
 * boundary as client references rather than as the plain strings a className
 * and an id want.
 */

/** The id every page's <main> carries, and what the header's link aims at. */
export const CONTENT_ID = "vsebina";

/**
 * A bypass link: nothing until it takes focus, then a legible box over the
 * content it skips.
 *
 * The outline is stated rather than left to the browser. globals.css sets a
 * ring colour in @layer base and not a ring, so a link that says nothing
 * further draws whatever the engine likes at whatever width it likes, and this
 * is the one control on the page whose whole job happens while it is focused.
 */
export const SKIP_LINK =
  "sr-only rounded-ui bg-background px-3 py-2 text-sm underline underline-offset-4 focus:not-sr-only focus:absolute focus:z-50 focus:outline-2 focus:outline-offset-2 focus:outline-foreground";

/**
 * The header's variant, which has to place itself.
 *
 * The three in-flow links sit where they are written, inside the block they
 * skip, so focus:absolute resolves against the nearest positioned ancestor and
 * lands them there. A header link has no such block: it is the first thing in
 * the document, so it pins itself to the top left of the header, which carries
 * `relative` for it. left-gutter and not left-2, so it lines up with the page
 * frame rather than the viewport edge under a notch.
 */
export const SKIP_LINK_PINNED = `${SKIP_LINK} focus:top-2 focus:left-gutter`;
