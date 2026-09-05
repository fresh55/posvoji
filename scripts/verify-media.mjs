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
//   node scripts/verify-media.mjs --list [media-root]
//
// media-root defaults to apps/web/public/media. On the deploy host it is the
// shared directory, /srv/posvoji/media.
// --list prints only the sorted, verified referenced paths for deployment's
// tar allowlist.
//
// Node builtins only: no package install is needed, but the host still needs
// the project's Node 22+ runtime.

import { lstatSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGenerationReceipt } from "./generation-receipt.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "data", "dist");
const defaultMediaRoot = join(repoRoot, "apps", "web", "public", "media");

const cliArgs = process.argv.slice(2);
const listOnly = cliArgs[0] === "--list";
if (listOnly) cliArgs.shift();
if (cliArgs.length > 1 || cliArgs[0]?.startsWith("--")) {
  console.error("usage: verify-media.mjs [--list] [media-root]");
  process.exit(2);
}
const mediaRoot = resolve(cliArgs[0] ?? defaultMediaRoot);

// generation.json is the last write of a successful ingest. It commits to the
// five JSON inputs deployment consumes, the image-cache input used by partial
// derivation, and the bytes of every media file the public manifests reference.
// A missing, stale or malformed receipt
// is therefore a partial snapshot, even when every individual JSON file parses
// and every referenced filename exists.
let generation;
try {
  generation = validateGenerationReceipt({ distDir, mediaRoot });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const { collection, receipt } = generation;
const { referenced, photos, shareCards, shelterLogos } = collection;

// --- the check -------------------------------------------------------------
//
// Every referenced path lives under one of three fixed subdirectories
// (animals/, share/, shelter-logos/), flat inside each. Read each referenced
// subdirectory once with type information, then lstat referenced regular
// entries to reject empty files without allowing a same-named directory or
// symlink to masquerade as media.

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
    return new Map(
      readdirSync(dir, { withFileTypes: true }).map((entry) => [entry.name, entry]),
    );
  } catch (error) {
    // No such subdirectory: every file it was expected to hold is missing,
    // not a crash.
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function isNonemptyRegularFile(relative) {
  const entry = listings.get(subdirOf(relative))?.get(basenameOf(relative));
  if (!entry?.isFile()) return false;
  try {
    const stat = lstatSync(join(mediaRoot, relative));
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if (error.code === "ENOENT") return false;
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
  if (!isNonemptyRegularFile(relative)) {
    missing.push({ relative, reasons: [...reasons] });
  }
}

if (!listOnly) {
  console.log(`media root: ${mediaRoot}`);
  console.log(`generation: ${receipt.generationId}`);
  console.log(
    `${referenced.size} files referenced by ${photos} cached photos, ` +
      `${shareCards} share cards and ${shelterLogos} shelter logos`,
  );
}

if (missing.length === 0) {
  if (listOnly) {
    const files = [...referenced.keys()].sort();
    if (files.length > 0) process.stdout.write(`${files.join("\n")}\n`);
  } else {
    console.log("all present");
  }
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
