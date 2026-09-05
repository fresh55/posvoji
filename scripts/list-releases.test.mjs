import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReleases } from "./list-releases.mjs";

const root = mkdtempSync(join(tmpdir(), "posvoji-release-list-"));
try {
  const oldest = "ffffffffffff-20260101T010101Z";
  const middle = "aaaaaaaaaaaa-20260202T020202Z-1111111111111111";
  const newest = "000000000000-20260303T030303Z-2222222222222222";
  const unverified = "bbbbbbbbbbbb-20260404T040404Z-3333333333333333";
  for (const name of [
    oldest,
    middle,
    newest,
    unverified,
    "not-a-release",
    `${newest}.staging`,
  ]) {
    mkdirSync(join(root, name));
  }
  writeFileSync(join(root, unverified, ".deploy-owner"), "unfinished\n");

  // Migration changes old directory mtimes when it adds public -> . links.
  // Ordering must remain timestamp-based even when mtimes say the opposite.
  utimesSync(join(root, oldest), new Date("2030-01-01"), new Date("2030-01-01"));
  utimesSync(join(root, newest), new Date("2020-01-01"), new Date("2020-01-01"));

  assert.deepEqual(listReleases(root), [newest, middle, oldest]);
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write("list-releases: OK\n");
