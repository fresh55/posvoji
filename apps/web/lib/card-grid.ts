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
// Below sm the grid is two fixed columns inside a 1rem gutter, so a card is
// 50vw less half the gap and the gutter; 50vw overstates that by a few percent
// and never understates it. From sm the auto-fill columns run between 13rem
// and, at the widest, about 20rem:
//
//   640-703px   two columns still fit, 288-320px per card
//   704-1199px  three or four columns, 208-282px
//   1200px+     four columns beside the 14rem sidebar, 208-228px
//
// Understating any of these picks a rung too small and the photo goes soft, so
// each step is the widest card in its band.
export const CARD_PHOTO_SIZES =
  "(max-width: 639px) 50vw, (max-width: 703px) 46vw, (max-width: 1199px) 20rem, 15rem";
