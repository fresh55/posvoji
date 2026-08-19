// Downloads the GURS postal-district and municipality polygons and derives the
// postcode -> municipality table the found-animal lookup resolves against.
// Run once; the output is committed, the network fetch is not part of the build.
//
// A postal district may straddle several municipalities, so every municipality
// holding a meaningful share of the district is written out, largest first:
// the district is sampled on a grid and each sample point is attributed to the
// municipality containing it. A caller can take the first entry when it clearly
// dominates and ask the user which one otherwise, rather than guessing.
//
// Municipality names are rewritten to the spellings in data/municipalities.yaml
// (GURS writes "Dobrova-Polhov Gradec", the register we key on writes
// "Dobrova - Polhov Gradec"), and an unmatchable name fails the run instead of
// producing a table that silently misses a municipality.
import { readFileSync, writeFileSync } from "node:fs";

const PT_SRC =
  process.argv[2] ??
  "https://raw.githubusercontent.com/stefanb/gurs-rpe/master/data/PT.geojson";
const OB_SRC =
  process.argv[3] ??
  "https://raw.githubusercontent.com/stefanb/gurs-rpe/master/data/OB.geojson";
const OUT =
  process.argv[4] ??
  new URL("../lib/postcode-municipalities.ts", import.meta.url);

// Target sample points inside a district. Enough that a municipality holding a
// tenth of a district still lands several points.
const TARGET_SAMPLES = 240;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.json();
}

