// Cards claim a target width and the column count falls out of whatever space
// is left. Fixed counts made cards jump from 309px to 222px the moment the
// sidebar appeared at lg, because the count stayed at three while the room for
// it shrank by a quarter. Phones keep two columns, because a single column of
// photos is a worse phone page, but only while the text fits them. The phone
// floor is the larger of 8rem and half the row, so at normal text half the row
// always wins and the count is two at any phone width, while at 200% browser
// text 8rem is 256px, two of those no longer fit a 375px screen, and the grid
// drops to one column. A fixed grid-cols-2 held two 140px cards there, and
// the meta line set one word per line under each. The one-column case asks for
// the 50vw photo rung in CARD_PHOTO_SIZES below and draws it wider, which is
// a softer photo for a visitor who asked for large text, not a broken one.
//
// Its own module rather than an export off animal-grid: a page that shows the
// cards without the filters around them would otherwise pull the whole filter
// UI into its bundle to read one string.
// Rows are further apart than columns. Both gaps used to be 1rem, which put
// every card's shelter line as close to the photo of the card below it as to
// the photo it belongs to, and the grid read as one mesh rather than as sixty
// cards: the eye had nothing telling it where a card ended. The column gap is
// what the widths below are derived from, and below xl it does not move.
//
// From xl the column gap is 20px. 16px between two 307px squares read as a
// contact sheet, the pictures all but touching, and 20px is what the 2xl band
// below can spare. 24px would be better still and is not available: at 1536
// four 18rem columns and three 24px gaps need 1224 of the 1216 the breakpoint
// leaves, so the row drops to three columns of 389px, which is smaller
// pictures with more room around them, the opposite of the point. At 20px the
// same sum is 1212 and four columns hold, measured rather than derived: four
// of 289px at 1536 and four of 305px once the frame caps.
//
// From xl the cards are larger and there are three of them. A 228px photo is a
// thumbnail, and the photograph is the thing this page is for, so where there
// is room the picture takes it. The floor cannot simply be raised for every
// width: auto-fill drops a column the moment the floor stops fitting, and a
// 15rem floor at lg would leave two enormous cards beside the sidebar. xl is
// where the page frame stops growing at 80rem, so the count settles at three.
//
// The card's name steps up at this same breakpoint (xl:text-lg on the h3 in
// animal-card.tsx), because a 16px name beside a 307px photograph reads as a
// caption. It is spelled there rather than here, since it has one consumer
// and nothing derives from it, and a breakpoint cannot be hoisted into a
// constant anyway: Tailwind generates a rule only for a literal class string.
// So moving the floor below moves the picture and leaves the type behind.
//
// From 2xl the frame itself grows to 100rem (--page-max, set by the results
// page in site-shell.tsx) and the floor goes up with it, to 18rem. Both halves
// are needed and neither works alone: a wider frame at the 15rem floor packs
// five 243px columns into the new room, which is smaller cards and more of
// them, the opposite of the point. 18rem is the floor that makes the answer
// four, and four is what keeps the card at 305px, within two pixels of the
// 307px it is at xl. So a 1920 screen draws nearly the same card as a 1440
// one, and draws one more.
export const CARD_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(max(8rem,calc(50%_-_0.5rem)),1fr))] gap-x-4 gap-y-6 sm:gap-y-8 xl:gap-x-5" +
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
// photograph it is spent on is 307px rather than 228px. Above the fold that is
// close to a wash, because the row is 431px tall now and fewer of them fit.
//
// A desktop at 2x asks for 618px of height and the ladder's top rung is 640
// wide, which is 480 tall on a 4/3 source and not enough, so it takes the
// master. That is the right file for the box and the most expensive line here.
// A rung between 640 and the master, 800 or 960, would land it nearer 40KB; the
// ladder lives in apps/ingest (DERIVATIVE_VERSION in cache-images.ts) and
// adding one re-cuts every derivative in the cache, so it is its own change.
//
// On a phone the widening is left off, and the reason is the bytes rather than
// the rungs. The rungs were the argument here until they were measured: a 375
// phone at 2x draws a 163.5px card, asks for 327 device pixels and takes the
// 320 rung, and 291 of 484 leads have a wider rung than that available, so a
// band stated at 4/3 would move most of them up rather than nothing. It moves
// them up at a price: 60 cards on a 375@2x first screen go from 434KB to
// 769KB, +77%, to undo a 1.28x upscale on a 136px thumbnail. That is the one
// place on the site where the file is the cost and the picture is the size of
// a stamp, so the conclusion stands and only its reason has changed.
//
// The page is `max-w-(--page-max) px-gutter` and --page-max is 80rem except on
// the results page from 2xl, where CARD_GRID_PAGE_MAX above takes it to 100rem.
// --gutter is 1rem below sm, 1.5rem from sm
// and 2rem from lg (globals.css), and the grid's own column gap is 1rem up to
// xl and 1.25rem from there.
// From lg the results section is a 224px sidebar plus a 2rem column gap ahead
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
//           an 80rem frame has capped at 960px, at the
//           20px gap the grid takes from xl                →  307px
//   1536+    the 2xl floor and a 100rem frame: 4 cols of a
//           grid that is 1216px at the breakpoint and
//           1280px once the frame caps                     →  289-305px
//
// That last band clears its floor by 4px and no more: four 18rem columns and
// three 20px gaps need 1212 of the 1216 the breakpoint leaves. Anything that
// moves the sidebar's 224px, the 2rem gutter or the grid's own gap at 2xl
// spends that slack and drops the row to three columns of 392px, which the
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
//
// It also costs sharpness on a retina desktop, which is the trade this frame
// is worth writing down rather than discovering again. cover scales a photo
// until the box is filled, so a 307px square box on a 3:2 master asks for a
// 920px file: 54% of desktop cards upscale at DPR 2, by a median of 1.23x, and
// 87 of the leads are soft only because the ingest master is capped at 800px
// (DERIVATIVE_VERSION in apps/ingest/src/cache-images.ts). At 1.23x on a
// photograph that is soft rather than blocky, and the alternative is 4/3 on
// every card, which is the third of the box spent on what is beside the animal
// that this shape exists to take back. So the square stays and the upscale is
// accepted; 1024px lead masters would settle it properly and are ingest's
// change, not this file's.
export const CARD_PHOTO_ASPECT = "aspect-square";
// The same shape as a number, for the crop: the photo has to know how much
// wider or taller than its box it is to keep the animal inside (see
// subjectPosition in lib/animal-images.ts). Change both or neither.
export const CARD_PHOTO_RATIO = 1;

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
// the sidebar, which is four 305px columns at the 18rem floor above, which is
// what the last band of CARD_PHOTO_SIZES is declared for. Those three move
// together or not at all, so they are read from one file.
export const CARD_GRID_PAGE_MAX = "2xl:[--page-max:100rem]";

