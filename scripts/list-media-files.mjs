#!/usr/bin/env node

import { lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MEDIA_DIRECTORIES = new Set(["animals", "share", "shelter-logos"]);
const MEDIA_FILENAME = /^[A-Za-z0-9._-]+$/;

export function listMediaFiles(root) {
  const mediaRoot = resolve(root);
  const files = [];

  for (const directory of readdirSync(mediaRoot, { withFileTypes: true })) {
    if (!directory.isDirectory() || !MEDIA_DIRECTORIES.has(directory.name)) {
      throw new Error(`unsupported entry in media root: ${directory.name}`);
    }

    const directoryPath = join(mediaRoot, directory.name);
    for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
      const relative = `${directory.name}/${entry.name}`;
      if (!entry.isFile() || !MEDIA_FILENAME.test(entry.name)) {
        throw new Error(`unsupported media entry: ${JSON.stringify(relative)}`);
      }
      const stat = lstatSync(join(directoryPath, entry.name));
      if (!stat.isFile()) {
        throw new Error(`media file is not regular: ${relative}`);
      }
      // Inventory empty regular files too. A referenced empty file is rejected
      // by generation-receipt verification, while an unreferenced one belongs
      // in this list so the deploy's orphan diff can remove it from the host.
      files.push(relative);
    }
  }

  return files.sort();
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: list-media-files.mjs MEDIA_ROOT");
    process.exitCode = 2;
    return;
  }
  try {
    const files = listMediaFiles(root);
    if (files.length > 0) process.stdout.write(`${files.join("\n")}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath === "-" ||
  (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url))
) {
  main();
}
