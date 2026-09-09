// The press both card generators print on: headless Chrome over CDP, one
// 1200x630 sheet drawn on the site's own light tokens.
//
// scripts/build-shelter-plates.mjs drew the first sheet and
// scripts/build-og-card.mjs was written from it, which left about 120 lines
// standing twice: the Chrome hunt, the CDP client, the spawn argv, the
// temp-directory teardown, the token block and the reset CSS. Two copies of a
// colour is how one goes stale, and one had. The plates kept
// oklch(0.556 0 0) for the muted ink after apps/web/app/globals.css retuned
// --muted-foreground to oklch(0.52 0 0), and nothing noticed. There is one
// copy of it here now.
//
// What differs between the two sheets stays a parameter: the CDP port, the
// name of the temp directory, what "loaded" means for that page, and the
// screenshot format. The rest is the same press.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
// Matches renderTypographicCard in apps/ingest/src/share-cards.ts, so a shelter
// plate, the site's own card and an animal card read as three sheets off one
// press.
export const SURFACE_INSET = 40;
export const SURFACE_RADIUS = 28;

// Light theme tokens from apps/web/app/globals.css, verbatim. Chrome resolves
// oklch itself, so nothing here is a conversion and nothing can drift.
//
// page is the one value that is not a globals.css token. --background is white,
// which is the surface here; the ground under it is COLOR.page in
// apps/ingest/src/share-cards.ts, the flat the animal cards already sit on.
export const TOKEN = {
  page: "#f5f5f5",
  surface: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  mutedForeground: "oklch(0.52 0 0)",
  border: "oklch(0.922 0 0)",
  accentStrong: "oklch(0.44 0.1 151)",
};

// ---------------------------------------------------------------------------
// The sheet, as markup

export function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

/** Text written into markup. Both sheets write into element content, where the
 *  ampersand and the angle brackets are what matter. The quote is escaped as
 *  well, which content does not need and an attribute would, so one function
 *  covers both. */
export function escapeText(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The stylesheet both sheets open with: the vendored Inter faces inlined, so
 *  the render depends on no font installed on the machine, a reset, the page
 *  ground, and the white surface inset in it with its hairline border.
 *  Returned as lines, which the caller's own rules follow. */
export function pressCss(regular, semibold) {
  return [
    `@font-face{font-family:Inter;src:url(${regular}) format("truetype");font-weight:400;font-display:block}`,
    `@font-face{font-family:Inter;src:url(${semibold}) format("truetype");font-weight:600;font-display:block}`,
    `*{margin:0;padding:0;box-sizing:border-box}`,
    `html,body{width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;overflow:hidden}`,
    `body{background:${TOKEN.page};font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}`,
    `#surface{position:absolute;left:${SURFACE_INSET}px;top:${SURFACE_INSET}px;` +
      `width:${CARD_WIDTH - SURFACE_INSET * 2}px;height:${CARD_HEIGHT - SURFACE_INSET * 2}px;` +
      `background:${TOKEN.surface};border:2px solid ${TOKEN.border};border-radius:${SURFACE_RADIUS}px;` +
      `display:flex;align-items:center;overflow:hidden}`,
  ];
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
export async function connect(port) {
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

export async function evaluate(cdp, expression) {
  const reply = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const details = reply.result?.exceptionDetails;
  if (details) throw new Error(details.exception?.description ?? details.text);
  return reply.result?.result?.value;
}

/** The whole run: `html` written to a temp directory, Chrome started on it
 *  headless, and the loaded page handed to `draw`. One page is loaded once,
 *  however many sheets `draw` shoots off it.
 *
 *  `name` names the temp directory and `port` is the debugging port, both the
 *  caller's so that two of these can run at the same time. `ready` is a JS
 *  expression the page must answer true to before `draw` is called. */
export async function press({ name, port, file, ready, html }, draw) {
  const workDir = join(tmpdir(), `posvoji-${name}-${process.pid}`);
  mkdirSync(workDir, { recursive: true });
  const pagePath = join(workDir, file);
  writeFileSync(pagePath, html);

  const profile = join(workDir, "profile");
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
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
    cdp = await connect(port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send("Page.navigate", {
      url: `file:///${pagePath.replace(/\\/g, "/")}`,
    });
    // The fonts, the mark and the raster are all inline, so this settles as
    // soon as the parser has them. Nothing either caller does works without
    // it, so a page that never gets there throws here rather than failing
    // later on something that says less.
    let loaded = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      loaded = await evaluate(
        cdp,
        `document.fonts.ready.then(() => ${ready})`,
      ).catch(() => false);
      if (loaded) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!loaded) throw new Error("the page never finished loading its fonts");

    return await draw(cdp);
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
}

/** One sheet, clipped to the card and nothing around it. `options` carries the
 *  format, which is the one thing the two sheets disagree on. */
export async function capture(cdp, options) {
  const shot = await cdp.send("Page.captureScreenshot", {
    ...options,
    clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, scale: 1 },
    captureBeyondViewport: false,
  });
  return Buffer.from(shot.result.data, "base64");
}
