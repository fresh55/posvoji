// Builds apps/web/public/map-plates/<shelter>.jpg, one share image per shelter
// in data/shelters.yaml: the site's own map of Slovenia with that shelter's
// place marked on it.
//
// Run it from the repo root with plain node, no dependencies of its own:
//
//   node scripts/build-shelter-plates.mjs
//
// It needs Google Chrome installed and about ten seconds. Rerun it when the
// registry gains a shelter, when the plate's cartography changes, or when the
// projection in apps/web/lib/geo.ts moves. The output is committed, like
// public/map-hillshade.png: it is derived from repository geometry and from the
// registry, not from anything a shelter published, so it is repository content.
//
// WHY IT IS DRAWN THIS WAY.
//
// Geometry. Nothing here is a copy of the map. The region shapes, the country
// outline, the neighbours, the coast, the rivers, the projection and the
// hillshade raster are the same modules apps/web/components/filters/shelter-map
// draws from, imported straight out of the TypeScript. Node has no extensionless
// resolution and the web app's imports are extensionless, so a resolve hook
// retries a failed specifier with .ts and native type stripping does the rest.
// The plate in the share image is therefore the plate on the site by
// construction, and it cannot drift from it.
//
// Renderer. Headless Chrome over CDP, the pattern build-map-hillshade.mjs
// already establishes for build-time work. The alternative was the sharp
// pipeline the animal share cards use (apps/ingest/src/share-cards.ts), and it
// could not have drawn this: the plate leans on CSS custom properties, oklch
// colours, an SVG luminance mask and mix-blend-mode multiply for the relief,
// and librsvg supports none of the four. Chrome renders the declarations a
// browser renders, so the colours are the theme's own values rather than
// hand-converted approximations.
//
// Self-contained page. The fonts (Inter, vendored in apps/ingest/assets/fonts)
// and the hillshade raster are inlined as data URIs, so the render depends on
// no server and on no font installed on the machine. One page is loaded once
// and redrawn per shelter through a render() call rather than one page per
// shelter: the fonts are the expensive part and they are paid for once.
//
// Composition. 1200x630, the size every platform crops from, on the same ground
// the animal share cards use: a #f5f5f5 page, a white rounded surface inset 40
// with a hairline border. Left column is type, right is the plate.
//
// The fills are deliberately not the choropleth. A count baked into a static
// image goes stale the first time a shelter takes an animal in, so every region
// wears one quiet step of the density green (DENSITY_STEPS[0], the step the
// quietest live region wears on the site) and says nothing about numbers. The
// shelter's own region is lifted with the map's selection fill at a little over
// half strength: enough to name the region, short of the solid green that on
// the site means "picked".
//
// The mark is the map's spotlight, the language the municipality lookup already
// uses to answer "so where is that?": a solid accent dot inside an
// accent-strong ring. Not the animal-count coin, for the same staleness reason
// the choropleth is out.
//
// Labels are Slovenian in both locales, which is the rule the plate's own
// furniture keeps (see NEIGHBOR_LABELS in shelter-map.tsx). This is a Slovenian
// sheet whatever language the page around it is in.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The web app writes `import { x } from "./y"`, which TypeScript resolves and
// Node does not. Retry once with the extension rather than rewrite the app.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
        return next(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WEB = join(ROOT, "apps", "web");
const OUT_DIR = join(WEB, "public", "map-plates");
const HILLSHADE = join(WEB, "public", "map-hillshade.png");
const FONTS = join(ROOT, "apps", "ingest", "assets", "fonts");

// A Windows path is not an ESM specifier, so every one of these is a file URL.
const lib = (name) => pathToFileURL(join(WEB, "lib", name)).href;

const { MAP_WIDTH, MAP_HEIGHT, KM_PER_MAP_UNIT, cityAt, project } =
  await import(lib("geo.ts"));
const { outlinePath, regionPath, regionAt, ringsPath, REGION_SHAPES } =
  await import(lib("map-regions.ts"));
const { COASTLINE, NEIGHBOR_SHAPES, RIVERS, SLOVENIA_UNDERLAY } =
  await import(lib("neighbor-shapes.ts"));
const { loadShelters } = await import(lib("shelters.ts"));

// ---------------------------------------------------------------------------
// Constants

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
// Matches renderTypographicCard in apps/ingest/src/share-cards.ts, so a shelter
// plate and an animal card read as two sheets off one press.
const SURFACE_INSET = 40;
const SURFACE_RADIUS = 28;
const JPEG_QUALITY = 88;

const CDP_PORT = 9226;

// Light theme tokens from apps/web/app/globals.css, verbatim. Chrome resolves
// oklch itself, so nothing here is a conversion and nothing can drift.
const TOKEN = {
  page: "#f5f5f5",
  surface: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  mutedForeground: "oklch(0.556 0 0)",
  border: "oklch(0.922 0 0)",
  accentStrong: "oklch(0.44 0.1 151)",
  densityFill: "oklch(0.52 0.085 151)",
  selectedFill: "oklch(0.6 0.075 151)",
  sea: "oklch(0.955 0.03 230)",
  abroad: "oklch(0.972 0 0)",
  river: "oklch(0.8 0.035 230)",
  reliefOpacity: 0.22,
};

const INK_45 = "oklch(0.145 0 0 / 45%)";
const INK_35 = "oklch(0.145 0 0 / 35%)";
const INK_30 = "oklch(0.145 0 0 / 30%)";
const INK_25 = "oklch(0.145 0 0 / 25%)";

// DENSITY_STEPS[0] in apps/web/lib/map-layout.ts: the step the quietest live
// region wears. Every region gets it here, because this plate ranks nothing.
const QUIET_DENSITY = 0.2;
// The lifted region, between that quiet step and the 0.9 a picked region wears.
const REGION_LIFT = 0.62;

// From shelter-map.tsx: the ring the spotlight draws outside a marker, and the
// dot the phone layout puts inside it.
const SPOTLIGHT_RING = 3.5;
const SPOTLIGHT_DOT = 2.2;
// The mark's own label. 6 units rather than the callout's size because this
// plate is drawn at about 2.1 pixels per unit and the callout's type would come
// out under nine pixels.
const MARK_LABEL_TYPE = 6;
const MARK_LABEL_GAP = 2.5;

// From shelter-map.tsx, so the furniture sits where it sits on the site.
const NEIGHBOR_TYPE = 4.6;
const NEIGHBOR_LABELS = [
  { text: "ITALIJA", x: 4, y: 136, anchor: "start" },
  { text: "AVSTRIJA", x: 150, y: 14, anchor: "middle" },
  { text: "MADŽARSKA", x: 291, y: 17, anchor: "start", rotate: 38 },
  { text: "HRVAŠKA", x: 215, y: 200, anchor: "middle" },
];
const SEA_LABEL = {
  lines: ["Jadransko", "morje"],
  x: 12,
  y: 191,
  leading: 5,
  size: 3.4,
};
const SCALE_BAR_KM = 25;
const SCALE_BAR_RIGHT = 314;
const SCALE_BAR_Y = 176;
const SCALE_BAR_TICK = 1.5;
const SCALE_BAR_TEXT = 4.2;
const CONTEXT_FADE = 14;
const SEA_KEEP_BELOW_Y = 162;
const SEA_FADE_RESUMES_ABOVE_Y = 132;
const SEA_KEEP_LEFT_OF_X = 18;
const SEA_FADE_RESUMES_RIGHT_OF_X = 50;

// ---------------------------------------------------------------------------
// The plate, as markup

const COUNTRY_OUTLINE = outlinePath();
const UNDERLAY_PATH = ringsPath(SLOVENIA_UNDERLAY);

// An open path per line: ringsPath closes what it is given, which is right for
// land and wrong for a coast or a river.
function linesPath(lines) {
  return lines
    .map(
      ([first, ...rest]) =>
        `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}`,
    )
    .join("");
}
const COASTLINE_PATH = linesPath(COASTLINE);
const RIVERS_PATH = linesPath(RIVERS.flatMap((river) => river.lines));

function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The luminance mask that fades the surround into the frame and spares the one
 *  corner the sea lives in. Same construction as ContextFade in
 *  shelter-map.tsx, written out because there is no React here. */
function contextFadeDefs() {
  const strips = [
    { key: "t", x: 0, y: 0, w: MAP_WIDTH, h: CONTEXT_FADE, from: [0, 0], to: [0, 1] },
    { key: "b", x: 0, y: MAP_HEIGHT - CONTEXT_FADE, w: MAP_WIDTH, h: CONTEXT_FADE, from: [0, 1], to: [0, 0] },
    { key: "l", x: 0, y: 0, w: CONTEXT_FADE, h: MAP_HEIGHT, from: [0, 0], to: [1, 0] },
    { key: "r", x: MAP_WIDTH - CONTEXT_FADE, y: 0, w: CONTEXT_FADE, h: MAP_HEIGHT, from: [1, 0], to: [0, 0] },
  ];
  const keeps = [
    { key: "l", x1: 0, y1: SEA_FADE_RESUMES_ABOVE_Y, x2: 0, y2: SEA_KEEP_BELOW_Y, x: 0, y: 0, w: CONTEXT_FADE, h: MAP_HEIGHT },
    { key: "b", x1: SEA_FADE_RESUMES_RIGHT_OF_X, y1: 0, x2: SEA_KEEP_LEFT_OF_X, y2: 0, x: 0, y: MAP_HEIGHT - CONTEXT_FADE, w: MAP_WIDTH, h: CONTEXT_FADE },
  ];
  return [
    ...strips.map(
      (s) =>
        `<linearGradient id="fade-${s.key}" x1="${s.from[0]}" y1="${s.from[1]}" x2="${s.to[0]}" y2="${s.to[1]}">` +
        `<stop offset="0" stop-color="black" stop-opacity="1"/>` +
        `<stop offset="1" stop-color="black" stop-opacity="0"/></linearGradient>`,
    ),
    ...keeps.map(
      (k) =>
        `<linearGradient id="keep-${k.key}" gradientUnits="userSpaceOnUse" x1="${k.x1}" y1="${k.y1}" x2="${k.x2}" y2="${k.y2}">` +
        `<stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`,
    ),
    ...keeps.map(
      (k) =>
        `<mask id="keep-mask-${k.key}" maskUnits="userSpaceOnUse" x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}">` +
        `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" fill="url(#keep-${k.key})"/></mask>`,
    ),
    `<mask id="context-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}">` +
      `<rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="white"/>` +
      strips
        .map(
          (s) =>
            `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="url(#fade-${s.key})"` +
            (keeps.some((k) => k.key === s.key) ? ` mask="url(#keep-mask-${s.key})"` : "") +
            `/>`,
        )
        .join("") +
      `</mask>`,
  ].join("");
}

/** Everything on the plate that does not depend on which shelter it is: the
 *  ground, the relief, the water, the regions, the outline and the furniture.
 *  Built once and never redrawn; only the lift and the mark move. */
function staticPlate(hillshadeUri) {
  const scaleLength = SCALE_BAR_KM / KM_PER_MAP_UNIT;
  const scaleLeft = SCALE_BAR_RIGHT - scaleLength;
  return [
    `<defs>${contextFadeDefs()}<clipPath id="relief-clip"><path d="${COUNTRY_OUTLINE}"/></clipPath></defs>`,

    // The ground the country sits on. Sea across the frame, neighbours over it,
    // so blue survives only in the Adriatic corner and the coast is drawn by
    // the land rather than by a hand-cut sea polygon.
    `<g mask="url(#context-fade)">`,
    `<rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="${TOKEN.sea}"/>`,
    ...NEIGHBOR_SHAPES.map(
      (n) => `<path d="${ringsPath(n.rings)}" fill="${TOKEN.abroad}"/>`,
    ),
    `<path d="${UNDERLAY_PATH}" fill="${TOKEN.abroad}"/>`,
    // The relief, clipped at the frontier and multiplied in. Shadow only, so
    // the plain and the sea cost nothing and the Alps cost everything.
    `<image href="${hillshadeUri}" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}"` +
      ` preserveAspectRatio="none" clip-path="url(#relief-clip)"` +
      ` style="mix-blend-mode:multiply;opacity:${TOKEN.reliefOpacity}"/>`,
    `<path d="${RIVERS_PATH}" fill="none" stroke="${TOKEN.river}" stroke-width="0.3" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<path d="${COASTLINE_PATH}" fill="none" stroke="${INK_25}" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round"/>`,
    `</g>`,

    // One silhouette under the region strokes, so the country's own edge is not
    // left thinner than the seams inside it.
    `<path d="${COUNTRY_OUTLINE}" fill="none" stroke="${INK_45}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`,

    // The twelve regions, all on one quiet step. The lift is applied per
    // shelter by render(), which is why each carries its id.
    ...REGION_SHAPES.map(
      (region) =>
        `<path id="region-${region.id}" d="${regionPath(region)}" fill="${TOKEN.densityFill}"` +
        ` fill-opacity="${QUIET_DENSITY}" stroke="${INK_30}" stroke-width="0.6" stroke-linejoin="round"/>`,
    ),

    // Furniture: the neighbours named, the water named. Same positions, same
    // register, same alpha as the live plate.
    `<g fill="${INK_35}">`,
    ...NEIGHBOR_LABELS.map(
      (l) =>
        `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-size="${NEIGHBOR_TYPE}"` +
        ` letter-spacing="0.16em"` +
        (l.rotate != null ? ` transform="rotate(${l.rotate} ${l.x} ${l.y})"` : "") +
        `>${escapeXml(l.text)}</text>`,
    ),
    `<text x="${SEA_LABEL.x}" y="${SEA_LABEL.y}" text-anchor="middle" font-size="${SEA_LABEL.size}" font-style="italic">` +
      SEA_LABEL.lines
        .map(
          (line, i) =>
            `<tspan x="${SEA_LABEL.x}" y="${SEA_LABEL.y + i * SEA_LABEL.leading}">${line}</tspan>`,
        )
        .join("") +
      `</text>`,
    `</g>`,

    // The scale bar, in the corner the live plate keeps it in. Everything down
    // there is Croatia at this projection, so it crosses no Slovenian shape.
    `<path d="M${scaleLeft} ${SCALE_BAR_Y - SCALE_BAR_TICK}V${SCALE_BAR_Y + SCALE_BAR_TICK}` +
      `M${scaleLeft} ${SCALE_BAR_Y}H${SCALE_BAR_RIGHT}` +
      `M${SCALE_BAR_RIGHT} ${SCALE_BAR_Y - SCALE_BAR_TICK}V${SCALE_BAR_Y + SCALE_BAR_TICK}"` +
      ` fill="none" stroke="${INK_45}" stroke-width="0.5" stroke-linecap="round"/>`,
    `<text x="${SCALE_BAR_RIGHT}" y="${SCALE_BAR_Y - 2.5}" text-anchor="end" font-size="${SCALE_BAR_TEXT}" fill="${INK_45}">${SCALE_BAR_KM} km</text>`,

    // Painted last, filled in per shelter.
    `<g id="spotlight"></g>`,
  ].join("");
}

// The type column. 400 units wide inside a 1120 surface, which leaves the plate
// 688 and a country about two and a tenth pixels to the map unit: the smallest
// furniture on the sheet, the sea label at 3.4 units, still lands above seven
// pixels, so nothing on the plate is drawn at a size it cannot be read at.
const TYPE_COLUMN = 400;
const TYPE_PAD_LEFT = 56;
// The name starts here and steps down until the block fits. A registry name can
// be one word or six ("Veterinarska bolnica Brezice - zavetisce"), and a fixed
// size would either shrink the short ones for nothing or overrun the long ones.
const NAME_SIZE_MAX = 48;
const NAME_SIZE_MIN = 30;
const TYPE_BLOCK_MAX = 400;

/** The page, loaded once. render() redraws the lift, the mark and the type,
 *  which is why seventeen plates cost one font load. */
function page(hillshadeUri, regular, semibold) {
  const css = [
    `@font-face{font-family:Inter;src:url(${regular}) format("truetype");font-weight:400;font-display:block}`,
    `@font-face{font-family:Inter;src:url(${semibold}) format("truetype");font-weight:600;font-display:block}`,
    `*{margin:0;padding:0;box-sizing:border-box}`,
    `html,body{width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;overflow:hidden}`,
    `body{background:${TOKEN.page};font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}`,
    `#surface{position:absolute;left:${SURFACE_INSET}px;top:${SURFACE_INSET}px;` +
      `width:${CARD_WIDTH - SURFACE_INSET * 2}px;height:${CARD_HEIGHT - SURFACE_INSET * 2}px;` +
      `background:${TOKEN.surface};border:2px solid ${TOKEN.border};border-radius:${SURFACE_RADIUS}px;` +
      `display:flex;align-items:center;overflow:hidden}`,
    `#type{flex:0 0 ${TYPE_COLUMN}px;padding-left:${TYPE_PAD_LEFT}px;padding-right:16px}`,
    // The region name, set the way the plate sets a country: spaced capitals.
    // It is the one line that says where in Slovenia this is, so it goes first.
    `#eyebrow{font-size:14px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${TOKEN.mutedForeground}}`,
    `#name{margin-top:14px;font-weight:600;line-height:1.08;letter-spacing:-0.015em;color:${TOKEN.foreground}}`,
    `#city{margin-top:14px;font-size:24px;color:${TOKEN.mutedForeground}}`,
    `#rule{margin-top:26px;width:64px;height:2px;background:${TOKEN.accentStrong};opacity:0.8}`,
    `#wordmark{margin-top:18px;font-size:22px;font-weight:600;color:${TOKEN.accentStrong}}`,
    `#map{flex:1;padding-right:28px}`,
    `#plate{display:block;width:100%;height:auto}`,
    `#plate text{font-family:Inter,sans-serif}`,
  ].join("\n");

  const script = [
    `const QUIET = ${QUIET_DENSITY}, LIFT = ${REGION_LIFT};`,
    `const RING = ${SPOTLIGHT_RING}, DOT = ${SPOTLIGHT_DOT};`,
    `const LABEL = ${MARK_LABEL_TYPE}, GAP = ${MARK_LABEL_GAP};`,
    `const T = ${JSON.stringify(TOKEN)}, INK30 = ${JSON.stringify(INK_30)};`,
    `function fit(el, max, min, budget) {`,
    `  for (let size = max; size >= min; size -= 1) {`,
    `    el.style.fontSize = size + "px";`,
    `    if (el.parentElement.scrollHeight <= budget) return size;`,
    `  }`,
    `  return min;`,
    `}`,
    `window.render = function (data) {`,
    // Every region back to the quiet step first: the page is reused, so a lift
    // left over from the last shelter would show on this one.
    `  document.querySelectorAll('[id^="region-"]').forEach((path) => {`,
    `    path.setAttribute("fill", T.densityFill);`,
    `    path.setAttribute("fill-opacity", QUIET);`,
    `    path.setAttribute("stroke", INK30);`,
    `    path.setAttribute("stroke-width", "0.6");`,
    `  });`,
    `  const region = data.regionId == null ? null : document.getElementById("region-" + data.regionId);`,
    `  if (region) {`,
    `    region.setAttribute("fill", T.selectedFill);`,
    `    region.setAttribute("fill-opacity", LIFT);`,
    `    region.setAttribute("stroke", T.accentStrong);`,
    `    region.setAttribute("stroke-width", "1.2");`,
    `  }`,
    // The spotlight: the ring the map draws when it is pointing at a shelter,
    // the dot inside it, and the town's name beside it. A shelter in a town the
    // projection does not know gets no mark rather than a mark in the wrong
    // place, and the plate still says which region it is in.
    `  const spot = document.getElementById("spotlight");`,
    `  if (!data.at) { spot.innerHTML = ""; }`,
    `  else {`,
    `    const r = DOT + RING;`,
    `    const right = data.at.x < ${MAP_WIDTH / 2};`,
    `    spot.innerHTML =`,
    `      '<circle cx="' + data.at.x + '" cy="' + data.at.y + '" r="' + r + '" fill="none" stroke="' + T.accentStrong + '" stroke-width="1.5"/>' +`,
    `      '<circle cx="' + data.at.x + '" cy="' + data.at.y + '" r="' + DOT + '" fill="' + T.accentStrong + '"/>' +`,
    `      '<text x="' + (data.at.x + (right ? r + GAP : -(r + GAP))) + '" y="' + (data.at.y + LABEL * 0.36) + '"' +`,
    `      ' text-anchor="' + (right ? "start" : "end") + '" font-size="' + LABEL + '" font-weight="600"' +`,
    // The halo every atlas gives a place name: the ground knocked back around
    // the letters so the name reads over a region fill as well as over paper.
    // paint-order puts the stroke under the fill, which is what keeps it a
    // halo rather than an outline.
    `      ' paint-order="stroke" stroke="' + T.surface + '" stroke-width="1.6" stroke-linejoin="round"' +`,
    `      ' fill="' + T.foreground + '">' + data.city + '</text>';`,
    `  }`,
    `  document.getElementById("eyebrow").textContent = data.region || "Slovenija";`,
    `  document.getElementById("city").textContent = data.city;`,
    `  const name = document.getElementById("name");`,
    `  name.textContent = data.name;`,
    `  return fit(name, ${NAME_SIZE_MAX}, ${NAME_SIZE_MIN}, ${TYPE_BLOCK_MAX});`,
    `};`,
  ].join("\n");

  return [
    `<!doctype html><meta charset="utf-8"><title>plate</title>`,
    `<style>${css}</style>`,
    `<div id="surface">`,
    `<div id="type">`,
    `<div id="eyebrow"></div><div id="name"></div><div id="city"></div>`,
    `<div id="rule"></div><div id="wordmark">Posvoji.si</div>`,
    `</div>`,
    `<div id="map"><svg id="plate" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" xmlns="http://www.w3.org/2000/svg">`,
    staticPlate(hillshadeUri),
    `</svg></div></div>`,
    `<script>${script}</script>`,
  ].join("");
}

// ---------------------------------------------------------------------------
// Chrome

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      "no Chrome found; set CHROME_PATH to the executable and rerun",
    );
  }
  return found;
}

