// Cards claim a target width and the column count falls out of whatever space
// is left. Fixed counts made cards jump from 309px to 222px the moment the
// sidebar appeared at lg, because the count stayed at three while the room for
// it shrank by a quarter. Two columns stay hard-coded on phones because
// auto-fill would drop to one there, and a single column of photos is a worse
// phone page.
//
// Its own module rather than an export off animal-grid: a page that shows the
// cards without the filters around them would otherwise pull the whole filter
// UI into its bundle to read one string.
export const CARD_GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]";

// How wide a card's photo actually renders, which is what decides the rung a
// browser downloads. Derived from CARD_GRID above and from the page's own
// gutters, so the two live in one file and cannot drift apart.
//
// The photo is as wide as the card. The card draws no border of its own
// (animal-card.tsx), so the photo's edge is the grid column's edge and every
// band below is the column itself. When the card was a bordered surface each
// band ended in "- 2px" for the two edges the photo sat inside.
//
// Widths only, because a width is what a browser reads here: it picks a rung
// off the declared width and its own pixel ratio, and never off the box's
// height.
//
// Which makes the square phone frame a trade rather than a non-event. A 4/3
// photo covering a square box is scaled until it is as tall as the box and then
// cropped at the sides, so below sm a card draws about a third fewer source
// pixels per drawn pixel than it did at 4/3: on a 412px screen at 1.75x the 320
// rung used to land exactly and now stretches about 1.3x. Declaring these two
// bands 4/3 wider would buy that back and move most phones up a rung, from a
// mean 13KB to a mean 24KB a photo across sixty cards, which is the wrong way
// to spend a phone connection on a 163px thumbnail. Sources that are already
// square or portrait, 29% of the register's first photos, lose nothing either
// way.
//
// The page is `max-w-7xl px-gutter`, --gutter is 1rem below sm, 1.5rem from sm
// and 2rem from lg (globals.css), and the grid's own gap is 1rem throughout.
// From lg the results section is a 14rem sidebar plus a 2rem column gap ahead
// of the grid. Columns are two fixed ones below sm and auto-fill minmax(13rem)
// above it, which is what the breakpoints between the bands are: each one is
// the width where another 13rem column starts fitting.
//
//   ≤639     2 cols, 1rem gutter:  (100vw - 32 - 16)/2  =  50vw - 24px
//   640-703  2 cols, 1.5rem:       (100vw - 48 - 16)/2  =  50vw - 32px
//   704-927  3 cols, 1.5rem:       (100vw - 48 - 32)/3
//   928-1023 4 cols, 1.5rem:       (100vw - 48 - 48)/4  →  208-232px
//   1024-1199 3 cols beside the sidebar, 2rem gutter:
//                                  (100vw - 64 - 256 - 32)/3
//   1200+    4 cols, and max-w-7xl stops the growth at 1280 →  208-228px
//
// The two narrow bands are stated as their widest card rather than as a calc,
// because across each of them every plausible device ratio lands on the same
// rung either way. The rest are exact: the mobile band used to read a flat
// 50vw, which at 412px declared 206px against a photo that renders 180px, and
// at a 1.75 ratio that is 361 device px against 315 - opposite sides of the
// 320 rung, so 11 of the 60 cards on screen fetched the 480px file for
// nothing.
//
// Understating any band picks a rung too small and the photo goes soft, so
// where a band is stated as a single length it is the widest card in it.
// The card photo's box, in one place because three of them have to agree: the
// frame itself, the skeleton the grid draws in its place before hydration, and
// card-paint's height estimate in globals.css.
//
// Square below sm and 4/3 from there. Below sm the grid is two hard-coded
// columns (CARD_GRID above), so a 375px screen draws a 163px card: a 4/3 photo
// in it is 123px tall under a text block of about 100px, and the card is nearly
// half words. The square gives the picture back 40px of height without touching
// the column count, and from sm the card is wide enough that 4/3 is the better
// frame for a photograph.
export const CARD_PHOTO_ASPECT = "aspect-square sm:aspect-[4/3]";

export const CARD_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px)," +
  " (max-width: 703px) calc(50vw - 32px)," +
  " (max-width: 927px) calc((100vw - 80px) / 3)," +
  " (max-width: 1023px) 232px," +
  " (max-width: 1199px) calc((100vw - 352px) / 3)," +
  " 228px";
