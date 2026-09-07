// Draws public/models/our-cat/share.jpg, the 1200x630 preview a shared link
// to the about page or to Srečko's page shows. lib/srecko.ts declares the
// file as SRECKO_SHARE_IMAGE; this is what puts it there.
//
//   pnpm --filter web generate:srecko-share
//
// The output is committed, like the model and its poster, because it changes
// only when the render or the mark does. Nothing in the build draws it.
//
// Why a browser: there is no image library in this workspace, and adding one
// to redraw a single committed file is a poor trade. The card is a 1200x630
// HTML page composed of two assets already in the repo, so the renderer the
// site already targets draws it, over CDP, headless, offline. Both assets go
// in as data URIs, which keeps the page self-contained and out of reach of
// file:// subresource rules.
//
// The card is language-neutral on purpose: one file serves /o-nas and
// /en/about and both of Srečko's pages, so it carries no sentence. It also
// carries no wordmark, because Inter is fetched by next/font at build time
// and is not in the repo, and a card that drew the site's name in some other
// face would be the one thing on it that is not the site's. og:site_name
// already says Posvoji.si beside the picture.
//
// The model's CC BY credit is deliberately not printed here. It belongs on
// the pages the card links to, where components/model-credit.tsx discloses
// it, and where a reader can follow the licence link. A line of attribution
// baked into a 1200x630 thumbnail is not a credit anyone can act on.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

const POSTER_PATH = join(webRoot, "public", "models", "our-cat", "poster.webp");
const ICON_PATH = join(webRoot, "app", "icon.svg");
const OUT_PATH = join(webRoot, "public", "models", "our-cat", "share.jpg");

/** The sizes every link preview is cropped and scaled from. */
const WIDTH = 1200;
const HEIGHT = 630;

// 88 keeps the soft edges of the whiskers and the contact shadow clean while
// leaving the file far under the 200KB an unrolled preview should cost.
const JPEG_QUALITY = 88;

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.SRECKO_SHARE_CDP_PORT ?? 9225);

// poster.webp is the resting pose captured from the page's own renderer, on
// transparency rather than on a ground, so it drops straight onto the card's
// white with no seam to hide.
const POSTER = { width: 896, height: 992 };

// Where the cat actually is inside that frame: the bounding box of every
// pixel with any alpha at all, whiskers and contact shadow included. The
// frame is mostly empty, so placing the image by its own edges would put him
// off centre and, once he is scaled to fill the card, would crop him. Re-
// measure by drawing poster.webp into a canvas and walking the alpha channel
// if the render is ever recaptured.
const CAT_BOX = { x: 177, y: 184, width: 449, height: 671 };

// The bottom 40 rows of that box are contact shadow too faint to read as
// anything. This is where he visibly ends, in the same frame coordinates.
// Composition is measured from here, not from the box, so he is centred by
// what a reader sees; the mark stands on this line too.
const CAT_FEET_Y = 813;

// He sits in the right two thirds, whole, with room above and below: this is
// his height on the card, ear tips to feet, and how far his whisker tips stay
// off the right edge. Sized against the crop, not the frame. A card is drawn
// at 1.91:1 and a 2:1 preview takes about 15px off the top and the bottom, so
// what is left above his ears has to survive that.
const CAT_VISIBLE_HEIGHT = 508;
const CAT_RIGHT_MARGIN = 148;

// Modest, and the same drawing the header and the A4 sheet carry. app/icon.svg
// is read at draw time rather than copied here so the card cannot drift from
// the mark the site ships. Bottom left, standing on the line the cat stands
// on: two things in an otherwise empty card, and a shared baseline is the one
// relation between them that does not need a rule drawn to show it.
const MARK_HEIGHT = 76;
const MARK_LEFT = 96;

/** Both from app/globals.css. Copied verbatim so the card's ground is the
 *  page's ground and its ink is the page's ink, in the light theme the card
 *  is always drawn in. */
const BACKGROUND = "oklch(1 0 0)";
const FOREGROUND = "oklch(0.145 0 0)";