/** A minimal CDP client over the one WebSocket the page target exposes. The
 *  scripts this repo already shoots screenshots with are written the same way;
 *  nothing here needs a driver library. */
async function connect(port) {
  let target;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      target = (await response.json()).find((t) => t.type === "page");
      if (target) break;
    } catch {
      // Chrome is still coming up.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!target) throw new Error("no CDP target after 15s");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => socket.close() };
}

async function evaluate(cdp, expression) {
  const reply = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const details = reply.result?.exceptionDetails;
  if (details) throw new Error(details.exception?.description ?? details.text);
  return reply.result?.result?.value;
}

// ---------------------------------------------------------------------------

function shelterPoint(city) {
  const at = cityAt(city);
  if (!at) return null;
  const point = project(at);
  return { x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) };
}

const shelters = loadShelters();
if (shelters.length === 0) throw new Error("data/shelters.yaml lists no shelters");

const html = page(
  dataUri(HILLSHADE, "image/png"),
  dataUri(join(FONTS, "Inter-Regular.ttf"), "font/ttf"),
  dataUri(join(FONTS, "Inter-SemiBold.ttf"), "font/ttf"),
);

const workDir = join(tmpdir(), `posvoji-plates-${process.pid}`);
mkdirSync(workDir, { recursive: true });
const pagePath = join(workDir, "plate.html");
writeFileSync(pagePath, html);

