import { type CatFraming, CatModel } from "@/components/cat-model";
import { SreckoLink } from "@/components/srecko-link";
import type { Locale } from "@/lib/i18n";

/**
 * The camera the home stage is framed at, and the still rendered from it.
 *
 * Closer than the about page's 1.45m, at which he filled a third of a stage
 * this size. The target sits a little higher than the default so the seated
 * pose keeps headroom under the header rule; what that costs is the floor
 * shadow, which may touch the stage's bottom edge, where nothing is drawn.
 * Measured at this framing: the idle clip never touches an edge at the
 * resting heading, and 2 of 144 sampled heading, tilt and time combinations
 * touch the top by an ear tip, 3 to 4px wide.
 *
 * A new render needs a new ?v, or returning visitors keep the old still.
 */
export const HOME_CAT_FRAMING: CatFraming = {
  orbit: "-19deg 81deg 1.3m",
  target: "0m 0.24m 0m",
  poster: "/models/our-cat/poster-home.webp?v=3",
};

/**
 * Srečko in the home page's top right corner, beside the hero.
 *
 * The hero is a heading and one line, 62px tall, and the right half of it
 * stood empty from tablet width up. He does not sit in that row: any stage
 * tall enough to show him would grow the row and leave the heading with
 * dead space above it (measured: 48px of it). He is positioned out of flow
 * instead, in the corner the page already has: from the header rule down
 * to the top of the toolbar, which at lg is the top padding, the hero and
 * the section gap, 158px at lg and 142 below it, with nothing else in it.
 * The heading, the meta line, the tabs and the cards all keep their places.
 * The figure is one of two fixed sizes rather than derived from those three,
 * because the poster is rendered for a box of that shape; a box that changed
 * shape with the hero would letterbox the still while the canvas fills it,
 * and he would jump on handover.
 *
 * His link, "Spoznajte Srečka", is his caption, under him, inside this box.
 *
 * It spent a pass as the last item of the hero's meta row, pushed to the far
 * end with ml-auto so it would stand under him. That put two underlined links
 * of different jobs in one wrapping row: one is the way out for somebody
 * holding a stray, the other is a cat's story, and drawn alike at either end
 * of a line they read as a pair competing for the same press. Where the row
 * wrapped they were worse than a pair - ml-auto right-aligns whatever line it
 * lands on, so the second link came to rest diagonally below the first,
 * aligned to nothing on the page.
 *
 * A caption cannot do that. It belongs to the drawing, which is what it names,
 * and it sits in the corner the hero already keeps clear for him, so no width
 * can bring it near the row's text. That is also what the first attempt got
 * wrong: it hung off this figure at right-full, outside the box the corner
 * reserves, and so landed on "Si našel žival?" between 800 and 890px and took
 * its taps. Inside the box it is bounded by the same --cat-corner the row is
 * padded by.
 *
 * It costs him a fifth of his size. The corner is the band from the header
 * rule to the top of the toolbar and nothing can make it taller, so a line
 * under him has to come out of the stage. What it buys back is a stage that
 * fits the corner at last: the 192x152 one overflowed the 142px band between
 * md and lg by 10px wherever the heading came in on one line, and drew his
 * ears behind the language switcher and the menu button.
 *
 * Below md there is no such corner beside a two-line title, and above the
 * title he would push the tabs and the first cards under the fold, so the
 * figure is not drawn there. The poster is still downloaded on phones
 * (2.8KB, low priority: lazy inside display:none was measured and still
 * fetched); the model is gated on intersection in cat-model.tsx and never
 * starts. No posterPriority: the first card photo is this page's largest
 * paint and keeps the bandwidth, measured on both viewports.
 *
 * startAfterLoad, because this is the site's entry page and the model is
 * 2.1MB plus 1.3MB of renderer: on the about page he is below the fold and
 * often never fetched, here he is on screen at once, and without the wait
 * every desktop visit would fetch him alongside the first card photos.
 *
 * On a phone held sideways he is drawn smaller, at 128x100. That viewport is
 * 390px tall and wide enough to be past md, so he was claiming 152px of it in
 * the corner and 224px of the title's line, which put the heading on two
 * lines, the meta row on two, and the species tabs 21px inside the filter
 * dock's plate: the page's primary control was under a floating one, and the
 * first card row started 366px down a 390px screen. The smaller stage and the
 * narrower corner it reserves give the heading one line and the tabs a 41px
 * gap above the dock, without taking him off the page. Same aspect ratio, so
 * the poster stays the model's own first frame rather than a letterboxed one.
 */

/** How much of the hero's line the corner reserves, and the box drawn in it.
 *  The two are one measurement: the figure's width plus the 32px that keeps a
 *  wrapped title off him. Written as a property so the padding cannot be
 *  retuned in site-page.tsx without the drawing moving with it. */
export const CAT_CORNER =
  "[--cat-corner:11.5rem] lg:[--cat-corner:12.5rem] short:[--cat-corner:10rem]";

export function HomeCat({ locale }: { locale: Locale }) {
  return (
    // A column: the stage, then his name, filling the corner and no more.
    //
    // Two sizes, because the corner is two sizes. It is the page's top
    // padding, the hero and the section gap, which is 158px at lg and 142
    // between md and lg, and the figure is measured from the bottom up: too
    // tall and it crosses the header rule rather than the toolbar, where the
    // language switcher and the menu button are. The 192x152 stage this
    // started as was already 10px over that at 850 to 1023, wherever the
    // heading came in on one line; 152x120 with his name under it clears the
    // rule at both, and is the largest box that does.
    <figure className="absolute right-0 -bottom-section-gap hidden w-38 flex-col items-center md:flex lg:w-42 short:w-32">
      <CatModel
        locale={locale}
        // The aspect is the poster's at every one of the three sizes, which is
        // the rule this box cannot break: the still is object-contain and the
        // canvas fills the box, so a box of another shape letterboxes the one
        // and not the other, and he jumps when WebGL takes over.
        className="h-30 w-full lg:h-33 short:h-25"
        sizes="(max-height: 32rem) 128px, (min-width: 64rem) 168px, 152px"
        framing={HOME_CAT_FRAMING}
        startAfterLoad
      />
      {/* Not on a phone held sideways. That corner is the header rule to the
          toolbar with a 390px screen between them, about 104px, and the stage
          alone is 100 of it. He keeps the corner there, and his page keeps the
          about page's link to it, which is the one every phone gets. */}
      <figcaption className="mt-1 leading-4 short:hidden">
        {/* 12px, where this was 14 in the row, and leading-4 because the
            figure inherits the page's 24px line box and a caption is not a
            line of prose: the 8px it saves are 8px of cat. A caption is read
            with the thing it names rather than against the meta line, so it
            can be the quietest type on the page; below lg MUTED_LINK's own
            overlay gives the finger what the type does not. */}
        <SreckoLink locale={locale} className="text-xs" />
      </figcaption>
    </figure>
  );
}
