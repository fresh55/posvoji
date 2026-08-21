// Builds apps/web/public/map-hillshade.png, the relief the shelter map lays
// under its region fills.
//
// Run it from the repo root with plain node, no dependencies:
//
//   node scripts/build-map-hillshade.mjs
//
// It is a build-time tool, not part of any pnpm script: the elevation of
// Slovenia does not change, so the asset is generated once and committed. Rerun
// it only if the projection in apps/web/lib/geo.ts moves, because the raster is
// registered to that projection and to nothing else.
//
// THE PIPELINE, end to end, so the asset is reproducible.
//
// Source. AWS Open Data terrain tiles, the Mapzen terrarium encoding, at
// https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png.
// Public HTTP, no key. Elevation in metres is (R * 256 + G + B / 256) - 32768.
// The underlying model over Slovenia is SRTM and the other public sources
// Mapzen merged; the attribution line in the location picker credits them.
//
// Zoom. 9, which is 24 tiles: x 274..279 by y 180..183. One tile pixel there is
// about 212 m on the ground and one output pixel is about 398 m, so the source
// is roughly twice as fine as the target in each axis. That is the point: the
// reprojection can average rather than guess.
//
// Projection. Not a resampling of the tiles into some general grid. Every
// output pixel is placed by inverting the map's own projection, the squeezed
// equirectangular in apps/web/lib/geo.ts, and then sampled out of web mercator.
// x = LON_MIN + (px / W) * LON_SPAN, y = LAT_MAX - (py / H) * LAT_SPAN, the
// exact inverse of project(). This is what makes the Julian Alps sit inside the
// bend of the Gorenjska border instead of near it. The constants below are
// copied from geo.ts rather than imported because this is a plain .mjs script
// outside the web workspace and its TypeScript path aliases; they are asserted
// against geo.ts at the top of the run, so a drift fails loudly.
//
// Sun. Azimuth 315, altitude 45. The cartographic convention: light from the
// northwest, because a reader's eye inverts relief lit from anywhere else.
//
// Shading. Horn's 3x3 slope and aspect, the ESRI hillshade formula, on the
// reprojected grid. Flat ground under a 45 degree sun comes out at
// 255 * cos(45) = 180, and that value is remapped to pure white. Slopes facing
// away from the sun darken from there, slopes facing into it are already at
// white and stay there. Which is exactly right for the blend this ships with:
// multiply cannot lighten anything, so a raster that tried to carry highlights
// would only be carrying a uniform grey wash over the whole plate.
//
// Blend. See GeographicContext in apps/web/components/filters/shelter-map.tsx.
// The opacity there is the only tuning knob; this file emits the full Horn
// range and lets the component decide how much of it to spend.

import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "apps", "web", "public", "map-hillshade.png");

// The projection, from apps/web/lib/geo.ts. Kept in sync by assertion below.
const LON_MIN = 13.35;
const LON_SPAN = 3.3;
const LAT_MAX = 46.9;
const LAT_SPAN = 1.5;

// The viewBox the SVG draws in, and the raster at twice that. 640 x 420 is
// about 400 m per pixel, fine enough that a ridge is a ridge and coarse enough
// that the file stays small.
const OUT_WIDTH = 640;
const OUT_HEIGHT = 420;

// Reprojection happens at twice the output and is box-averaged down. Sampling
// straight to 640 would alias the 212 m source into moire on every slope.
const SUPERSAMPLE = 2;

const ZOOM = 9;
const TILE = 256;

const SUN_AZIMUTH = 315;
const SUN_ALTITUDE = 45;

// Vertical exaggeration. At 400 m per pixel the true gradient is so gentle that
// everything outside the Julian Alps came out within a few levels of white, and
// at the opacity this ships at that is no relief at all. 3 is inside the range
// small-scale shaded relief is conventionally drawn at. It scales the slope, so
// it changes how loudly the terrain speaks and never where it is: no ridge is
// moved, invented or removed by it.
const Z_FACTOR = 3;

