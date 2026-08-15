import { REGION_SHAPES, type RegionShape } from "./region-shapes";

export type Point = { x: number; y: number };
export { REGION_SHAPES, type RegionShape };

// What you click is a region, not a marker. A marker sized to mean something in
// a 209px column is a 6px dot, and no amount of tuning makes a 6px dot a
// target. The regions are Slovenia's twelve statistical regions as GURS draws
// them, so the shape you click is one you already know the name of, and picking
// one picks every shelter in it.

export function regionPath(region: RegionShape): string {
  return region.rings
    .map(
      ([first, ...rest]) =>
        `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}Z`,
    )
    .join("");
}

function inRing(point: Point, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if (
      ay > point.y !== by > point.y &&
      point.x < ((bx - ax) * (point.y - ay)) / (by - ay) + ax
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// Rings of one region are separate pieces of it, not holes, so being in any of
// them is being in the region.
export function regionContains(region: RegionShape, point: Point): boolean {
  return region.rings.some((ring) => inRing(point, ring));
}

// A town simplified off the wrong side of a border, or one just out to sea on
// the coast, still has to land somewhere: the nearest region takes it rather
// than the town losing its region entirely.
export function regionAt(point: Point): RegionShape | undefined {
  const holding = REGION_SHAPES.find((region) => regionContains(region, point));
  if (holding) return holding;

  let nearest: RegionShape | undefined;
  let best = Infinity;
  for (const region of REGION_SHAPES) {
    for (const ring of region.rings) {
      for (const [x, y] of ring) {
        const distance = (x - point.x) ** 2 + (y - point.y) ** 2;
        if (distance < best) {
          best = distance;
          nearest = region;
        }
      }
    }
  }
  return nearest;
}
