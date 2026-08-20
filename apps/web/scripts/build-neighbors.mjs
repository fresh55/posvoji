// Turns Natural Earth's country boundaries into the small projected rings the
// map draws around Slovenia, so the country sits in its real surroundings
// instead of floating on an empty letterbox. Run once; the output is
// committed, the 13 MB source is not.
//
// Source: Natural Earth admin-0 countries, 1:10m, public domain.
// https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
//
//   node apps/web/scripts/build-neighbors.mjs <src|url> apps/web/lib/neighbor-shapes.ts [tolerance]
//
// The first argument is a local file or an http(s) URL; with no argument the
// URL above is fetched.
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson";

const SRC = process.argv[2] ?? SOURCE_URL;
const OUT = process.argv[3] ?? new URL("../lib/neighbor-shapes.ts", import.meta.url);
const TOLERANCE = Number(process.argv[4] ?? 0.35);

// Must match apps/web/lib/geo.ts exactly, or the neighbours and the country
// land in different places.
const MAP_WIDTH = 320, MAP_HEIGHT = 210;
const LON_MIN = 13.35, LON_SPAN = 3.3, LAT_MAX = 46.9, LAT_SPAN = 1.5;
const project = ([lon, lat]) => [
  ((lon - LON_MIN) / LON_SPAN) * MAP_WIDTH,
  ((LAT_MAX - lat) / LAT_SPAN) * MAP_HEIGHT,
];

// The four countries Slovenia touches. Slovenia itself is carried too, but as
// the underlay described at the bottom of this file, never as a neighbour.
const NEIGHBOURS = [
  ["ITA", "Italija"],
  ["AUT", "Avstrija"],
  ["HUN", "Madžarska"],
  ["HRV", "Hrvaška"],
];
const SLOVENIA = "SVN";

// A little past the viewBox, so a stroke on a clipped edge falls outside the
// drawing rather than ruling a line down it.
const MARGIN = 2;
const CLIP = {
  x0: -MARGIN,
  y0: -MARGIN,
  x1: MAP_WIDTH + MARGIN,
  y1: MAP_HEIGHT + MARGIN,
};

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

// Sutherland-Hodgman against the viewBox rectangle, one edge at a time. Only
// convex clip windows work this way, which a rectangle is. Concave input is
// fine: it can come back joined along the boundary, and a fill does not care.
function clipToRect(ring) {
  const inside = [
    (p) => p[0] >= CLIP.x0,
    (p) => p[0] <= CLIP.x1,
    (p) => p[1] >= CLIP.y0,
    (p) => p[1] <= CLIP.y1,
  ];
  const cross = [
    (a, b) => intersect(a, b, 0, CLIP.x0),
    (a, b) => intersect(a, b, 0, CLIP.x1),
    (a, b) => intersect(a, b, 1, CLIP.y0),
    (a, b) => intersect(a, b, 1, CLIP.y1),
  ];

  let output = ring;
  for (let edge = 0; edge < 4 && output.length; edge += 1) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i], previous = input[(i - 1 + input.length) % input.length];
      const currentIn = inside[edge](current), previousIn = inside[edge](previous);
      if (currentIn) {
        if (!previousIn) output.push(cross[edge](previous, current));
        output.push(current);
      } else if (previousIn) {
        output.push(cross[edge](previous, current));
      }
    }
  }
  return output;
}

// Where the segment a-b meets the line axis = value.
function intersect(a, b, axis, value) {
  const other = axis === 0 ? 1 : 0;
  const span = b[axis] - a[axis];
  const t = Math.abs(span) < 1e-12 ? 0 : (value - a[axis]) / span;
  const point = [];
  point[axis] = value;
  point[other] = a[other] + t * (b[other] - a[other]);
  return point;
}

function ringsOf(feature) {
  const polygons =
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];

  const rings = [];
  for (const polygon of polygons) {
    // Outer ring only, as build-regions.mjs does. The holes in this dataset are
    // enclaves nowhere near the window, and drawing them would only punch
    // specks in the fill.
    const [outer] = polygon;
    // Cheap bbox reject first: most of Italy's 500 polygons are Sicilian rocks
    // an ocean away from the window.
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const [lon, lat] of outer) {
      if (lon < lonMin) lonMin = lon;
      if (lon > lonMax) lonMax = lon;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
    }
    if (
      lonMax < LON_MIN - 0.1 ||
      lonMin > LON_MIN + LON_SPAN + 0.1 ||
      latMax < LAT_MAX - LAT_SPAN - 0.1 ||
      latMin > LAT_MAX + 0.1
    ) {
      continue;
    }

    const clipped = clipToRect(outer.slice(0, -1).map(project));
    const thin = simplify(clipped, TOLERANCE).map(([x, y]) => [
      Math.round(x * 10) / 10,
      Math.round(y * 10) / 10,
    ]);
    if (thin.length >= 3 && ringArea(thin) >= 1) rings.push(thin);
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  return rings;
}

const text = /^https?:/.test(String(SRC))
  ? await (await fetch(SRC)).text()
  : readFileSync(SRC, "utf8");
const geo = JSON.parse(text);

const byCode = new Map(
  geo.features.map((feature) => [
    feature.properties.ADM0_A3 ?? feature.properties.ISO_A3,
    feature,
  ]),
);

const neighbours = NEIGHBOURS.map(([code, name]) => {
  const feature = byCode.get(code);
  if (!feature) throw new Error(`${code} missing from ${SRC}`);
  return { id: code, name, rings: ringsOf(feature) };
});
const underlay = ringsOf(byCode.get(SLOVENIA));

const ringsLiteral = (rings, indent) =>
  rings
    .map((ring) => `${indent}[${ring.map(([x, y]) => `[${x},${y}]`).join(",")}],`)
    .join("\n");

const body = neighbours
  .map(
    (n) =>
      `  {\n    id: ${JSON.stringify(n.id)},\n    name: ${JSON.stringify(n.name)},\n    rings: [\n${ringsLiteral(n.rings, "      ")}\n    ],\n  },`,
  )
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE. Do not edit by hand.
//
// The land around Slovenia, from Natural Earth admin-0 countries 1:10m.
// Natural Earth is public domain, so no attribution is owed and none is drawn.
// ${SOURCE_URL}
//
// Rebuild with apps/web/scripts/build-neighbors.mjs. Coordinates are already
// projected by lib/geo.ts's projection, clipped to the viewBox with a ${MARGIN}
// unit margin, and simplified to ${TOLERANCE} map units.

export type NeighborShape = {
  /** ISO 3166-1 alpha-3, so the country is identifiable without the name. */
  id: string;
  name: string;
  rings: [number, number][][];
};

export const NEIGHBOR_SHAPES: NeighborShape[] = [
${body}
];

// Natural Earth's Slovenia, drawn under everything in the same tone as the
// neighbours. It is never seen: the GURS country covers it. It is here because
// the two sources generalise the border differently, and without it the
// disagreement shows as a sliver of sea or canvas along the frontier.
export const SLOVENIA_UNDERLAY: [number, number][][] = [
${ringsLiteral(underlay, "  ")}
];
`,
);

const points = [...neighbours.flatMap((n) => n.rings), ...underlay].reduce(
  (sum, ring) => sum + ring.length,
  0,
);
console.log(
  `neighbours=${neighbours.length} rings=${neighbours.reduce((n, c) => n + c.rings.length, 0) + underlay.length} points=${points} bytes=${readFileSync(OUT).length}`,
);
