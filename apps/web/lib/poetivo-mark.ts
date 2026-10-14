/**
 * Poetivo's mark as plain geometry, in a module that imports nothing. The
 * shape github-mark.ts takes, for the reasons recorded there.
 *
 * The mark is the capital P of Inter 600, unmodified: Poetivo's identity is
 * its name set in that face, and its favicon is this one letter. The outline
 * is the one its own repository traces from the vendored font
 * (components/poetivo-mark.tsx there, drawn 28 units tall in a 32 box),
 * rescaled into the 16 box GITHUB_MARK uses: 14 units tall, 1 from the top,
 * centred, rounded to three decimals. The two marks share a box so the
 * footer draws both with one svg recipe and the text after each starts at
 * the same offset.
 *
 * One caller, the footer's credit line, at 14px inside a text link. The ink
 * is the caller's to decide, which is why this is a path and not a drawing.
 */
export const POETIVO_MARK =
  "M2.916 15V1H8.155Q9.763 1 10.86 1.603Q11.958 2.207 12.521 3.253Q13.084 4.299 13.084 5.636Q13.084 6.977 12.516 8.021Q11.948 9.064 10.841 9.664Q9.735 10.264 8.113 10.264H4.644V8.197H7.782Q8.735 8.197 9.341 7.868Q9.946 7.538 10.233 6.958Q10.52 6.379 10.52 5.636Q10.52 4.887 10.233 4.315Q9.946 3.744 9.338 3.422Q8.729 3.1 7.77 3.1H5.425V15Z";