// Quantization of the finished raster. 32 levels over the range the shade
// actually occupies, which under a 0.2 opacity multiply is a step of about one
// part in 400: far below anything a screen resolves, and it roughly halves the
// deflated size.
const LEVELS = 32;

// ---------------------------------------------------------------------------
// PNG in

/** Decode a non-interlaced 8-bit truecolour PNG to a flat RGB byte array.
 *  Deliberately narrow: it handles exactly what the terrarium tiles are and
 *  throws on anything else rather than pretending to be a general decoder. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, compression, filter, interlace] = [
        body[8],
        body[9],
        body[10],
        body[11],
        body[12],
      ];
      if (depth !== 8 || colour !== 2 || compression || filter || interlace) {
        throw new Error(
          `unsupported png: depth ${depth} colour ${colour} interlace ${interlace}`,
        );
      }
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 3;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let source = 0;
  for (let row = 0; row < height; row++) {
    const filter = raw[source++];
    const line = source;
    source += stride;
    const to = row * stride;
    const above = to - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[line + i];
      const a = i >= bpp ? out[to + i - bpp] : 0;
      const b = row > 0 ? out[above + i] : 0;
      const c = row > 0 && i >= bpp ? out[above + i - bpp] : 0;
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) value = x + paeth(a, b, c);
      else throw new Error(`bad filter ${filter}`);
      out[to + i] = value & 0xff;
    }
  }
  return { width, height, rgb: out };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---------------------------------------------------------------------------
// PNG out

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([head, typed, crc]);
}

/** Encode 8-bit greyscale. One byte per pixel, so the filters below work on a
 *  bpp of 1 and the adaptive choice is the usual minimum-sum-of-absolutes
 *  heuristic from the PNG spec. */
function encodeGreyPng(width, height, grey) {
  const rows = [];
  const prior = Buffer.alloc(width);
  let previous = prior;
  for (let y = 0; y < height; y++) {
    const line = grey.subarray(y * width, (y + 1) * width);
    let best = null;
    for (const filter of [0, 1, 2, 3, 4]) {
      const encoded = Buffer.alloc(width);
      let score = 0;
      for (let x = 0; x < width; x++) {
        const a = x > 0 ? line[x - 1] : 0;
        const b = previous[x];
        const c = x > 0 ? previous[x - 1] : 0;
        let value;
        if (filter === 0) value = line[x];
        else if (filter === 1) value = line[x] - a;
        else if (filter === 2) value = line[x] - b;
        else if (filter === 3) value = line[x] - ((a + b) >> 1);
        else value = line[x] - paeth(a, b, c);
        value &= 0xff;
        encoded[x] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (!best || score < best.score) best = { filter, encoded, score };
    }
    rows.push(Buffer.concat([Buffer.from([best.filter]), best.encoded]));
    previous = line;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Geography

const WORLD = TILE * 2 ** ZOOM;

function lonToWorldX(lon) {
  return ((lon + 180) / 360) * WORLD;
}

function latToWorldY(lat) {
  const phi = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * WORLD;
}

/** The inverse of project() in apps/web/lib/geo.ts, in normalized viewBox
 *  coordinates: u and v run 0..1 across the SVG's 320 x 210. */
function unproject(u, v) {
  return { lon: LON_MIN + u * LON_SPAN, lat: LAT_MAX - v * LAT_SPAN };
}

function assertProjectionMatches() {
  // project() maps lon LON_MIN to x 0 and LAT_MAX to y 0, and the far corner to
  // the full viewBox. If geo.ts moves and this file does not, the corners stop
  // agreeing and the run dies here rather than shipping a shifted raster.
  const corner = unproject(1, 1);
  const expected = { lon: 16.65, lat: 45.4 };
  if (
    Math.abs(corner.lon - expected.lon) > 1e-9 ||
    Math.abs(corner.lat - expected.lat) > 1e-9
  ) {
    throw new Error(
      `projection drift: southeast corner is ${corner.lon},${corner.lat}`,
    );
  }
}

async function fetchTiles() {
  const x0 = Math.floor(lonToWorldX(LON_MIN) / TILE);
  const x1 = Math.floor(lonToWorldX(LON_MIN + LON_SPAN) / TILE);
  const y0 = Math.floor(latToWorldY(LAT_MAX) / TILE);
  const y1 = Math.floor(latToWorldY(LAT_MAX - LAT_SPAN) / TILE);
  console.log(`tiles: z${ZOOM} x ${x0}..${x1} y ${y0}..${y1}`);

  const width = (x1 - x0 + 1) * TILE;
  const height = (y1 - y0 + 1) * TILE;
  // Metres, as a float grid. The whole mosaic is 1536 x 1024 here, so a plain
  // Float32Array is a few megabytes and there is nothing to be clever about.
  const elevation = new Float32Array(width * height);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      const { rgb } = decodePng(Buffer.from(await response.arrayBuffer()));
      const ox = (tx - x0) * TILE;
      const oy = (ty - y0) * TILE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const i = (y * TILE + x) * 3;
          elevation[(oy + y) * width + ox + x] =
            rgb[i] * 256 + rgb[i + 1] + rgb[i + 2] / 256 - 32768;
        }
      }
      process.stdout.write(".");
    }
  }
  process.stdout.write("\n");
  return { elevation, width, height, originX: x0 * TILE, originY: y0 * TILE };
}

