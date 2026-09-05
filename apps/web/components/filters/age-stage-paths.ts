export type AgeStage = "mladicek" | "odrasel" | "senior";

export type AgeStagePath = {
  d: string;
  /** Where in the draw this path starts, in seconds. Only the animated copy
   *  reads it; a printed one draws every path at once. */
  delay: number;
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
 */
export const AGE_STAGE_PATHS: Record<AgeStage, AgeStagePath[]> = {
  mladicek: [
    {
      d: "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
      delay: 0,
    },
    { d: "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4", delay: 0.035 },
    { d: "M5 21h14", delay: 0.07 },
  ],
  odrasel: [
    { d: "M12 22v-5.172a2 2 0 0 0-.586-1.414L9.5 13.5", delay: 0 },
    { d: "M14.5 14.5 12 17", delay: 0.03 },
    {
      d: "M17 8.8A6 6 0 0 1 13.8 20H10A6.5 6.5 0 0 1 7 8a5 5 0 0 1 10 0z",
      delay: 0.06,
    },
  ],
  senior: [
    { d: "M12 19v3", delay: 0 },
    {
      d: "M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z",
      delay: 0.04,
    },
  ],
};
