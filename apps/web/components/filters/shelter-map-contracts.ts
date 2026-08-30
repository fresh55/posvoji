/** What was clicked, alongside the values the click toggles. The toggle needs
 *  only the values; the panel needs to know what the visitor aimed at, so it
 *  can answer with a card about that shelter or about that group.
 *
 *  A cluster disc and a lone marker both answer for one shelter. A region, and
 *  an overflow marker that gave up on one disc per shelter, both answer for a
 *  named set of them. */
export type MapPick =
  | { kind: "shelter"; value: string }
  | { kind: "group"; label: string; values: string[] };

// The keys a roving-tabindex walk answers, regions and coins alike. Named once
// so ShelterMap's move handlers, Region's and Marker's own prop types and both
// onKeyDown branches read off the same union instead of four hand-typed copies
// that could drift apart.
export type RegionMoveKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";
