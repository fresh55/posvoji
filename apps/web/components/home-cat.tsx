import { type CatFraming, CatModel } from "@/components/cat-model";
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
 * the section gap, 150px, with nothing else in it. The heading, the meta
 * line, the tabs and the cards all keep their places. The stage is a fixed
 * 192x152 rather than derived from those three, because the poster is
 * rendered for exactly that box; a box that changed shape with the hero
 * would letterbox the still while the canvas fills it, and he would jump
 * on handover. The 2px this leaves above the rule at lg are empty air.
 *
 * His link, "Spoznajte Srečka", is not drawn here: it is the last item of
 * the hero's meta row (site-page.tsx), in the flow, so on the widths where
 * the row is about to wrap it wraps with it instead of landing on top of
 * "Si našel žival?", which a caption hung off this figure did between 800
 * and 890px, and took its taps. Being in the row also puts it before the
 * stage in tab order, where it reads.
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

/** How much of the hero's line the corner reserves, and the box it draws in
 *  it. The two are one measurement: the stage plus the 32px that keeps a
 *  wrapped title off him. Written as a property so the padding cannot be
 *  retuned in site-page.tsx without the drawing moving with it. */
export const CAT_CORNER = "[--cat-corner:14rem] short:[--cat-corner:10rem]";
const CAT_STAGE = "h-38 w-48 short:h-25 short:w-32";

export function HomeCat({ locale }: { locale: Locale }) {
  return (
    <figure className={`absolute right-0 -bottom-section-gap hidden md:block ${CAT_STAGE}`}>
      <CatModel
        locale={locale}
        className="h-full"
        // The two boxes he is drawn in, so a phone held sideways is not sent
        // the desktop still.
        sizes="(max-height: 32rem) 128px, 192px"
        framing={HOME_CAT_FRAMING}
        startAfterLoad
      />
    </figure>
  );
}