/** Every ring of a Polygon or MultiPolygon, outer rings and holes alike. */
function ringsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function bboxOf(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of ringsOf(geometry)) {
    for (const [x, y] of polygon[0]) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// A point counts as inside when it is within an outer ring and not inside any
// of that ring's holes.
function contains(geometry, x, y) {
  for (const polygon of ringsOf(geometry)) {
    if (!inRing(x, y, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h += 1) {
      if (inRing(x, y, polygon[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

// Names the spatial register shortens beyond what folding can reconcile.
const ALIASES = { kanal: "kanal ob soci" };

// Fold to a key that survives the two registers' spelling differences: case,
// diacritics, spacing around hyphens, and the "Slov." abbreviation.
function nameKey(name) {
  const key = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bslov\./g, "slovenskih")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return ALIASES[key] ?? key;
}

const canonical = new Map(
  [
    ...readFileSync(
      new URL("../../../data/municipalities.yaml", import.meta.url),
      "utf8",
    ).matchAll(/^ {2}- name: (.+)$/gm),
  ].map((match) => {
    const name = match[1].trim();
    return [nameKey(name), name];
  }),
);
if (canonical.size !== 212) {
  throw new Error(`expected 212 municipalities in yaml, got ${canonical.size}`);
}

const [ptData, obData] = await Promise.all([getJson(PT_SRC), getJson(OB_SRC)]);

const unmatched = obData.features
  .map((feature) => feature.properties.OB_UIME)
  .filter((name) => !canonical.has(nameKey(name)));
if (unmatched.length > 0) {
  throw new Error(
    `GURS municipality names not in data/municipalities.yaml: ${unmatched.join(", ")}`,
  );
}

const municipalities = obData.features.map((feature) => ({
  name: canonical.get(nameKey(feature.properties.OB_UIME)),
  geometry: feature.geometry,
  bbox: bboxOf(feature.geometry),
}));
console.log(`municipalities=${municipalities.length}`);

function municipalityAt(x, y) {
  for (const municipality of municipalities) {
    const { minX, minY, maxX, maxY } = municipality.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (contains(municipality.geometry, x, y)) return municipality.name;
  }
  return undefined;
}

// Area-weighted centroid of a ring, used to give each municipality one point
// to measure "nearest shelter" from. Falls back to the vertex average when a
// ring has no area to speak of.
function ringCentroid(ring) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    twiceArea += cross;
    x += (ring[j][0] + ring[i][0]) * cross;
    y += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    return [
      ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
      ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
    ];
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

const centroids = obData.features
  .map((feature) => {
    // Largest outer ring, so an island does not drag the point off the
    // mainland body of the municipality.
    const outer = ringsOf(feature.geometry)
      .map((polygon) => polygon[0])
      .sort((a, b) => b.length - a.length)[0];
    const [lon, lat] = ringCentroid(outer);
    return {
      name: canonical.get(nameKey(feature.properties.OB_UIME)),
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "sl"));

const rows = [];
const unresolved = [];

for (const feature of ptData.features) {
  const code = String(feature.properties.PT_ID).padStart(4, "0");
  const name = feature.properties.PT_UIME;
  const bbox = bboxOf(feature.geometry);
  const width = bbox.maxX - bbox.minX;
  const height = bbox.maxY - bbox.minY;

  // A grid sized so a district roughly fills TARGET_SAMPLES points, kept
  // square in geographic terms so long thin districts are not undersampled.
  const aspect = width / height || 1;
  const cols = Math.max(4, Math.round(Math.sqrt(TARGET_SAMPLES * aspect)));
  const linesCount = Math.max(4, Math.round(TARGET_SAMPLES / cols));

  const tally = new Map();
  let hits = 0;
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < linesCount; j += 1) {
      const x = bbox.minX + (width * (i + 0.5)) / cols;
      const y = bbox.minY + (height * (j + 0.5)) / linesCount;
      if (!contains(feature.geometry, x, y)) continue;
      const municipality = municipalityAt(x, y);
      if (!municipality) continue;
      hits += 1;
      tally.set(municipality, (tally.get(municipality) ?? 0) + 1);
    }
  }

  if (hits === 0) {
    // Tiny or awkward districts can miss every grid point. The centroid of the
    // first ring is the fallback, and a district that still resolves to
    // nothing is reported rather than guessed at.
    const ring = ringsOf(feature.geometry)[0][0];
    const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length;
    const cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
    const municipality = municipalityAt(cx, cy);
    if (!municipality) {
      unresolved.push(`${code} ${name}`);
      continue;
    }
    rows.push({ code, name, municipalities: [municipality] });
    continue;
  }

  // Slivers below a twentieth of the district are boundary noise from the
  // grid, not places anyone would call this postcode.
  const ranked = [...tally.entries()]
    .map(([municipality, count]) => ({ municipality, share: count / hits }))
    .filter((entry) => entry.share >= 0.05)
    .sort((a, b) => b.share - a.share);
  rows.push({
    code,
    name,
    municipalities: ranked.map((entry) => entry.municipality),
  });
}

rows.sort((a, b) => a.code.localeCompare(b.code));

if (unresolved.length > 0) {
  console.log(`unresolved=${unresolved.length}: ${unresolved.join(", ")}`);
}
const split = rows.filter((row) => row.municipalities.length > 1).length;
const covered = new Set(rows.flatMap((row) => row.municipalities));
console.log(
  `districts=${rows.length} split=${split} municipalities-reachable=${covered.size}/212`,
);

const body = rows
  .map(
    (row) =>
      `  { code: ${JSON.stringify(row.code)}, name: ${JSON.stringify(row.name)}, municipalities: [${row.municipalities.map((m) => JSON.stringify(m)).join(", ")}] },`,
  )
  .join("\n");

writeFileSync(
  OUT,
  `// GENERATED FILE. Do not edit by hand.
//
// Postcode -> municipality (občina), derived from the Register of Spatial
// Units published by the Surveying and Mapping Authority of the Republic of
// Slovenia (GURS), via github.com/stefanb/gurs-rpe (PT.geojson, OB.geojson).
// Licensed CC BY 4.0.
//
// A postal district may straddle municipalities. \`municipalities\` lists every
// one holding at least a twentieth of the district, largest share first, so a
// single entry is an answer and several entries are a question to put to the
// reader.
//
// Rebuild with: pnpm --filter web generate:postcode-municipalities

export type PostcodeMunicipality = {
  code: string;
  name: string;
  municipalities: string[];
};

export const POSTCODE_MUNICIPALITIES: PostcodeMunicipality[] = [
${body}
];

/** One point per municipality, for measuring which shelters are nearest to a
 *  municipality we have no verified coverage for. */
export type MunicipalityCentroid = {
  name: string;
  lat: number;
  lon: number;
};

export const MUNICIPALITY_CENTROIDS: MunicipalityCentroid[] = [
${centroids
  .map(
    (c) =>
      `  { name: ${JSON.stringify(c.name)}, lat: ${c.lat}, lon: ${c.lon} },`,
  )
  .join("\n")}
];
`,
);