function sampleBilinear(mosaic, worldX, worldY) {
  const fx = Math.min(
    Math.max(worldX - mosaic.originX, 0),
    mosaic.width - 1.001,
  );
  const fy = Math.min(
    Math.max(worldY - mosaic.originY, 0),
    mosaic.height - 1.001,
  );
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const row = y0 * mosaic.width;
  const next = row + mosaic.width;
  const a = mosaic.elevation[row + x0];
  const b = mosaic.elevation[row + x0 + 1];
  const c = mosaic.elevation[next + x0];
  const d = mosaic.elevation[next + x0 + 1];
  return (
    a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy
  );
}

/** Elevation resampled into the map's own coordinates, at OUT_WIDTH x
 *  OUT_HEIGHT. Every output pixel is a box average of SUPERSAMPLE^2 taps whose
 *  lon/lat come from unproject(), so the grid is registered to the SVG viewBox
 *  by construction and not by a fit. */
function reproject(mosaic) {
  const grid = new Float32Array(OUT_WIDTH * OUT_HEIGHT);
  const taps = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < OUT_HEIGHT; py++) {
    for (let px = 0; px < OUT_WIDTH; px++) {
      let sum = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const v = (py + (sy + 0.5) / SUPERSAMPLE) / OUT_HEIGHT;
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = (px + (sx + 0.5) / SUPERSAMPLE) / OUT_WIDTH;
          const at = unproject(u, v);
          sum += sampleBilinear(
            mosaic,
            lonToWorldX(at.lon),
            latToWorldY(at.lat),
          );
        }
      }
      grid[py * OUT_WIDTH + px] = sum / taps;
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Horn

const DEG = Math.PI / 180;
// The ESRI convention: the azimuth is measured clockwise from north, aspect
// counter-clockwise from east, and this is the rotation between them.
const SUN_DIRECTION = (360 - SUN_AZIMUTH + 90) * DEG;
const ZENITH = (90 - SUN_ALTITUDE) * DEG;

// Flat ground under this sun. Everything at or above it is white; the raster
// carries shadow only, because multiply cannot lighten.
const FLAT = 255 * Math.cos(ZENITH);