// The two columns the results page draws from lg: the filter rail, then the
// grid. Here rather than in animal-grid.tsx because the 224px is already this
// file's number - the bands below are derived from "a 224px sidebar plus a 2rem
// column gap", and the note above says what moving it costs. Two elements wear
// this string, the results block and the stand-in that holds its place while a
// filtered link hydrates, and they have to agree about the page's shape or the
// grid jumps sideways when the real one arrives.
//
// Both tracks are stated so that 200% browser text cannot push the page
// sideways, and each half was needed:
//
// minmax(0,1fr) and not 1fr, for the grid's own track: a 1fr track takes its
// automatic minimum from its content, and the content is a toolbar sized in
// rem, so at 200% text the column refused to shrink.
//
// clamp(224px,14rem,25%) for the rail. Everything inside the rail is set in
// rem, so the track has to grow with the text too: a plain 224px track held
// rows twice their size at a doubled browser font size (2200px wide, where lg
// is reached at 32px text), and Samica sat on its own count while every
// heading truncated. 14rem is the rail at any text size, and it is exactly
// 224px at 16px, so default text draws the same page as before.
//
// The 25% cap is for text enlarged by a stylesheet rather than by the browser
// setting. A root font size of 200% leaves the rem breakpoints where they
// were, so lg starts at 1024px, and a bare 14rem track there is 448px, half
// the frame, and scrolled the page 28px sideways. There the cap is below
// 224px and the floor wins, which is the px track the page had. With the
// browser setting lg is not reached until the frame has room for 14rem: at
// 200% text the frame is 1920px when lg starts, and a quarter of it is 480px.
// CARD_PHOTO_SIZES below states its own lengths in px, which is right at 16px
// text, the only size it is tuned for.
export const RESULTS_COLUMNS =
  "lg:grid lg:grid-cols-[clamp(224px,14rem,25%)_minmax(0,1fr)] lg:items-start lg:gap-column-gap";

// Which of those two tracks a block stands in, stated rather than left to
// auto-placement, because the results now come first in the document: the
// toolbar carries the species tabs and the sort control, and behind the rail
// they were the 26th tab stop of the page. Reading order is the DOM's, so the
// DOM is what changed and these put the drawing back. Three elements wear
// them, the rail, the results block and the stand-in that holds the block's
// place while a filtered link hydrates, and the stand-in has to claim the same
// track as the block or the cards move sideways when they arrive.
//
// Row as well as column. With one of the two tracks' items ahead of the other
// in the DOM, auto-placement would otherwise put the rail on a second row the
// moment anything else in the section became a grid item.
export const RESULTS_RAIL_TRACK = "lg:col-start-1 lg:row-start-1";
export const RESULTS_GRID_TRACK = "lg:col-start-2 lg:row-start-1";

export const CARD_PHOTO_SIZES =
  "(max-width: 639px) calc(50vw - 24px)," +
  " (max-width: 703px) calc(50vw - 32px)," +
  " (max-width: 927px) calc((100vw - 80px) * 4 / 9)," +
  " (max-width: 1023px) 309px," +
  " (max-width: 1199px) calc((100vw - 352px) * 4 / 9)," +
  " (max-width: 1279px) 304px," +
  " 412px";
// The last band covers xl and 2xl together. At xl the card is 307px and 412 is
// within 1% of its 4/3 (it was exactly 4/3 of the 309px card a 16px gap drew);
// from 2xl it is 289px at the breakpoint and 305px once the frame has capped,
// so 412 over-declares by at most 7% at the narrow end of that range.
// Over-declaring costs a fraction of a rung and never softness,
// and a seventh band to save it would be a band nobody can check by eye.
