#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE_NAME =
  /^(?<sha>[0-9a-f]{12})-(?<timestamp>[0-9]{8}T[0-9]{6}Z)(?:-[0-9a-f]{16})?$/;

export function listReleases(root) {
  const releases = [];
  for (const entry of readdirSync(resolve(root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = RELEASE_NAME.exec(entry.name);
    if (!match?.groups) continue;
    if (existsSync(join(root, entry.name, ".deploy-owner"))) continue;
    releases.push({ name: entry.name, timestamp: match.groups.timestamp });
  }
  releases.sort(
    (left, right) =>
      right.timestamp.localeCompare(left.timestamp) ||
      right.name.localeCompare(left.name),
  );
  return releases.map(({ name }) => name);
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: list-releases.mjs RELEASES_ROOT");
    process.exitCode = 2;
    return;
  }
  try {
    const releases = listReleases(root);
    if (releases.length > 0) process.stdout.write(`${releases.join("\n")}\n`);
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
