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
// Rows are further apart than columns. Both gaps used to be 1rem, which put
// every card's shelter line as close to the photo of the card below it as to
// the photo it belongs to, and the grid read as one mesh rather than as sixty
// cards: the eye had nothing telling it where a card ended. The column gap is
// what the widths below are derived from and it does not move.
//
// From xl the cards are larger and there are three of them. A 228px photo is a
// thumbnail, and the photograph is the thing this page is for, so where there
// is room the picture takes it. The floor cannot simply be raised for every
// width: auto-fill drops a column the moment the floor stops fitting, and a
// 15rem floor at lg would leave two enormous cards beside the sidebar. xl is
// where the page frame stops growing at 80rem, so the count settles at three.
//
// From 2xl the frame itself grows to 100rem (--page-max, set by the results
// page in site-shell.tsx) and the floor goes up with it, to 18rem. Both halves
// are needed and neither works alone: a wider frame at the 15rem floor packs
// five 243px columns into the new room, which is smaller cards and more of
// them, the opposite of the point. 18rem is the floor that makes the answer
// four, and four is what keeps the card at 308px, the size it already is at
// xl. So a 1920 screen draws the same card as a 1440 one, and draws one more.
export const CARD_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-y-8" +
  " sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]" +
  " xl:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]" +
  " 2xl:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]";

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
// Which is why a square box has to ask for more than its own width. cover
// scales a photo until it fills the box and a photo wider than the box is
// scaled to the box's HEIGHT, so a square box showing a 4/3 source needs a file
// 4/3 as wide as the box or it is stretched. 52% of the register's first photos
// are wider than 4/3 and another 17% are near square; the 31% that are portrait
// never wanted the extra and lose nothing by it.
//
// So every band from sm up is stated at 4/3 of the card, and the two phone
// bands are not.
//
// That split is the payload, measured over the 1775 cached masters: the rungs
// average 12.6KB at 320, 24.0KB at 480 and 36.8KB at 640, and a master 51.7KB.
// A desktop at 1x moves from the 320 rung to the 480 one, and draws three of
// them to a row instead of four, so a row costs 72KB where it cost 50KB and the
// photograph it is spent on is 309px rather than 228px. Above the fold that is
// close to a wash, because the row is 431px tall now and fewer of them fit.
//
// A desktop at 2x asks for 618px of height and the ladder's top rung is 640
// wide, which is 480 tall on a 4/3 source and not enough, so it takes the
// master. That is the right file for the box and the most expensive line here.
// A rung between 640 and the master, 800 or 960, would land it nearer 40KB; the
// ladder lives in apps/ingest (DERIVATIVE_VERSION in cache-images.ts) and
// adding one re-cuts every derivative in the cache, so it is its own change.
//
// On a phone the widening buys almost nothing, because a 2x or 3x screen is
// already asking for the 480 or 640 rung at the plain width. Only a 1.75x
// screen would move up, and a 164px thumbnail on a phone connection is the one
// place this trade is not worth making.
//
// The page is `max-w-(--page-max) px-gutter` and --page-max is 80rem except on
// the results page from 2xl, where CARD_GRID_PAGE_MAX above takes it to 100rem.
// --gutter is 1rem below sm, 1.5rem from sm
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
//   1200-1279 4 cols beside the sidebar                    →  208-228px
//   1280-1535 the xl floor takes over: 3 cols of a grid that
//           an 80rem frame has capped at 960px             →  309px
//   1536+    the 2xl floor and a 100rem frame: 4 cols of a
//           grid that is 1216px at the breakpoint and
//           1280px once the frame caps                     →  292-308px
//
// That last band clears its floor by 16px and no more: four 18rem columns and
// three 1rem gaps need 1200 of the 1216 the breakpoint leaves. Anything that
// moves the sidebar's 14rem, the 2rem gutter or the grid's own gap at 2xl
// spends that slack and drops the row to three columns of 395px, which the
// 412px band below would then under-declare by a quarter.
//
// Every band from 704 up is then multiplied by 4/3 for the square box, which is
// what turns "/3" into "* 4 / 9" and 232 into 309.
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
// Square at every width. It started as the phone's answer to a card that was
// nearly half words, and it is the better frame everywhere for the same reason:
// a sitting dog or cat is a vertical subject, and 4/3 spent a third of the box
// on what is beside the animal. One shape also means the grid keeps its rhythm
// across every breakpoint instead of changing proportion at sm.
//
// It costs height: a desktop card goes from about 261px to about 409px, so
// roughly a fifth fewer fit a screen. CARD_PHOTO_SIZES below pays the other
// half of the bill.
export const CARD_PHOTO_ASPECT = "aspect-square";

// The corner, here for the same reason the aspect is: the frame draws it and
// the skeleton has to match, and when it was a literal in each of them the two
// silently disagreed the moment one moved. 18px on this site's scale, against
// rounded-ui's 10px for the bordered surfaces. It was 14px while the picture
// was 228px wide and read timid at 309px, which is a photograph's licence to
// take the larger corner rather than a licence the rest of the page has.
export const CARD_PHOTO_RADIUS = "rounded-2xl";

// What the results page hands SiteShell to widen the frame it centres on.
//
// It lives here and not at the shell, because the number is only right in
// company: 100rem is the frame that leaves 1280px of grid after the gutters and
// the sidebar, which is four 308px columns at the 18rem floor above, which is
// what the last band of CARD_PHOTO_SIZES is declared for. Those three move
// together or not at all, so they are read from one file.
export const CARD_GRID_PAGE_MAX = "2xl:[--page-max:100rem]";

export const CARD_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px)," +
  " (max-width: 703px) calc(50vw - 32px)," +
  " (max-width: 927px) calc((100vw - 80px) * 4 / 9)," +
  " (max-width: 1023px) 309px," +
  " (max-width: 1199px) calc((100vw - 352px) * 4 / 9)," +
  " (max-width: 1279px) 304px," +
  " 412px";
// The last band covers xl and 2xl together. At xl the card is 309px and 412 is
// exactly its 4/3; from 2xl it is 292px at the breakpoint and 308px once the
// frame has capped, so 412 over-declares by at most 6% at the narrow end of
// that range. Over-declaring costs a fraction of a rung and never softness,
// and a seventh band to save it would be a band nobody can check by eye.
