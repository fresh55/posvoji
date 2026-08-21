// Turns Natural Earth's boundaries into the small projected shapes the map
// draws around Slovenia, so the country sits in its real surroundings instead
// of floating on an empty letterbox. Run once; the output is committed, the
// 30 MB of sources are not.
//
// Three inputs, all Natural Earth 1:10m and all public domain:
//   admin-0 countries      the land fills and the Slovenia underlay
//   coastline              the hairline where land meets the Adriatic
//   rivers_lake_centerlines  Sava, Drava, Mura
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//
// Rebuild everything, fetching all three sources:
//
//   node apps/web/scripts/build-neighbors.mjs
//
// Every input and the output can be pointed elsewhere, at a local file or an
// http(s) URL, which is how a rebuild avoids three downloads:
//
//   node apps/web/scripts/build-neighbors.mjs \
//     --countries=ne_10m_admin_0_countries.geojson \
//     --coast=ne_10m_coastline.geojson \
//     --rivers=ne_10m_rivers_lake_centerlines.geojson \
//     --out=apps/web/lib/neighbor-shapes.ts
//
// The script always emits all three sections, so it always needs all three
// inputs.
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = {
  countries:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
  coast:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson",
  rivers:
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
};

const options = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (!match) throw new Error(`expected --name=value, got ${argument}`);
    return [match[1], match[2]];
  }),
);

const SRC = {
  countries: options.countries ?? SOURCE.countries,
  coast: options.coast ?? SOURCE.coast,
  rivers: options.rivers ?? SOURCE.rivers,
};
const OUT = options.out ?? new URL("../lib/neighbor-shapes.ts", import.meta.url);
const TOLERANCE = Number(options.tolerance ?? 0.35);
// The coast traces the edge of land fills that are already generalised at
// TOLERANCE. Simplified as coarsely as they are it would drift off them by up
// to twice that; a third of it keeps the line on the fill.
const COAST_TOLERANCE = TOLERANCE / 3;
// Rivers are texture, not data. Nobody measures a bend.
const RIVER_TOLERANCE = TOLERANCE * 2;

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

// Only rivers Natural Earth itself ranks as major, which inside this window is
// exactly three. Soča, Kolpa and Krka are not in the 1:10m set at all, so the
// dataset makes the "fewer is better" call before the filter does. The names
// are the Slovenian ones for what Natural Earth files as Sava, Drau and Mur.
const RIVER_MAX_SCALERANK = 7;
const RIVER_NAMES = new Map([
  ["Sava", "Sava"],
  ["Drau", "Drava"],
  ["Mur", "Mura"],
]);
// A river that only nicks a corner of the window is noise with no shape. In
// map units, against a 320 unit width.
const RIVER_MIN_LENGTH = 20;

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

function lineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return sum;
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

