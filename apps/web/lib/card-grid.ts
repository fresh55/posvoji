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
export const CARD_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px)," +
  " (max-width: 703px) calc(50vw - 32px)," +
  " (max-width: 927px) calc((100vw - 80px) / 3)," +
  " (max-width: 1023px) 232px," +
  " (max-width: 1199px) calc((100vw - 352px) / 3)," +
  " 228px";
