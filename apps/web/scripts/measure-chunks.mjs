// What a built page in out/ costs a first-time visitor, in bytes over the wire.
//
// Next prints a route table at the end of a build, but it counts the whole
// client bundle a route could reach, not what the exported document actually
// asks for, and it prints no gzipped figure. This reads the HTML instead: every
// <script src>, every <link rel=preload|modulepreload as=script>, and the
// stylesheets, resolved against out/ and measured raw and gzipped. That is the
// number a code-splitting change has to move.
//
// Gzip and not brotli because gzip is the floor every client and every host
// agree on, and because the ratio between two measurements is what matters
// here, not the absolute best case.
//
// The nomodule polyfill bundle is printed under the total rather than in it.
// See referencedAssets.
//
//   node scripts/measure-chunks.mjs [page...]
//
// Pages are paths under out/, with or without the prefix and the extension:
//   node scripts/measure-chunks.mjs index zavetisca najdena-zival
//   node scripts/measure-chunks.mjs out/zival/mila-3fb13e/koper/obalno.html
//
// With no arguments it measures out/index.html. Pass --json for the same
// numbers as one JSON document, which is what a before/after diff reads.

import { gzipSync } from "node:zlib";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(WEB_ROOT, "out");

/** Every URL the document tells the browser to fetch as script or stylesheet.
 *  Preloads count: a preloaded chunk is downloaded on the first paint whether
 *  or not the <script> tag for it has been parsed yet.
 *
 *  The nomodule script is kept apart rather than counted. Next emits its
 *  core-js polyfills that way, and every browser that supports modules, which
 *  is every browser this site is built for, skips the tag without fetching it.
 *  Counting it would put 38 KB gzipped on the bill of a visitor who never
 *  downloads it. */
function referencedAssets(html) {
  const scripts = new Set();
  const legacy = new Set();
  const styles = new Set();

  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = /\bsrc="([^"]+)"/i.exec(tag[0])?.[1];
    if (!src) continue;
    if (/\bnomodule\b/i.test(tag[0])) legacy.add(src);
    else scripts.add(src);
  }

  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    const href = /\bhref="([^"]+)"/i.exec(tag[0])?.[1];
    if (!href) continue;
    const rel = (/\brel="([^"]+)"/i.exec(tag[0])?.[1] ?? "").toLowerCase();
    const as = (/\bas="([^"]+)"/i.exec(tag[0])?.[1] ?? "").toLowerCase();
    if (rel.includes("stylesheet")) styles.add(href);
    else if (rel.includes("modulepreload")) scripts.add(href);
    else if (rel.includes("preload") && as === "script") scripts.add(href);
  }

  return { scripts: [...scripts], legacy: [...legacy], styles: [...styles] };
}

/** Raw and gzipped size of one referenced URL. Anything not served out of
 *  out/ (an absolute URL, a data: URI) is reported rather than skipped
 *  silently, because a page that fetches script from elsewhere is a finding. */
function measure(url) {
  if (!url.startsWith("/")) return { url, missing: true };
  const file = path.join(OUT_DIR, decodeURIComponent(url.split("?")[0]));
  try {
    statSync(file);
  } catch {
    return { url, missing: true };
  }
  const bytes = readFileSync(file);
  return { url, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
}

function resolvePage(arg) {
  let rel = arg.replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel.startsWith("out/")) rel = rel.slice(4);
  if (!rel.endsWith(".html")) rel += ".html";
  return path.join(OUT_DIR, rel);
}

function kib(n) {
  return (n / 1024).toFixed(1).padStart(7) + " KB";
}

function report(pageArg) {
  const file = resolvePage(pageArg);
  const html = readFileSync(file, "utf8");
  const { scripts, legacy, styles } = referencedAssets(html);

  const byGzip = (a, b) => (b.gzip ?? 0) - (a.gzip ?? 0);
  const js = scripts.map(measure).sort(byGzip);
  const old = legacy.map(measure).sort(byGzip);
  const css = styles.map(measure).sort(byGzip);
  const doc = {
    url: "/" + path.relative(OUT_DIR, file).replace(/\\/g, "/"),
    raw: Buffer.byteLength(html),
    gzip: gzipSync(Buffer.from(html), { level: 9 }).length,
  };

  const sum = (list, key) =>
    list.reduce((total, entry) => total + (entry[key] ?? 0), 0);

  return {
    page: doc.url,
    document: doc,
    scripts: js,
    legacy: old,
    styles: css,
    totals: {
      scripts: { count: js.length, raw: sum(js, "raw"), gzip: sum(js, "gzip") },
      legacy: {
        count: old.length,
        raw: sum(old, "raw"),
        gzip: sum(old, "gzip"),
      },
      styles: {
        count: css.length,
        raw: sum(css, "raw"),
        gzip: sum(css, "gzip"),
      },
    },
  };
}

function print(result) {
  const line = (entry) =>
    entry.missing
      ? `  ${"      ?".padStart(10)}   ${"      ?".padStart(10)}   ${entry.url} (not in out/)`
      : `  ${kib(entry.raw)}   ${kib(entry.gzip)}   ${entry.url}`;

  console.log(`\n${result.page}`);
  console.log(`         raw        gzip   asset`);
  console.log(`  ${kib(result.document.raw)}   ${kib(result.document.gzip)}   (document)`);
  console.log(`  scripts (${result.totals.scripts.count}):`);
  for (const entry of result.scripts) console.log(line(entry));
  console.log(
    `  ${kib(result.totals.scripts.raw)}   ${kib(result.totals.scripts.gzip)}   = script total`,
  );
  for (const entry of result.legacy) {
    console.log(`${line(entry)}   (nomodule, not fetched by a browser with modules)`);
  }
  console.log(`  styles (${result.totals.styles.count}):`);
  for (const entry of result.styles) console.log(line(entry));
  console.log(
    `  ${kib(result.totals.styles.raw)}   ${kib(result.totals.styles.gzip)}   = style total`,
  );
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const pages = args.filter((arg) => arg !== "--json");
if (pages.length === 0) pages.push("index.html");

const results = pages.map(report);
if (asJson) console.log(JSON.stringify(results, null, 2));
else for (const result of results) print(result);
