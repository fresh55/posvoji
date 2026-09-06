/**
 * The dog, the cat and the rabbit as plain geometry, in a module that imports
 * nothing.
 *
 * The paths are Lucide's Dog, Cat and Rabbit (lucide-react 1.31.0, ISC
 * license). Keeping the geometry local is what lets Motion ink an outline in
 * and move it: a lucide component draws in one piece and gives nothing to
 * animate.
 *
 * They live here rather than in either component that draws them because two
 * of them draw the same animals. The species tabs show a dog and a cat, and so
 * do the "dobro z" cards. Two drawings of one animal would be two things to
 * keep in step; one data module read by both is one. Same reasoning as
 * age-stage-paths.ts, and the same reason the drift test in
 * species-tabs.test.tsx guards this module rather than one of its readers.
 */

export const DOG_BODY =
  "M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309";
/** Both ears and the crown between them, as Lucide draws them: one stroke.
 *  good-with-glyphs.tsx keeps its own cut of this into three, because a pair
 *  of ears cannot flop while the icon is one rigid shape. */
export const DOG_EARS =
  "M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5";
export const DOG_EYE_LEFT = "M8 14v.5";
export const DOG_EYE_RIGHT = "M16 14v.5";
export const DOG_EYES = [DOG_EYE_LEFT, DOG_EYE_RIGHT];
export const DOG_NOSE = "M11.25 16.25h1.5L12 17z";

export const CAT_HEAD =
  "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z";
export const CAT_EYE_LEFT = "M8 14v.5";
export const CAT_EYE_RIGHT = "M16 14v.5";
export const CAT_EYES = [CAT_EYE_LEFT, CAT_EYE_RIGHT];
export const CAT_NOSE = "M11.25 16.25h1.5L12 17l-.75-.75Z";

const RABBIT_FORELEG = "M13 16a3 3 0 0 1 2.24 5";
const RABBIT_EYE = "M18 12h.01";
const RABBIT_BODY =
  "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3";
const RABBIT_EAR = "M20 8.54V4a2 2 0 1 0-4 0v3";
const RABBIT_HAUNCH = "M7.612 12.524a3 3 0 1 0-1.6 4.3";

// Each animal whole, in the order Lucide draws it. A glyph that inks itself in
// follows this order, so it is the order the icon is built in and not one of
// our own choosing.
export const DOG_GLYPH = [
  DOG_NOSE,
  DOG_EYE_RIGHT,
  DOG_BODY,
  DOG_EYE_LEFT,
  DOG_EARS,
];

export const CAT_GLYPH = [CAT_HEAD, CAT_EYE_LEFT, CAT_EYE_RIGHT, CAT_NOSE];

export const RABBIT_GLYPH = [
  RABBIT_FORELEG,
  RABBIT_EYE,
  RABBIT_BODY,
  RABBIT_EAR,
  RABBIT_HAUNCH,
];
