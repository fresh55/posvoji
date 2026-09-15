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
 * The public pages cannot make it any more. components/site-shell.tsx renders
 * the header and the <main> it aims at together, so the nine get the pair or
 * neither, and site-shell.test.tsx is where the two are checked against each
 * other. What is left hand written is the portal's own shell, which holds both
 * halves in one file, and error-page.tsx and demo-gate-page.tsx, which draw
 * the landmark with no header to link to it.
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
 * The indicator is stated rather than left to the browser. globals.css sets a
 * ring colour in @layer base and not a ring, so a link that says nothing
 * further draws whatever the engine likes at whatever width it likes, and this
 * is the one control on the page whose whole job happens while it is focused.
 *
 * It is the ring every other focusable thing on the site draws and not a black
 * outline of its own. The rest of the page answers the keyboard in the ring
 * green; a bypass link that answered in black was teaching the first Tab of a
 * visit that focus looks like something it never looks like again.
 *
 * Around the box rather than inset. The link is absolutely positioned over the
 * block it skips and nothing clips it, so it has the room; the two places that
 * draw the ring inside their box (the gallery surface, the section trigger) do
 * it because an overflow clip is sitting on their edge.
 *
 * focus: and not focus-visible:, as the rest of this string already is: the
 * link is sr-only until it takes focus by any route, and a pointer cannot
 * reach it to focus it any other way.
 *
 * The padding is stated on the focused state and not once for both, because
 * not-sr-only sets `padding: 0` and a variant carries the pseudo-class with
 * it, so it outranks a plain px-3 whatever the order. Unfocused the link is
 * clipped to a pixel and the padding means nothing anyway; focused it was the
 * difference between a box and a line of text with a ring drawn tight around
 * the glyphs.
 */
export const SKIP_LINK =
  "sr-only rounded-ui bg-background text-sm underline underline-offset-4 outline-none focus:not-sr-only focus:absolute focus:z-50 focus:px-3 focus:py-2 focus:ring-3 focus:ring-ring";

/**
 * The header's variant, which has to place itself.
 *
 * The three in-flow links sit where they are written, inside the block they
 * skip, so focus:absolute resolves against the nearest positioned ancestor and
 * lands them there. A header link has no such block: it is the first thing in
 * the document, so it pins itself against the header's row, which carries
 * `relative` for it. left-gutter and not left-2, so it lines up with the page
 * frame rather than the viewport edge under a notch.
 *
 * Under the row and not inside it. The row is the brand's: 40px of logo and
 * wordmark inside 16px of padding, which leaves no band a 36px box can stand
 * in, and at top-2 the link covered the logo from its middle down and the
 * wordmark whole. 100% hangs it off the bottom edge instead, just below the
 * header's rule, where the only thing behind it is the top of the page and
 * nothing it skips is hidden while it is read. The half-rem gap is in the
 * offset rather than in a margin because not-sr-only sets `margin: 0` at the
 * same specificity as any focus:mt-* answering it, and which of those wins is
 * whichever order Tailwind happens to emit them in.
 */
export const SKIP_LINK_PINNED = `${SKIP_LINK} focus:top-[calc(100%+0.5rem)] focus:left-gutter`;
