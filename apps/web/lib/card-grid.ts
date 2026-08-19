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
