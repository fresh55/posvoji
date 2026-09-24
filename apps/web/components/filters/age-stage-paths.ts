export type AgeStage = "mladicek" | "odrasel" | "senior";

export type AgeStagePath = {
  d: string;
  /** Where in the draw this path starts, in seconds. Only the animated copy
   *  reads it; a printed one draws every path at once. */
  delay: number;
  /** How long this path takes to draw, in seconds. Animated copy only. */
  duration: number;
  /** Trunk and branches. The filter colours them as wood; every other surface
   *  draws the mark in one colour and ignores this. */
  wood?: true;
  /** The sprout's own strip of soil. The grove leaves it out, because the
   *  grove draws one ground line under all three plants. */
  soil?: true;
  /** How a leaf folds down when the sprout wilts: the pivot where it meets
   *  the stem, as a fraction of the path's own box, and the degrees it
   *  swings through. Animated copy only. */
  fold?: { originX: number; originY: number; rotate: number };
};

/**
 * The three age marks as plain geometry, in a module that imports nothing.
 *
 * The paths are adapted from Lucide's Sprout, Shrub and TreeDeciduous icons
 * (lucide-react, ISC license). Keeping the geometry local lets Motion draw the
 * stem and the canopy separately instead of moving the whole icon as one rigid
 * shape, which is why the filter panel has its own copy of them at all.
 *
 * They live here, apart from age-stage-icon.tsx, because that file is a "use
 * client" component built on Motion and the poster is server-rendered onto
 * paper. Two drawings of the same age would be two things to keep in step; one
 * data module read by both is one.
 *
 * Every path starts where a plant grows from, so a pathLength draw reads as
 * growth: stems and trunks start at the ground, leaves at the stem, and each
 * canopy is two halves that leave the trunk together and meet at the crown.
 * Lucide draws the sprout from its leaf down and the tree's trunk from the
 * canopy down. The shapes are Lucide's, split and reversed, with two changes:
 * the tree's canopy sits 1.5 units higher on a trunk 5 units long instead of
 * 3, because at 20px a shrub and a tree were two clouds of nearly one size and
 * the trunk is the stroke that tells them apart.
 */
export const AGE_STAGE_PATHS: Record<AgeStage, AgeStagePath[]> = {
  mladicek: [
    { d: "M5 21h14", delay: 0, duration: 0.12, soil: true },
    {
      d: "M12 21a5 5 0 0 0 1-3c0-2-1-3-1-5a4 4 0 0 1 2-3.464",
      delay: 0.02,
      duration: 0.2,
    },
    // The pivots are measured, not guessed: getBBox gives the right leaf the
    // box (14, 3, 6 x 6.536) with (14, 9.536) at its bottom-left corner, and
    // the left leaf (4, 8, 8 x 6) with (12, 13) on its right edge, 83% down.
    {
      d: "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-2 .536",
      delay: 0.17,
      duration: 0.18,
      fold: { originX: 0, originY: 1, rotate: 35 },
    },
    {
      d: "M12 13a5 5 0 0 1-8-4 5 5 0 0 1 8 4",
      delay: 0.2,
      duration: 0.16,
      fold: { originX: 1, originY: 0.833, rotate: -35 },
    },
  ],
  odrasel: [
    {
      d: "M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5",
      delay: 0,
      duration: 0.2,
      wood: true,
    },
    { d: "M12 17l2.5-2.5", delay: 0.14, duration: 0.1, wood: true },
    {
      d: "M12 20h-2A6.5 6.5 0 0 1 7 8a5 5 0 0 1 5-5",
      delay: 0.18,
      duration: 0.28,
    },
    {
      d: "M12 20h1.8A6 6 0 0 0 17 8.8V8a5 5 0 0 0-5-5",
      delay: 0.18,
      duration: 0.28,
    },
  ],
  senior: [
    { d: "M12 22.5v-5", delay: 0, duration: 0.22, wood: true },
    {
      d: "M12 17.5H8a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 4.53V4.5a3 3 0 0 1 3-3",
      delay: 0.16,
      duration: 0.38,
    },
    {
      d: "M12 17.5h4a4 4 0 0 0 2.24-7.31 3.5 3.5 0 0 0-3.24-5.65V4.5a3 3 0 0 0-3-3",
      delay: 0.16,
      duration: 0.38,
    },
  ],
};
