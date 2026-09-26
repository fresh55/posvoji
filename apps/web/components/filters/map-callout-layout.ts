export type CalloutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Shared area in map units; touching edges do not overlap. */
export function intersectionArea(a: CalloutRect, b: CalloutRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  if (width <= 0) return 0;
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (height <= 0) return 0;
  return width * height;
}

/** Sum the covered area to choose the less obstructed side of a marker. */
export function coveredArea(box: CalloutRect, others: readonly CalloutRect[]): number {
  let total = 0;
  for (const other of others) {
    total += intersectionArea(box, other);
  }
  return total;
}

export type CalloutSide = "right" | "left" | "above" | "below";

/** Where a card was put: its box in the frame, the side of its mark it
 *  stands on, and how far the frame pushed it off the spot it was tried at. */
export type CalloutPlacement = CalloutRect & { side: CalloutSide; moved: number };

// Every spot a card is tried at, in order of preference, which is what breaks
// a tie. A spot is a side of the mark and how far along that side the card
// slides: 0 centres it on the mark, 1 or -1 slides it until the mark stands
// `inset` from the card's end. Beside the mark first, as a label reads, right
// before left; then slid along that side, which clears a neighbour standing
// level with the mark; then over and under it; then the finer slides and the
// corners, which are what is left on a crowded plate. Only right and left
// existed once, both centred on the mark, and a card with a coin on either
// side came down across one of them: hovering Celje sliced the Dramlje coin
// in half.
const SPOTS: readonly (readonly [CalloutSide, number])[] = [
  ["right", 0],
  ["left", 0],
  ["right", 1],
  ["right", -1],
  ["left", 1],
  ["left", -1],
  ["above", 0],
  ["below", 0],
  ["above", 1],
  ["above", -1],
  ["below", 1],
  ["below", -1],
  ...([0.5, -0.5, 0.25, -0.25, 0.75, -0.75] as const).flatMap((slide) =>
    (["right", "left", "above", "below"] as const).map(
      (side) => [side, slide] as const,
    ),
  ),
];

// The corners: the card's nearest corner a gap off the mark along the
// diagonal, for a mark with neighbours on all four sides.
const CORNERS: readonly (readonly [-1 | 1, -1 | 1])[] = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
];

/** Where a card of `size` stands beside a round mark: the spot that keeps off
 *  the mark itself, then covers the least of `avoid`, then needs the frame to
 *  push it least, with SPOTS' order breaking what is left. Every spot is
 *  clamped into the frame, `margin` in from its edge, before it is scored, so
 *  a spot that only fits once pushed competes as the box it would really be.
 *
 *  `inset` is how close to the card's end the mark may come once the card
 *  slides along a side, so it still reads as standing beside the card's body
 *  and not off a corner of it. `farther` are further gaps, each tried after
 *  every spot at the ones before it, so a card only stands off its mark by
 *  more than `gap` where that is what clears a neighbour: a card resting on
 *  a coin's rim had a clear spot a few pixels further out that nothing
 *  tried. */
export function placeCallout(
  mark: { x: number; y: number; reach: number },
  size: { width: number; height: number },
  options: {
    gap: number;
    inset: number;
    frame: { width: number; height: number; margin: number };
    avoid: readonly CalloutRect[];
    farther?: readonly number[];
  },
): CalloutPlacement {
  const { width, height } = size;
  const { inset, frame, avoid } = options;
  const slideX = Math.max(0, width / 2 - inset);
  const slideY = Math.max(0, height / 2 - inset);
  const clamp = (value: number, span: number, extent: number) =>
    Math.min(
      Math.max(value, frame.margin),
      Math.max(frame.margin, extent - span - frame.margin),
    );
  const own = {
    x: mark.x - mark.reach,
    y: mark.y - mark.reach,
    width: mark.reach * 2,
    height: mark.reach * 2,
  };
  let best: CalloutPlacement | undefined;
  let bestCost = Infinity;
  const consider = (side: CalloutSide, x: number, y: number, order: number) => {
    const box = {
      x: clamp(x, width, frame.width),
      y: clamp(y, height, frame.height),
      width,
      height,
    };
    const moved = Math.hypot(box.x - x, box.y - y);
    // Weighted so each term only decides once the ones before it are level: a
    // card on its own mark loses to anything, a unit of covered mark outweighs
    // a long push, and the order is worth less than a unit of push.
    const cost =
      intersectionArea(box, own) * 1e6 +
      coveredArea(box, avoid) * 1e3 +
      moved * 20 +
      order * 1e-3;
    if (cost < bestCost) {
      bestCost = cost;
      best = { ...box, side, moved };
    }
  };
  const gaps = [options.gap, ...(options.farther ?? []).map((extra) => options.gap + extra)];
  const perGap = SPOTS.length + CORNERS.length;
  gaps.forEach((gap, level) => {
    SPOTS.forEach(([side, slide], index) => {
      const x =
        side === "right"
          ? mark.x + mark.reach + gap
          : side === "left"
            ? mark.x - mark.reach - gap - width
            : mark.x - width / 2 + slide * slideX;
      const y =
        side === "above"
          ? mark.y - mark.reach - gap - height
          : side === "below"
            ? mark.y + mark.reach + gap
            : mark.y - height / 2 + slide * slideY;
      consider(side, x, y, level * perGap + index);
    });
    // Off the diagonal the mark's reach and the gap are a circle's, not a
    // square's, so the corner comes in to meet it.
    const along = (mark.reach + gap) * Math.SQRT1_2;
    CORNERS.forEach(([sx, sy], index) => {
      consider(
        sy < 0 ? "above" : "below",
        sx > 0 ? mark.x + along : mark.x - along - width,
        sy > 0 ? mark.y + along : mark.y - along - height,
        level * perGap + SPOTS.length + index,
      );
    });
  });
  return best!;
}

/** Keep simultaneous labels apart without moving them to the other side of
 * their marker. Earlier labels keep their positions, so placement cannot
 * oscillate as later labels report their measured sizes. */
export function avoidCalloutOverlap(
  preferred: CalloutRect,
  earlier: readonly CalloutRect[],
  bounds: { height: number; margin: number; gap: number },
): CalloutRect {
  const { height, margin, gap } = bounds;
  const bottom = Math.max(margin, height - preferred.height - margin);
  const clamp = (y: number) => Math.min(Math.max(y, margin), bottom);
  const blockers = earlier.filter((rect) =>
    preferred.x < rect.x + rect.width + gap &&
    preferred.x + preferred.width + gap > rect.x,
  );
  const candidates = [
    clamp(preferred.y),
    margin,
    bottom,
    ...blockers.flatMap((rect) => [
      clamp(rect.y - preferred.height - gap),
      clamp(rect.y + rect.height + gap),
    ]),
  ];
  const overlap = (y: number) => blockers.reduce((total, rect) => total + Math.max(
    0,
    Math.min(y + preferred.height + gap, rect.y + rect.height + gap) - Math.max(y, rect.y),
  ), 0);
  // Prefer no overlap, then the shortest move. If a physically tiny plate
  // cannot fit every label, use the least overlap while staying in its frame.
  let bestY = candidates[0];
  let bestOverlap = Infinity;
  let bestDistance = Infinity;
  for (const y of candidates) {
    const candidateOverlap = overlap(y);
    const distance = Math.abs(y - preferred.y);
    if (
      candidateOverlap < bestOverlap ||
      (candidateOverlap === bestOverlap && distance < bestDistance)
    ) {
      bestY = y;
      bestOverlap = candidateOverlap;
      bestDistance = distance;
    }
  }
  return { ...preferred, y: bestY };
}
