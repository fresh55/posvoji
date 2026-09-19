import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const directory = mkdtempSync(join(tmpdir(), "posvoji-pr-title-"));
const eventPath = join(directory, "event.json");
const script = fileURLToPath(new URL("./check-pr-title.mjs", import.meta.url));

after(() => {
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  assert.ok(basename(directory).startsWith("posvoji-pr-title-"));
  rmSync(directory, { recursive: true, force: true });
});

function check(event) {
  writeFileSync(eventPath, JSON.stringify(event));
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
  });
}

test("accepts repository types, provider scopes and Slovenian descriptions", () => {
  for (const title of [
    "fix(web): correct the species filter",
    "feat(providers/horjul): dodaj razčlenjevalnik",
    "docs: razloži pravila za prispevke",
    "chore(ci): bump the GitHub Actions pins",
    "fix(web): čisti izbiro filtra",
  ]) {
    const result = check({ pull_request: { title } });
    assert.equal(result.status, 0, `${title}: ${result.stderr}`);
  }
});

test("rejects malformed titles and the reviewed capitalization and punctuation gaps", () => {
  for (const title of [
    "update stuff",
    "Feat(web): correct the filter",
    "fix(Web): correct the filter",
    "fix(web): Correct the filter",
    "fix(web): Čisti izbiro filtra",
    "fix(web): correct the filter.",
    "fix(web): correct the filter. ",
    "fix(web): correct the filter ",
    "fix(web): ",
    "fix(web):  correct the filter",
    "fix(web): correct the filter\nmore text",
    "fix(web): correct the filter\n",
  ]) {
    assert.equal(check({ pull_request: { title } }).status, 1, title);
  }
});

test("does not silently pass an event without a pull request title", () => {
  for (const event of [{}, { pull_request: {} }, { pull_request: { title: null } }]) {
    assert.equal(check(event).status, 1);
  }
});
