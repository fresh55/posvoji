// Builds apps/web/public/og-card.png, the one share card the site itself has.
//
// Run it from the repo root with plain node, no dependencies of its own:
//
//   node scripts/build-og-card.mjs
//
// It needs Google Chrome installed and about five seconds. Rerun it when the
// mark in apps/web/app/icon.svg changes, when the sentence it prints changes in
// apps/web/lib/i18n.ts, or when the tokens below move. The output is committed,
// like the shelter plates: it is drawn from repository content and from nothing
// a shelter published.
//
// WHY THERE IS ONE.
//
// Every animal page and every shelter page already had a card. The fixed pages
// had none, so the home page, the shelters index, the found-animal page and the
// resources page were the only links from this domain that pasted into a chat
// as a bare row of text. lib/site-metadata.ts states the exit condition this
// file takes: one card, added there once, and every fixed page gets it. A page
// with a picture of its own still shows that instead.
//
// One card and not one per language. It carries the mark, the wordmark and the
// sentence the site's own description states, and no per-page text, so a locale
// split would translate nothing. The alternative text is per locale and lives
// in lib/site-metadata.ts, which is the part somebody hears.
//
// WHY IT IS DRAWN THIS WAY.
//
// Renderer. Headless Chrome over CDP, the same as scripts/build-shelter-plates.
// mjs and for the same reason: the mark is app/icon.svg painted through a CSS
// mask and the colours are the theme's own oklch values, and the librsvg
// pipeline the animal share cards use supports neither. Chrome renders the
// declarations a browser renders, so nothing here is a hand converted
// approximation of a token. The press the two share is scripts/card-press.mjs.
//
// Composition. 1200x630 on the same press as the shelter plates: a #f5f5f5
// page, a white surface inset 40 with a hairline border, type on the left. What
// sits on the right is the mark rather than a map, because this sheet is about
// the site and not about a place.
//
// PNG and not the plates' JPEG. This card is flat colour and type on white,
// which is the case JPEG rings around; the plates carry a shaded raster, which
// is the case it is for.
//
// Words. The wordmark is the site's name and the line under it is the
// catalogue's own metadataDescription, imported rather than retyped, so the
// card cannot end up promising something the head's description does not. Both
// are Slovenian, the rule the plates keep as well.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  SURFACE_INSET,
  TOKEN,
  capture,
  dataUri,
  escapeText,
  evaluate,
  press,
  pressCss,
} from "./card-press.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WEB = join(ROOT, "apps", "web");
const OUT_DIR = join(WEB, "public");
const OUT_FILE = join(OUT_DIR, "og-card.png");
const ICON = join(WEB, "app", "icon.svg");
const FONTS = join(ROOT, "apps", "ingest", "assets", "fonts");

// A Windows path is not an ESM specifier, so this is a file URL.
const { getMessages } = await import(
  pathToFileURL(join(WEB, "lib", "i18n.ts")).href
);

// ---------------------------------------------------------------------------
// Constants

const CDP_PORT = 9227;

// The type column and the mark beside it, inside a 1120 surface. The column is
// wide enough for the description to break into three lines rather than five,
// which is what keeps the block centred against the mark instead of towering
// over it.
const TYPE_COLUMN = 660;
const TYPE_PAD_LEFT = 72;
const MARK_WIDTH = 340;
// The aspect the icon is drawn at, from its own viewBox. LOGO_STYLE in
// apps/web/components/logo.tsx pins the same ratio for the same reason: a mask
// paints into whatever box it is given, so the box has to be the drawing's.
const MARK_ASPECT = "128 / 120.8";

// ---------------------------------------------------------------------------

function page(icon, regular, semibold, text) {
  const css = [
    ...pressCss(regular, semibold),
    `#type{flex:0 0 ${TYPE_COLUMN}px;padding-left:${TYPE_PAD_LEFT}px;padding-right:24px}`,
    // The site's name, set as the one large thing on the sheet. On a plate this
    // size is the shelter's name and the wordmark is the quiet line at the
    // bottom; here there is no shelter and the site is the subject.
    `#wordmark{font-size:68px;font-weight:600;line-height:1.05;letter-spacing:-0.02em;color:${TOKEN.foreground}}`,
    `#rule{margin-top:26px;width:64px;height:2px;background:${TOKEN.accentStrong};opacity:0.8}`,
    `#purpose{margin-top:26px;font-size:26px;line-height:1.45;color:${TOKEN.mutedForeground}}`,
    `#mark{flex:1;display:flex;align-items:center;justify-content:center;padding-right:40px}`,
    // The mark exactly as the header draws it: the icon as a mask with a flat
    // fill painted through it. The colour is the brand's rather than the
    // header's near-black ink, because this is the one surface where the mark
    // stands alone instead of beside the wordmark's own text colour.
    `#mark span{display:block;width:${MARK_WIDTH}px;aspect-ratio:${MARK_ASPECT};` +
      `background-color:${TOKEN.accentStrong};` +
      `mask:url(${icon}) no-repeat center / contain}`,
  ].join("\n");

  return [
    `<!doctype html><meta charset="utf-8"><title>og-card</title>`,
    `<style>${css}</style>`,
    `<div id="surface">`,
    `<div id="type">`,
    `<div id="wordmark">${escapeText(text.wordmark)}</div>`,
    `<div id="rule"></div>`,
    `<div id="purpose">${escapeText(text.purpose)}</div>`,
    `</div>`,
    `<div id="mark"><span></span></div>`,
    `</div>`,
  ].join("");
}

// ---------------------------------------------------------------------------

const messages = getMessages("sl");
const html = page(
  dataUri(ICON, "image/svg+xml"),
  dataUri(join(FONTS, "Inter-Regular.ttf"), "font/ttf"),
  dataUri(join(FONTS, "Inter-SemiBold.ttf"), "font/ttf"),
  { wordmark: "Posvoji.si", purpose: messages.metadataDescription },
);

await press(
  {
    name: "og-card",
    port: CDP_PORT,
    file: "card.html",
    ready: `!!document.getElementById("type")`,
    html,
  },
  async (cdp) => {
    // The sentence comes from the catalogue, so it can grow without anybody
    // looking at this file. A block taller than the surface is a card with its
    // last line cut off, which is worth failing the run over.
    const block = await evaluate(
      cdp,
      `document.getElementById("type").scrollHeight`,
    );
    const budget = CARD_HEIGHT - SURFACE_INSET * 2 - 48;
    if (block > budget) {
      throw new Error(
        `the type block is ${block}px against ${budget}px of surface; shorten it or widen the column`,
      );
    }

    const bytes = await capture(cdp, { format: "png" });
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, bytes);
    console.log(
      `${CARD_WIDTH}x${CARD_HEIGHT}, type block ${block}px, ` +
        `${(bytes.length / 1024).toFixed(1)} KB`,
    );
    console.log(`wrote ${OUT_FILE}`);
  },
);
