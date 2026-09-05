import {
  constants,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENERATION_RECEIPT_FILE,
  validateGenerationReceipt,
} from "./generation-receipt.mjs";

const MEDIA_DIRECTORIES = ["animals", "share", "shelter-logos"];

function assertRegularSource(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`snapshot input ${label} is not a nonempty regular file`);
  }
}

function copyRegular(source, target) {
  assertRegularSource(source, source);
  copyFileSync(source, target, constants.COPYFILE_EXCL);
}

function linkOrCopyRegular(source, target, createLink) {
  assertRegularSource(source, source);
  try {
    createLink(source, target);
    return "linked";
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !["EXDEV", "EPERM", "EACCES", "ENOSYS"].includes(error.code)
    ) {
      throw error;
    }
  }
  copyFileSync(source, target, constants.COPYFILE_EXCL);
  return "copied";
}

/**
 * Snapshot the exact committed generation while the caller holds the checkout
 * artifact lock. Media uses hard links where possible: every producer
 * publishes by atomic replacement, so a link pins the validated old inode
 * while later ingest runs replace or unlink the source name.
 */
export function snapshotGeneration({
  sourceDist,
  sourceMedia,
  targetRoot,
  createLink = linkSync,
}) {
  const source = validateGenerationReceipt({
    distDir: sourceDist,
    mediaRoot: sourceMedia,
  });
  const distDir = join(targetRoot, "dist");
  const mediaRoot = join(targetRoot, "media");
  mkdirSync(targetRoot);
  mkdirSync(distDir);
  mkdirSync(mediaRoot);
  for (const directory of MEDIA_DIRECTORIES) {
    mkdirSync(join(mediaRoot, directory));
  }

  for (const name of [...Object.keys(source.receipt.artifacts), GENERATION_RECEIPT_FILE]) {
    copyRegular(join(sourceDist, name), join(distDir, name));
  }

  let linked = 0;
  let copied = 0;
  for (const relative of Object.keys(source.receipt.media).sort()) {
    const target = join(mediaRoot, relative);
    // The receipt validator already restricts paths to one of the three flat
    // media directories; mkdir is kept here so the helper remains explicit
    // about the destination parent it writes into.
    mkdirSync(dirname(target), { recursive: true });
    if (
      linkOrCopyRegular(join(sourceMedia, relative), target, createLink) ===
      "linked"
    ) {
      linked++;
    } else {
      copied++;
    }
  }

  const verified = validateGenerationReceipt({ distDir, mediaRoot });
  return {
    copied,
    distDir,
    generationId: verified.receipt.generationId,
    linked,
    mediaFiles: Object.keys(verified.receipt.media).length,
    mediaRoot,
  };
}

function cli() {
  const [sourceDist, sourceMedia, targetRoot] = process.argv.slice(2);
  if (!sourceDist || !sourceMedia || !targetRoot) {
    throw new Error(
      "usage: snapshot-generation.mjs SOURCE_DIST SOURCE_MEDIA TARGET_ROOT",
    );
  }
  const result = snapshotGeneration({ sourceDist, sourceMedia, targetRoot });
  process.stdout.write(
    `generation ${result.generationId}: ${result.mediaFiles} media ` +
      `(${result.linked} linked, ${result.copied} copied)\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
