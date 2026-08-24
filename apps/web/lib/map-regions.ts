import { MAP_WIDTH } from "./geo";
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

// An open path per line. ringsPath closes every ring it is given, which is
// right for land and wrong for a coast or a river: closing one would rule a
// chord back across the water it was drawing. Exported because the plate
// generator draws the same coast and the same rivers.
export function linesPath(lines: Ring[]): string {
  return lines
    .map(
      ([first, ...rest]) =>
        `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}`,
    )
    .join("");
}

export function regionPath(region: RegionShape): string {
  return ringsPath(region.rings);
}

// Every region's path string, keyed by region id, built once. The twelve
// shapes carry about 2200 vertices between them and never change, so walking
// them per render was the largest per-frame cost on the plate. Both the dialog
// map and the trigger's mini map read this.
export const REGION_PATHS = new Map<number, string>(
  REGION_SHAPES.map((region) => [region.id, regionPath(region)]),
);

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

// Same for every render, and the walk behind it is not free: the outline is
// the same ~2200 vertices the regions carry. Every component reads this
// constant; outlinePath stays for the plate generator, which imports this
// module fresh per run.
export const OUTLINE_PATH = ringsPath(OUTLINE);

// The same twelve shapes and the same outline, thinned for the trigger-sized
// mini map (components/filters/mini-map.tsx). It draws at 24 CSS px across this
// module's 320-unit viewBox, so one pixel spans over 13 units and the plate's
// full-resolution geometry is two orders of magnitude finer than anything that
// can land on screen. Two instances of that icon were 71KB of the home page's
// HTML, nearly all of it coordinates describing sub-pixel wobble.
//
// Kept here beside REGION_PATHS rather than in the component, so a second
// small-map consumer gets it instead of copying the thinning.
//
// Deliberately not the generator's simplifier: scripts/build-regions.mjs runs
// perpendicular-distance Douglas-Peucker against a segment and snaps the result
// to a shared grid, so borders simplified from both sides stay identical. This
// is a cheaper chord test against the last kept vertex, which can thin two
// sides of one border differently. At 24px, under a stroked outline, that is
// invisible, and the parity walk that needs identical vertices has already run
// above on the unthinned shapes.
const MINI_MAP_PX = 24;
// A vertex closer than this to the last kept one cannot change the picture:
// 0.15 of a pixel at the size this renders, which measured 0.35% of drift in
// total filled area. Derived rather than written down, so it cannot outlive a
// change to the viewBox (see KM_PER_MAP_UNIT in geo.ts).
const MINI_SIMPLIFY_UNITS = (MAP_WIDTH / MINI_MAP_PX) * 0.15;

function thinRing(ring: Ring): Ring {
  const kept: Ring = [];
  for (const point of ring) {
    const last = kept[kept.length - 1];
    // The first vertex always survives: it is where the ring starts, and a
    // ring that loses it starts somewhere else. Rounding to whole units is
    // another 0.075px and cannot merge two kept vertices, which the threshold
    // has already held a full unit apart.
    if (
      !last ||
      Math.abs(point[0] - last[0]) >= MINI_SIMPLIFY_UNITS ||
      Math.abs(point[1] - last[1]) >= MINI_SIMPLIFY_UNITS
    ) {
      kept.push([Math.round(point[0]), Math.round(point[1])]);
    }
  }
  return kept;
}

// A ring thinned below a triangle encloses nothing, so it goes rather than
// being drawn as a degenerate sliver.
const thinRings = (rings: Ring[]): Ring[] =>
  rings.map(thinRing).filter((ring) => ring.length >= 3);

export const MINI_REGION_PATHS = new Map<number, string>(
  REGION_SHAPES.map((region) => [region.id, ringsPath(thinRings(region.rings))]),
);

export const MINI_OUTLINE_PATH = ringsPath(thinRings(OUTLINE));

export function outlinePath(): string {
  return OUTLINE_PATH;
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
