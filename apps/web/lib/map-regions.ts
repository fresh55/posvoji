import { REGION_SHAPES, type RegionShape } from "./region-shapes";

export type Point = { x: number; y: number };
export { REGION_SHAPES, type RegionShape };

// What you click is a region, not a marker. A marker sized to mean something in
// a 209px column is a 6px dot, and no amount of tuning makes a 6px dot a
// target. The regions are Slovenia's twelve statistical regions as GURS draws
// them, so the shape you click is one you already know the name of, and picking
// one picks every shelter in it.

type Ring = [number, number][];

// Exported because the neighbouring countries are the same kind of thing: rings
// already projected by the generator, drawn as one filled path.
export function ringsPath(rings: Ring[]): string {
  return rings
    .map(
      ([first, ...rest]) =>
        `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}Z`,
    )
    .join("");
}

export function regionPath(region: RegionShape): string {
  return ringsPath(region.rings);
}

const at = (point: [number, number]) => `${point[0]},${point[1]}`;

// Undirected, because the two regions sharing a border walk it in opposite
// directions.
function edgeKey(a: [number, number], b: [number, number]): string {
  const forward = `${at(a)}|${at(b)}`;
  const backward = `${at(b)}|${at(a)}`;
  return forward < backward ? forward : backward;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

// The country's own edge, found by parity: an internal border belongs to two
// regions and shows up twice, the coast and the state border show up once.
// This only compares equal because the generator snapped every vertex to a
// shared grid before writing region-shapes.ts.
function outlineRings(): Ring[] {
  const edges = new Map<
    string,
    { a: [number, number]; b: [number, number]; count: number }
  >();
  for (const region of REGION_SHAPES) {
    for (const ring of region.rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const key = edgeKey(a, b);
        const seen = edges.get(key);
        if (seen) seen.count += 1;
        else edges.set(key, { a, b, count: 1 });
      }
    }
  }

  const points = new Map<string, [number, number]>();
  const links = new Map<string, [number, number][]>();
  const link = (from: [number, number], to: [number, number]) => {
    points.set(at(from), from);
    links.set(at(from), [...(links.get(at(from)) ?? []), to]);
  };
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    link(a, b);
    link(b, a);
  }

  const rings: Ring[] = [];
  const walked = new Set<string>();
  for (const [startKey, start] of points) {
    const ring: Ring = [];
    let current = start;
    for (;;) {
      const next = (links.get(at(current)) ?? []).find(
        (candidate) => !walked.has(edgeKey(current, candidate)),
      );
      if (!next) break;
      walked.add(edgeKey(current, next));
      ring.push(current);
      current = next;
      if (at(current) === startKey) break;
    }
    // Where two neighbours' borders were simplified a tenth of a unit apart
    // the parity leaves a sliver loop. Dropped on the generator's own area
    // threshold, which leaves the coastline and nothing else.
    if (ring.length >= 3 && ringArea(ring) >= 1) rings.push(ring);
  }
  return rings;
}

const OUTLINE = outlineRings();

export function outlinePath(): string {
  return ringsPath(OUTLINE);
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