function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function buildHtml() {
  const scale = CAT_VISIBLE_HEIGHT / (CAT_FEET_Y - CAT_BOX.y);
  const catLeft = WIDTH - CAT_RIGHT_MARGIN - CAT_BOX.width * scale;
  // Centred on what is visible of him, so the faint shadow under his feet
  // spills past the bottom of that rather than pushing him up the card.
  const catTop = (HEIGHT - CAT_VISIBLE_HEIGHT) / 2;
  // The <img> is placed by where the cat sits inside it, not by its own
  // corner, so the transparent margin around him falls wherever it falls.
  const imgLeft = catLeft - CAT_BOX.x * scale;
  const imgTop = catTop - CAT_BOX.y * scale;
  const markTop = catTop + CAT_VISIBLE_HEIGHT - MARK_HEIGHT;

  // The mark is masked rather than inlined as markup, the way
  // components/logo.tsx does it: app/icon.svg carries its own fill and a
  // prefers-color-scheme rule, and a mask reads only alpha, so neither
  // reaches the card and the ink stays the one set here. The aspect ratio is
  // the icon's viewBox.
  const markUri = dataUri(ICON_PATH, "image/svg+xml");

  return `<!doctype html>
<meta charset="utf-8">
<title>share card</title>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: ${BACKGROUND};
    position: relative;
  }
  .cat {
    position: absolute;
    left: ${imgLeft.toFixed(2)}px;
    top: ${imgTop.toFixed(2)}px;
    width: ${(POSTER.width * scale).toFixed(2)}px;
    height: ${(POSTER.height * scale).toFixed(2)}px;
  }
  .mark {
    position: absolute;
    left: ${MARK_LEFT}px;
    top: ${markTop.toFixed(2)}px;
    height: ${MARK_HEIGHT}px;
    aspect-ratio: 128 / 120.8;
    background-color: ${FOREGROUND};
    mask: url("${markUri}") no-repeat center / contain;
    -webkit-mask: url("${markUri}") no-repeat center / contain;
  }
</style>
<img class="cat" alt="" src="${dataUri(POSTER_PATH, "image/webp")}">
<span class="mark"></span>
`;
}

/* -- CDP ---------------------------------------------------------------- */

async function debuggerUrl() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome has not opened the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`no debuggable page on port ${PORT} after 30s`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
      once: true,
    });
  });

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();

  socket.addEventListener("message", async (event) => {
    // Frames arrive as Blobs under Node's global WebSocket.
    const text = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(text);
    if (message.id === undefined) {
      for (const listener of listeners) listener(message);
      return;
    }
    const waiting = pending.get(message.id);
    pending.delete(message.id);
    if (!waiting) return;
    if (message.error) waiting.reject(new Error(`${message.error.message ?? "CDP error"}`));
    else waiting.resolve(message.result);
  });

  return {
    send(method, params = {}) {
      const id = (nextId += 1);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method, timeoutMs = 30000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`timed out waiting for ${method}`));
        }, timeoutMs);
        const listener = (message) => {
          if (message.method !== method) return;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(message.params);
        };
        listeners.add(listener);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function capture(htmlPath) {
  // A fresh profile per launch: a reused one can hold a lock from a previous
  // run and the port then answers for the wrong browser.
  const profile = mkdtempSync(join(tmpdir(), "srecko-share-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp;
  try {
    cdp = await connect(await debuggerUrl());
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
    await loaded;
    // The load event does not promise the image is decoded and painted.
    await cdp.send("Runtime.evaluate", {
      expression: `(async () => {
        await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })()`,
      awaitPromise: true,
    });
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: JPEG_QUALITY,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
    });
    return Buffer.from(shot.data, "base64");
  } finally {
    cdp?.close();
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Windows can still hold the profile open; it is a temp dir either way.
    }
  }
}

/* -- verification ------------------------------------------------------- */

/** Reads the frame size out of a JPEG's SOF segment, so the committed file is
 *  checked against what the preview scrapers expect rather than assumed. */
function jpegSize(buffer) {
  if (buffer.readUInt16BE(0) !== 0xffd8) throw new Error("not a JPEG");
  let offset = 2;
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) throw new Error("lost the marker chain");
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    // Every SOFn but the four that are not frame headers.
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("no SOF segment");
}

/* -- main --------------------------------------------------------------- */

const staging = mkdtempSync(join(tmpdir(), "srecko-card-"));
const htmlPath = join(staging, "card.html");
writeFileSync(htmlPath, buildHtml(), "utf8");

try {
  const jpeg = await capture(htmlPath);
  const { width, height } = jpegSize(jpeg);
  if (width !== WIDTH || height !== HEIGHT) {
    throw new Error(`drew ${width}x${height}, wanted ${WIDTH}x${HEIGHT}`);
  }
  writeFileSync(OUT_PATH, jpeg);
  console.log(`${OUT_PATH}: ${width}x${height}, ${jpeg.length} bytes`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