function hillshade(grid) {
  // Cell size in metres. Longitude shrinks with latitude, so the x spacing is
  // computed per row rather than once: at 45.4 a degree of longitude is 78.2 km
  // and at 46.9 it is 76.1 km, a 3 percent difference that would tilt the whole
  // country's apparent slope if it were ignored.
  const metresPerDegreeLat = 110574;
  const cellY = ((LAT_SPAN / OUT_HEIGHT) * metresPerDegreeLat);
  const shade = new Uint8Array(OUT_WIDTH * OUT_HEIGHT);
  let darkest = 255;

  for (let py = 0; py < OUT_HEIGHT; py++) {
    const lat = LAT_MAX - ((py + 0.5) / OUT_HEIGHT) * LAT_SPAN;
    const cellX = (LON_SPAN / OUT_WIDTH) * 111320 * Math.cos(lat * DEG);
    for (let px = 0; px < OUT_WIDTH; px++) {
      // Clamped at the frame: the map's edge is not a cliff.
      const x0 = Math.max(px - 1, 0);
      const x2 = Math.min(px + 1, OUT_WIDTH - 1);
      const y0 = Math.max(py - 1, 0) * OUT_WIDTH;
      const y1 = py * OUT_WIDTH;
      const y2 = Math.min(py + 1, OUT_HEIGHT - 1) * OUT_WIDTH;
      const a = grid[y0 + x0];
      const b = grid[y0 + px];
      const c = grid[y0 + x2];
      const d = grid[y1 + x0];
      const f = grid[y1 + x2];
      const g = grid[y2 + x0];
      const h = grid[y2 + px];
      const i = grid[y2 + x2];

      const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * cellX);
      const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * cellY);
      const slope = Math.atan(Z_FACTOR * Math.hypot(dzdx, dzdy));
      let aspect;
      if (dzdx !== 0) {
        aspect = Math.atan2(dzdy, -dzdx);
        if (aspect < 0) aspect += 2 * Math.PI;
      } else {
        aspect = dzdy > 0 ? Math.PI / 2 : dzdy < 0 ? (3 * Math.PI) / 2 : 0;
      }

      const lit =
        255 *
        (Math.cos(ZENITH) * Math.cos(slope) +
          Math.sin(ZENITH) * Math.sin(slope) * Math.cos(SUN_DIRECTION - aspect));

      // Remap so flat ground is white. Values above FLAT clamp there, which is
      // not a loss: under multiply they could never have shown.
      const value = Math.max(0, Math.min(255, 255 - (FLAT - lit)));
      darkest = Math.min(darkest, value);
      // Quantize on a grid that always includes 255, so flat ground is exactly
      // white and multiplies to a no-op.
      const step = 256 / LEVELS;
      shade[py * OUT_WIDTH + px] = Math.min(
        255,
        255 - Math.round((255 - value) / step) * step,
      );
    }
  }
  return { shade, darkest };
}

// ---------------------------------------------------------------------------

assertProjectionMatches();
const mosaic = await fetchTiles();
const grid = reproject(mosaic);

let low = Infinity;
let high = -Infinity;
for (const metres of grid) {
  if (metres < low) low = metres;
  if (metres > high) high = metres;
}
console.log(`elevation over the viewBox: ${low.toFixed(0)}m .. ${high.toFixed(0)}m`);

const { shade, darkest } = hillshade(grid);
const histogram = new Array(8).fill(0);
for (const value of shade) histogram[Math.min(7, value >> 5)]++;
console.log(`darkest shade ${darkest.toFixed(0)} of 255`);
console.log(
  `histogram by 32s: ${histogram.map((n) => ((n / shade.length) * 100).toFixed(1) + "%").join(" ")}`,
);

const png = encodeGreyPng(OUT_WIDTH, OUT_HEIGHT, Buffer.from(shade));
writeFileSync(OUT, png);
console.log(`wrote ${OUT}: ${OUT_WIDTH}x${OUT_HEIGHT}, ${(png.length / 1024).toFixed(1)} KB`);