// Liang-Barsky on one segment. Null when the segment misses the window whole.
function clipSegment(a, b) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const edge = [-dx, dx, -dy, dy];
  const room = [a[0] - CLIP.x0, CLIP.x1 - a[0], a[1] - CLIP.y0, CLIP.y1 - a[1]];
  for (let i = 0; i < 4; i += 1) {
    if (edge[i] === 0) {
      if (room[i] < 0) return null;
      continue;
    }
    const t = room[i] / edge[i];
    if (edge[i] < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

// A polyline clipped to the window, as the runs that survive. Unlike a ring, a
// line is never closed across the gap: a river that leaves the window and comes
// back comes back as a second run, so the drawing never invents a channel.
function clipLine(points) {
  const runs = [];
  let run = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 0; i < points.length - 1; i += 1) {
    const piece = clipSegment(points[i], points[i + 1]);
    if (!piece) {
      flush();
      continue;
    }
    const [from, to] = piece;
    const tail = run[run.length - 1];
    if (!tail) run.push(from);
    else if (Math.hypot(tail[0] - from[0], tail[1] - from[1]) > 1e-9) {
      flush();
      run.push(from);
    }
    run.push(to);
  }
  flush();
  return runs;
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

const snap = (points) =>
  points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

// Cheap bbox reject before any projection work: most of Italy's 500 polygons
// are Sicilian rocks an ocean away from the window.
function nearWindow(coordinates) {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (const [lon, lat] of coordinates) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return !(
    lonMax < LON_MIN - 0.1 ||
    lonMin > LON_MIN + LON_SPAN + 0.1 ||
    latMax < LAT_MAX - LAT_SPAN - 0.1 ||
    latMin > LAT_MAX + 0.1
  );
}

function partsOf(feature) {
  const { type, coordinates } = feature.geometry;
  return type.startsWith("Multi") ? coordinates : [coordinates];
}

function ringsOf(feature) {
  const rings = [];
  for (const polygon of partsOf(feature)) {
    // Outer ring only, as build-regions.mjs does. The holes in this dataset are
    // enclaves nowhere near the window, and drawing them would only punch
    // specks in the fill.
    const [outer] = polygon;
    if (!nearWindow(outer)) continue;

    const clipped = clipToRect(outer.slice(0, -1).map(project));
    const thin = snap(simplify(clipped, TOLERANCE));
    if (thin.length >= 3 && ringArea(thin) >= 1) rings.push(thin);
  }
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  return rings;
}

// Every run of a line feature that falls inside the window, projected,
// simplified and snapped.
function linesOf(feature, tolerance) {
  const lines = [];
  for (const line of partsOf(feature)) {
    if (!nearWindow(line)) continue;
    for (const run of clipLine(line.map(project))) {
      const thin = snap(simplify(run, tolerance));
      if (thin.length >= 2) lines.push(thin);
    }
  }
  return lines;
}

async function load(source) {
  const text = /^https?:/.test(String(source))
    ? await (await fetch(source)).text()
    : readFileSync(source, "utf8");
  return JSON.parse(text);
}

const countries = await load(SRC.countries);
const byCode = new Map(
  countries.features.map((feature) => [
    feature.properties.ADM0_A3 ?? feature.properties.ISO_A3,
    feature,
  ]),
);

const neighbours = NEIGHBOURS.map(([code, name]) => {
  const feature = byCode.get(code);
  if (!feature) throw new Error(`${code} missing from ${SRC.countries}`);
  return { id: code, name, rings: ringsOf(feature) };
});
const underlay = ringsOf(byCode.get(SLOVENIA));

// The coastline as its own dataset rather than as the land polygons' unshared
// edges. Both would draw the same line, but this one needs no rule for telling
// a country border from a shore and no rule for dropping the artificial edges
// the clip rectangle adds, because it carries no such edges to begin with. It
// lands on the fills it traces: measured against the rings above, the median
// vertex sits 0.03 map units off them and the worst 0.34, which is the fills'
// own simplification tolerance.
const coastline = (await load(SRC.coast)).features.flatMap((feature) =>
  linesOf(feature, COAST_TOLERANCE),
);

const rivers = (await load(SRC.rivers)).features
  .filter(
    (feature) =>
      feature.properties.featurecla === "River" &&
      feature.properties.scalerank <= RIVER_MAX_SCALERANK &&
      RIVER_NAMES.has(feature.properties.name),
  )
  .map((feature) => ({
    name: RIVER_NAMES.get(feature.properties.name),
    lines: linesOf(feature, RIVER_TOLERANCE).filter(
      (line) => lineLength(line) >= RIVER_MIN_LENGTH,
    ),
  }))
  .filter((river) => river.lines.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name, "sl"));

const pointsLiteral = (points) =>
  `[${points.map(([x, y]) => `[${x},${y}]`).join(",")}]`;
const listLiteral = (list, indent) =>
  list.map((points) => `${indent}${pointsLiteral(points)},`).join("\n");

const neighbourBody = neighbours
  .map(
    (n) =>
      `  {\n    id: ${JSON.stringify(n.id)},\n    name: ${JSON.stringify(n.name)},\n    rings: [\n${listLiteral(n.rings, "      ")}\n    ],\n  },`,
  )
  .join("\n");

const riverBody = rivers
  .map(
    (r) =>
      `  {\n    name: ${JSON.stringify(r.name)},\n    lines: [\n${listLiteral(r.lines, "      ")}\n    ],\n  },`,
  )
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE. Do not edit by hand.
//
// The land, the coast and the rivers around Slovenia, from Natural Earth 1:10m.
// Natural Earth is public domain, so no attribution is owed and none is drawn.
// ${SOURCE.countries}
// ${SOURCE.coast}
// ${SOURCE.rivers}
//
// Rebuild with apps/web/scripts/build-neighbors.mjs, which documents its
// arguments. Coordinates are already projected by lib/geo.ts's projection and
// clipped to the viewBox with a ${MARGIN} unit margin. Fills are simplified to
// ${TOLERANCE} map units, the coast to ${COAST_TOLERANCE.toFixed(3)} so it stays on them, the rivers to
// ${RIVER_TOLERANCE} because nobody measures a bend.

export type NeighborShape = {
  /** ISO 3166-1 alpha-3, so the country is identifiable without the name. */
  id: string;
  name: string;
  rings: [number, number][][];
};

export const NEIGHBOR_SHAPES: NeighborShape[] = [
${neighbourBody}
];

// Natural Earth's Slovenia, drawn under everything in the same tone as the
// neighbours. It is never seen: the GURS country covers it. It is here because
// the two sources generalise the border differently, and without it the
// disagreement shows as a sliver of sea or canvas along the frontier.
export const SLOVENIA_UNDERLAY: [number, number][][] = [
${listLiteral(underlay, "  ")}
];

// Where land meets the Adriatic, for every landmass in the window: Italy around
// Trieste, Slovenia, and Croatian Istria. Polylines and not rings, because a
// coast is an edge and not an area, and because closing it would rule a line
// across the water wherever the window cuts it.
export const COASTLINE: [number, number][][] = [
${listLiteral(coastline, "  ")}
];

export type RiverShape = {
  /** Slovenian name. Natural Earth files these as Sava, Drau and Mur. */
  name: string;
  lines: [number, number][][];
};

// The only rivers Natural Earth ranks as major inside this window. Soča, Kolpa
// and Krka are not in the 1:10m set, so the dataset already made the cut.
export const RIVERS: RiverShape[] = [
${riverBody}
];
`,
);

const count = (lists) => lists.reduce((sum, list) => sum + list.length, 0);
console.log(
  [
    `neighbours=${neighbours.length}`,
    `rings=${neighbours.reduce((n, c) => n + c.rings.length, 0) + underlay.length}`,
    `coast=${coastline.length}/${count(coastline)}pts`,
    `rivers=${rivers.map((r) => `${r.name}:${r.lines.length}/${count(r.lines)}pts`).join(" ")}`,
    `bytes=${readFileSync(OUT).length}`,
  ].join(" "),
);
