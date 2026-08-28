#!/usr/bin/env node
//
// Every media file the built site can ask for, checked against a media root.
//
// The failure this exists for is silent. <picture> commits to a source by its
// MIME type before it requests anything, so a missing .avif renders a blank
// hero rather than falling back to the WebP inside it. A missing ladder rung
// is quieter still: the browser picks a candidate, gets a 404 and draws
// nothing where the photo was. Neither one fails a build, appears in a log, or
// shows up in `pnpm test`, because the media directory is written by ingest,
// is gitignored, and on the host lives outside the release tree entirely.
//
// So it is checked before the release symlink moves, not after. See
// docs/DEPLOY-MEDIA.md.
//
// Usage:
//   node scripts/verify-media.mjs [media-root]
//
// media-root defaults to apps/web/public/media. On the deploy host it is the
// shared directory, /srv/posvoji/media.
//
// Node builtins only, so it runs on a host with nothing installed.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "data", "dist");
const defaultMediaRoot = join(repoRoot, "apps", "web", "public", "media");

// What the site serves the media root as. Every URL in the dataset and in the
// manifests is root-relative under it.
const MEDIA_PREFIX = "/media/";

const mediaRoot = resolve(process.argv[2] ?? defaultMediaRoot);

/** Referenced path to the reasons it is referenced. Content addressing means
 *  several animals share one file, so this dedupes as it collects. */
const referenced = new Map();

function reference(url, why) {
  if (!url.startsWith(MEDIA_PREFIX)) {
    // A full URL, which means the cache moved to another host and is not this
    // directory's problem. Nothing to check.
    return;
  }
  const relative = url.slice(MEDIA_PREFIX.length);
  const reasons = referenced.get(relative);
  if (reasons) reasons.add(why);
  else referenced.set(relative, new Set([why]));
}

function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
}

// --- animals ---------------------------------------------------------------
//
// Derivative naming is apps/ingest/src/cache-images.ts (thumbFileFor,
// rungFileFor, avifFileFor) and the site's own reading of it is
// apps/web/lib/animal-images.ts (photoSrcSet, photoAvifUrl, thumbnailUrl).
// Both spell the same thing: a derivative is a plain sibling of the cached
// copy, "<hash>.webp" becoming "<hash>.thumb.webp", "<hash>-<width>.webp" and
// "<hash>.avif".

const animalsPath = join(distDir, "animals.json");
const dataset = readJson(animalsPath);
if (!dataset) {
  console.error(
    `no ${animalsPath}. Run \`pnpm dataset:export\` before verifying media; ` +
      "a site built without it has no photos at all.",
  );
  process.exit(2);
}

let photos = 0;
for (const animal of dataset.animals ?? []) {
  for (const image of animal.images ?? []) {
    // An image with no cached copy is hotlinked to the shelter and has no
    // local file, and one without a display right is never drawn at all.
    if (image.rights !== "cache-permitted" || !image.cachedUrl) continue;
    photos++;
    const cached = image.cachedUrl;
    reference(cached, `${animal.id} photo`);
    // The dialog's thumb strip derives this from cachedUrl for every cached
    // photo, so it is always asked for.
    reference(cached.replace(/\.webp$/, ".thumb.webp"), `${animal.id} thumb`);

    // photoSrcSet builds its candidates from `widths`: the last entry is the
    // cached copy itself and every earlier one is a rung file beside it.
    const widths = image.widths ?? [];
    for (const width of widths.slice(0, -1)) {
      reference(
        cached.replace(/\.webp$/, `-${width}.webp`),
        `${animal.id} ${width}w rung`,
      );
    }

    // The hero AVIF. This is the one whose absence renders blank rather than
    // falling back, which is what the whole script is here for.
    if (image.avif) {
      reference(cached.replace(/\.webp$/, ".avif"), `${animal.id} hero avif`);
    }
  }
}

// --- share cards -----------------------------------------------------------
//
// apps/ingest/src/share-cards.ts writes the manifest; apps/web/lib/
// animal-share.ts serves the files from /media/share/. Filenames here are the
// animal id, not a hash.

const shareManifest = readJson(join(distDir, "share-cards.json"));
for (const [id, entry] of Object.entries(shareManifest?.entries ?? {})) {
  for (const file of entry?.files ?? []) {
    reference(`/media/share/${file}`, `${id} share card`);
  }
}

// --- shelter logos ---------------------------------------------------------
//
// apps/web/lib/shelter-logos.ts builds the URL as /media/shelter-logos/<file>.

const logoManifest = readJson(join(distDir, "shelter-logos.json"));
for (const [id, entry] of Object.entries(logoManifest?.entries ?? {})) {
  if (typeof entry?.file === "string") {
    reference(`/media/shelter-logos/${entry.file}`, `${id} logo`);
  }
}

// --- the check -------------------------------------------------------------
//
// Every referenced path lives under one of three fixed subdirectories
// (animals/, share/, shelter-logos/), flat inside each. Rather than an
// existsSync per file (~9000 stat syscalls, slow on Windows and on the
// host's disk), read each referenced subdirectory once into a Set and check
// basenames against it.

function subdirOf(relative) {
  const slash = relative.indexOf("/");
  return slash === -1 ? "" : relative.slice(0, slash);
}

function basenameOf(relative) {
  const slash = relative.indexOf("/");
  return slash === -1 ? relative : relative.slice(slash + 1);
}

function listDir(dir) {
  try {
    return new Set(readdirSync(dir));
  } catch (error) {
    // No such subdirectory: every file it was expected to hold is missing,
    // not a crash.
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

const subdirs = new Set();
for (const relative of referenced.keys()) subdirs.add(subdirOf(relative));

const listings = new Map();
for (const subdir of subdirs) {
  listings.set(subdir, listDir(join(mediaRoot, subdir)));
}

const missing = [];
for (const [relative, reasons] of referenced) {
  const present = listings.get(subdirOf(relative));
  if (!present.has(basenameOf(relative))) {
    missing.push({ relative, reasons: [...reasons] });
  }
}

console.log(`media root: ${mediaRoot}`);
console.log(
  `${referenced.size} files referenced by ${photos} cached photos, ` +
    `${Object.keys(shareManifest?.entries ?? {}).length} share cards and ` +
    `${Object.keys(logoManifest?.entries ?? {}).length} shelter logos`,
);

if (missing.length === 0) {
  console.log("all present");
  process.exit(0);
}

// Every one of them, not a sample: the point of running this is to know what
// to copy, and a truncated list turns a fixable answer into another round trip.
console.error(`\n${missing.length} missing:`);
for (const { relative, reasons } of missing) {
  console.error(`  ${relative}  (${reasons.join(", ")})`);
}
console.error(
  "\nThe site would render these as broken or blank. Sync the media " +
    "directory before flipping the release symlink; see docs/DEPLOY-MEDIA.md.",
);
process.exit(1);
