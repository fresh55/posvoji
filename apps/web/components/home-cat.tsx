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

/** How much of the hero's line the corner reserves, and, minus the 32px that
 *  keeps a wrapped title off him, the width of everything drawn in it.
 *
 *  One measurement rather than four lists kept in lockstep by hand.
 *  site-page.tsx pads the hero by this property, the figure below takes its
 *  width from it, and the stage takes its height from its own aspect, so each
 *  size this corner has is stated once and the rest is arithmetic. A property
 *  and not a prop because the padding belongs to the hero and the drawing is
 *  its child, which is the bargain --rail-pad strikes in globals.css for the
 *  same reason.
 *
 *  184px, and 200px at lg. Short desktops use 160px to fit the tighter
 *  vertical spacing. Zero on a phone held sideways, where he is not
 *  drawn: the padding has to leave when the drawing does, and this is the one
 *  place that can be said once for both. */
export const CAT_CORNER =
  "[--cat-corner:11.5rem] lg:[--cat-corner:12.5rem] short-desktop:[--cat-corner:10rem] short:[--cat-corner:0rem]";

/**
 * The viewports the poster is worth downloading at, which is exactly the
 * ones the figure below is drawn at: md and up, minus the landscape phone.
 *
 * Written twice, here as a media condition and below as `md:block
 * short:hidden`, because a class is not a thing markup can ask a media
 * condition for. `short` is max-height 32rem, so the height this has to
 * clear is the first one above it.
 */
export const HOME_CAT_POSTER_MEDIA =
  "(min-width: 48rem) and (min-height: 32.01rem)";

/**
 * Srečko in the home page's top right corner, beside the hero.
 *
 * The hero is a heading and one line, 70px tall, and the right half of it
 * stood empty from tablet width up. He does not sit in that row: any stage
 * tall enough to show him would grow the row and leave the heading with
 * dead space above it (measured: 48px of it). He is positioned out of flow
 * instead, in the corner the page already has: from the header rule down to
 * the top of the toolbar, which is the page's top padding, the hero and the
 * section gap. Measured on the built page that is 158px at lg and 142
 * between md and lg, where the padding and the gap are both smaller; a
 * heading that comes in on two lines makes it taller again. The heading,
 * the meta line, the tabs and the cards all keep their places.
 *
 * The figure is sized from the corner rather than from the hero, and the
 * stage keeps the poster's shape at every size, because the still is
 * object-contain while the canvas fills its box: a box of another shape
 * letterboxes one and not the other, and he jumps on handover.
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
 * It costs him a fifth of his size. Nothing can make the corner taller, so a
 * line under him has to come out of the stage. What it buys back is a stage
 * that fits: the 192x152 one overflowed the 142px band by 10px wherever the
 * heading came in on one line, between 850 and 1023, and drew his ears
 * behind the language switcher and the menu button.
 *
 * Below md there is no such corner beside a two-line title, and above the
 * title he would push the tabs and the first cards under the fold, so the
 * figure is not drawn there. The model is gated on a reach and on
 * intersection in cat-model.tsx and never starts, and the poster is gated in
 * markup (posterMedia), because a still inside a display:none figure is
 * fetched all the same: lazy was measured and made no difference, and it is
 * 6.2KB out of the burst the first card photos need. No posterPriority for the
 * same reason: those photos are this page's largest paint and keep the
 * bandwidth, measured on both viewports.
 *
 * short: is the landscape phone, which is wider than md and has no corner
 * for him: at 844x390 the header rule and the species tabs are 164px apart
 * and this stage is 152px of that, so he stood on the tabs. He was also the
 * reason the hero kept a 224px right padding there, which wrapped the title
 * and the meta line and pushed the tabs under the fixed dock
 * (site-page.tsx). Measured at 844x390 before the gate, that phone fetched
 * the 1.14MB model of the time and the viewer chunk for him.
 *
 * startOnReach, because this is the site's entry page and the model is 1.5MB
 * plus 1.3MB of renderer: on the about page he is below the fold and often
 * never fetched, here he is on screen at once, and without a wait every
 * desktop visit would fetch him alongside the first card photos.
 *
 * The wait was the load event plus an idle callback, which is not the same as
 * waiting for a free moment. Measured on the built page at 1440x900 with no
 * throttling: load fires at about 150ms, so he started at about 400ms and
 * decoding him held the main thread for 760 to 850ms from around 600ms, which
 * is exactly when a visitor is reaching for the first card. A card clicked at
 * 400ms opened its dialog after 1.0 to 1.1s; on the reach it opens in 0.37s,
 * and the long tasks of the first three seconds fall from about 1.0s to 0.05s.
 * The reach answers both halves of it: the visit that goes for a card does not
 * pay for him at all, and the visit that goes for him spends that second on
 * the thing it asked for, with the progress cursor and the loading label
 * already saying so. A visitor reaching by keyboard is the Tab that lands on
 * the caption link below, which is inside this figure and so counts as a
 * reach for the stage: without that he would never meet the cat at all.
 *
 * On a phone held sideways he is not drawn at all. That viewport is 390px
 * tall and wide enough to be past md, so he was claiming 152px of its height
 * and 224px of the title's line: the heading came in on two lines, the meta
 * row on two, and the species tabs came to rest 21px inside the filter dock's
 * plate, which put the page's primary control under a floating one with the
 * first card row 366px down a 390px screen. A smaller stage was tried and is
 * not enough: the corner there is about 104px, and a phone in that orientation
 * was still paying 1.14MB for a model it could barely see. Off the page, the
 * corner he would have reserved goes with him and the heading takes the width
 * back.
 */

