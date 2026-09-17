// Brotli and gzip siblings for the exported files the host will not compress
// on the fly.
//
// Caddy's `encode` chooses responses by Content-Type, and no `model/*` entry is
// in its default match list, so the 3D cat's cat.glb is served raw
// (docs/DEPLOY-HEADERS.md). That file is meshopt-encoded geometry, which is
// designed to be entropy-coded afterwards: measured on the September 2026
// export, 1,500,464 bytes raw against 624,978 gzipped and 550,478 brotli.
// Almost half the transfer is left on the table.
//
// So the build writes the siblings and the host serves them, with Caddy's
// `file_server` subdirective `precompressed br gzip` or nginx's `gzip_static`
// and `brotli_static`. A host without such a directive never looks for them,
// which makes this step safe to ship ahead of the Caddyfile change, and
// scripts/deploy.sh carries the two siblings into the release artifact.
//
// Text assets are deliberately not precompressed. The host encodes those per
// request already, siblings for all of them would add tens of megabytes to
// every release, and deploy.sh fails a release that carries any.
//
//   node scripts/precompress-out.mjs
//
// Runs after `next build`, from the web package's build script.

import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(WEB_ROOT, "out");

// One list, so a `.wasm` or another binary type Caddy's match list misses can
// join it without touching anything else here.
const EXTENSIONS = [".glb"];

// out/media is the copy of the shared production media directory the export
// makes: thousands of webp and jpeg files, already compressed, and excluded
// from the release artifact entirely (scripts/deploy.sh). Nothing in it can be
// a candidate, so it is not walked.
const SKIP_TOP_LEVEL_DIRS = new Set(["media"]);

const FORMATS = [
  {
    extension: ".br",
    // Quality 11 is brotli's maximum and the reason to precompress at all: it
    // is too slow to run per request, which is why a host encoding on the fly
    // uses a lower one. The size hint lets the encoder pick its window.
    compress: (raw) =>
      brotliCompressSync(raw, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      }),
  },
  {
    extension: ".gz",
    // For the clients and proxies that never offer brotli.
    compress: (raw) => gzipSync(raw, { level: 9 }),
  },
];

/** Every file under out/ whose extension is in EXTENSIONS, as paths relative
 *  to out/. */
function candidates(dir, relative = "") {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (relative === "" && SKIP_TOP_LEVEL_DIRS.has(entry.name)) continue;
      found.push(...candidates(path.join(dir, entry.name), entryRelative));
    } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name))) {
      found.push(entryRelative);
    }
  }
  return found;
}

function bytes(n) {
  return n.toLocaleString("en-US");
}

if (!existsSync(OUT_DIR)) {
  console.error(`precompress: no ${OUT_DIR}; run next build first`);
  process.exit(1);
}

const files = candidates(OUT_DIR);
if (files.length === 0) {
  // A tripwire, not a failure: the export can legitimately stop containing a
  // .glb, but the extension list going quiet by accident should be visible.
  console.log(`precompress: no ${EXTENSIONS.join(" or ")} files under out`);
}

for (const file of files) {
  const source = path.join(OUT_DIR, file);
  const sourceMtime = statSync(source).mtimeMs;
  let raw;
  const parts = [];
  for (const format of FORMATS) {
    const target = `${source}${format.extension}`;
    if (existsSync(target) && statSync(target).mtimeMs >= sourceMtime) {
      parts.push(`${format.extension} up to date`);
      continue;
    }
    raw ??= readFileSync(source);
    const compressed = format.compress(raw);
    // Written under a temporary name and renamed. A sibling half-written by an
    // interrupted build would carry a fresh mtime, so the check above would
    // skip it on every later run and the host would serve a truncated body.
    writeFileSync(`${target}.tmp`, compressed);
    renameSync(`${target}.tmp`, target);
    const saved = Math.round((1 - compressed.length / raw.length) * 100);
    parts.push(`${format.extension} ${bytes(compressed.length)} (-${saved}%)`);
  }
  console.log(`precompress: ${file} ${bytes(statSync(source).size)} raw, ${parts.join(", ")}`);
}