const profile = join(workDir, "profile");
const chrome = spawn(
  findChrome(),
  [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
    `--window-size=${CARD_WIDTH},${CARD_HEIGHT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
try {
  cdp = await connect(CDP_PORT);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.navigate", { url: `file:///${pagePath.replace(/\\/g, "/")}` });
  // The fonts are inline, so this settles as soon as the parser has them.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await evaluate(
      cdp,
      `document.fonts.ready.then(() => typeof window.render === "function")`,
    ).catch(() => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  let unplaced = 0;

  for (const shelter of shelters) {
    const at = shelterPoint(shelter.city);
    if (!at) unplaced += 1;
    const region = at ? regionAt(at) : undefined;
    const size = await evaluate(
      cdp,
      `window.render(${JSON.stringify({
        name: shelter.name,
        city: shelter.city,
        region: region?.name ?? null,
        regionId: region?.id ?? null,
        at,
      })})`,
    );

    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, scale: 1 },
      captureBeyondViewport: false,
    });
    const bytes = Buffer.from(shot.result.data, "base64");
    writeFileSync(join(OUT_DIR, `${shelter.id}.jpg`), bytes);
    written.push({ id: shelter.id, bytes: bytes.length });
    console.log(
      `${shelter.id.padEnd(14)} ${(region?.name ?? "-").padEnd(20)}` +
        ` name ${String(size).padStart(2)}px  ${(bytes.length / 1024).toFixed(1)} KB` +
        (at ? "" : "  (no coordinates, no mark)"),
    );
  }

  // A shelter removed from the registry leaves a file behind, and a stale
  // plate is a plate for somebody who is not in the register any more.
  const keep = new Set(written.map((entry) => `${entry.id}.jpg`));
  let deleted = 0;
  for (const file of readdirSync(OUT_DIR)) {
    if (keep.has(file)) continue;
    rmSync(join(OUT_DIR, file));
    deleted += 1;
  }

  const total = written.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(
    `\n${written.length} plates, ${CARD_WIDTH}x${CARD_HEIGHT}, ` +
      `${(total / 1024).toFixed(1)} KB total, ${deleted} swept` +
      (unplaced ? `, ${unplaced} without coordinates` : ""),
  );
  console.log(`wrote ${OUT_DIR}`);
} finally {
  cdp?.close();
  chrome.kill();
  // Chrome does not always let go of its profile before it exits, and a
  // leftover temp directory is not worth failing a finished run over.
  try {
    rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    console.warn(`left ${workDir} behind`);
  }
}