export function HomeCat({ locale }: { locale: Locale }) {
  return (
    // A column: the stage, then his name, filling the corner and no more.
    //
    // The width is the corner less the 32px that keeps a wrapped title off
    // him, so both of the corner's sizes reach the drawing without being
    // written again: 152, and 168 at lg. The figure is laid out from the
    // bottom up and what is above it is the header rule rather than more
    // page, so a box taller than its corner crosses into the language
    // switcher and the menu button rather than into the toolbar.
    //
    // short:hidden is the landscape phone, which is wider than md and has no
    // corner to give him: at 844x390 the header rule and the species tabs are
    // 164px apart and this stage alone wants 132 of it. Off the page there, he
    // costs that phone neither the 1.14MB model nor the still, and the corner
    // it would have reserved goes with him (--cat-corner in site-page.tsx).
    <figure className="absolute right-0 -bottom-section-gap hidden w-[calc(var(--cat-corner)-2rem)] flex-col items-center md:flex short:hidden">
      <CatModel
        locale={locale}
        // The poster's own shape, so the height follows the width at both
        // sizes: 120, and 133 at lg, which is what leaves the caption its line
        // inside a corner of 142 and 158.
        className="aspect-[192/152] w-full"
        // Advisory and unread today: next.config sets images.unoptimized,
        // which drops sizes and srcset, and there is one poster file. Kept
        // truthful about the two boxes for the day that changes. What actually
        // decides whether the file is fetched is posterMedia below.
        sizes="(min-width: 64rem) and (max-height: 799px) 128px, (min-width: 64rem) 168px, 152px"
        framing={HOME_CAT_FRAMING}
        posterMedia={HOME_CAT_POSTER_MEDIA}
        startOnReach
      />
      <figcaption className="mt-1 leading-4">
        {/* 12px, where this was 14 in the hero's meta row, and leading-4
            because the figure inherits the page's 24px line box and a caption
            is not a line of prose: the 8px it saves are 8px of cat. A caption
            is read with the thing it names rather than against the meta line,
            so it can be the quietest type on the page; below lg MUTED_LINK's
            own overlay gives the finger what the type does not. It needs no
            gate of its own - it is inside the figure, so it leaves with him. */}
        <SreckoLink locale={locale} className="text-xs" />
      </figcaption>
    </figure>
  );
}
