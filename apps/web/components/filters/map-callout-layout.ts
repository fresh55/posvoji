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
