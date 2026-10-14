/**
 * Poetivo's mark as plain geometry, in a module that imports nothing: the
 * shape github-mark.ts takes, for the reasons recorded there.
 *
 * The mark is the lit window: the capital P of Inter 600, in night, on a
 * lamp-yellow tile. Poetivo's repository draws it that way for its favicon
 * and avatar (public/brand/poetivo-mark.svg there: a 32 box, the tile's
 * corners at 6, the P 28 tall, 2 from the top, centred), and its design
 * notes say the tile is for where only a sign fits. The outline here is that
 * repository's, rescaled into a 16 box: 14 tall, 1 from the top, centred,
 * rounded to three decimals. The corner radius scales with it.
 *
 * The two colours are the brand's and not the theme's. The tile is made to
 * read on light and dark chrome alike, so it does not follow the theme, and
 * a P in currentColor on it would vanish on the dark theme.
 *
 * One caller, the header's lockup under the site's name, at 14px.
 */
export const POETIVO_MARK =
  "M2.916 15V1H8.155Q9.763 1 10.86 1.603Q11.958 2.207 12.521 3.253Q13.084 4.299 13.084 5.636Q13.084 6.977 12.516 8.021Q11.948 9.064 10.841 9.664Q9.735 10.264 8.113 10.264H4.644V8.197H7.782Q8.735 8.197 9.341 7.868Q9.946 7.538 10.233 6.958Q10.52 6.379 10.52 5.636Q10.52 4.887 10.233 4.315Q9.946 3.744 9.338 3.422Q8.729 3.1 7.77 3.1H5.425V15Z";
export const POETIVO_TILE_RADIUS = 3;
export const POETIVO_TILE = "#dcd27c";
export const POETIVO_INK = "#18181b";
