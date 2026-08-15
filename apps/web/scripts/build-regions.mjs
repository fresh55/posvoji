// Turns the GURS statistical-region boundaries into the small projected rings
// the map draws. Run once; the output is committed, the 4 MB source is not.
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3];
const TOLERANCE = Number(process.argv[4] ?? 0.35);

// Must match apps/web/lib/geo.ts exactly, or the regions and the shelter
// markers land in different places.
const MAP_WIDTH = 320, MAP_HEIGHT = 210;
const LON_MIN = 13.35, LON_SPAN = 3.3, LAT_MAX = 46.9, LAT_SPAN = 1.5;
const project = ([lon, lat]) => [
  ((lon - LON_MIN) / LON_SPAN) * MAP_WIDTH,
  ((LAT_MAX - lat) / LAT_SPAN) * MAP_HEIGHT,
];

function perpendicular(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

// Iterative Douglas-Peucker: some rings run to tens of thousands of points and
// the recursive form overflows the stack on them.
function simplify(points, eps) {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let worst = 0, at = -1;
    for (let i = s + 1; i < e; i += 1) {
      const d = perpendicular(points[i], points[s], points[e]);
      if (d > worst) { worst = d; at = i; }
    }
    if (at >= 0 && worst > eps) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function edgeDistance(p, ring) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

// The point furthest from any edge, so a region's name sits inside it even when
// the region is a crescent and its centre of area falls in the sea.
function poleOfInaccessibility(ring) {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], bestD = -1;
  const N = 80;
  for (let i = 0; i <= N; i += 1) {
    for (let j = 0; j <= N; j += 1) {
      const p = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!inRing(p, ring)) continue;
      const d = edgeDistance(p, ring);
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return [Math.round(best[0] * 10) / 10, Math.round(best[1] * 10) / 10];
}

const geo = JSON.parse(readFileSync(SRC, "utf8"));
let before = 0, after = 0;

const regions = geo.features.map((feature) => {
  const { SR_ID, SR_UIME } = feature.properties;
  const polygons =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];

  const rings = [];
  for (const polygon of polygons) {
    // Outer ring only. The holes in this dataset are enclaves smaller than a
    // pixel here, and drawing them would only punch specks in the fill.
    const [outer] = polygon;
    before += outer.length;
    const projected = outer.map(project);
    // Drop the repeated closing point, simplify, then snap to a shared grid so
    // a border simplified from both sides lands on the same vertices and the
    // two regions do not part company along it.
    const open = projected.slice(0, -1);
    const thin = simplify(open, TOLERANCE).map(([x, y]) => [
      Math.round(x * 10) / 10,
      Math.round(y * 10) / 10,
    ]);
    if (thin.length >= 3 && ringArea(thin) >= 1) {
      after += thin.length;
      rings.push(thin);
    }
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  return { id: SR_ID, name: SR_UIME, rings, label: poleOfInaccessibility(rings[0]) };
});

regions.sort((a, b) => a.id - b.id);

const body = regions
  .map(
    (r) =>
      `  {\n    id: ${r.id},\n    name: ${JSON.stringify(r.name)},\n    label: [${r.label[0]}, ${r.label[1]}],\n    rings: [\n${r.rings
        .map((ring) => `      [${ring.map(([x, y]) => `[${x},${y}]`).join(",")}],`)
        .join("\n")}\n    ],\n  },`,
  )
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE. Do not edit by hand.
//
// Slovenia's 12 statistical regions (statisticne regije), from the Register of
// Spatial Units published by the Surveying and Mapping Authority of the
// Republic of Slovenia (GURS), via github.com/stefanb/gurs-rpe (data/SR.geojson).
// Licensed CC-BY 4.0; the attribution GURS asks for is rendered under the map.
//
// Rebuild with apps/web/scripts/build-regions.mjs. Coordinates are already
// projected by lib/geo.ts's projection and simplified to ${TOLERANCE} map units,
// which is under half a pixel at the width this map is drawn.

export type RegionShape = {
  id: number;
  name: string;
  /** Point furthest inside the region, where its name is drawn. */
  label: [number, number];
  rings: [number, number][][];
};

export const REGION_SHAPES: RegionShape[] = [
${body}
];
`,
);

console.log(
  `regions=${regions.length} points ${before} -> ${after} (${((after / before) * 100).toFixed(1)}%) bytes=${readFileSync(OUT).length}`,
);
