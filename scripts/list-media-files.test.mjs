import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listMediaFiles } from "./list-media-files.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "posvoji-media-list-"));
  mkdirSync(join(root, "animals"));
  mkdirSync(join(root, "share"));
  return root;
}

function withFixture(run) {
  const root = fixture();
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

withFixture((root) => {
  writeFileSync(join(root, "animals", "b.webp"), "b");
  writeFileSync(join(root, "animals", "a.avif"), "a");
  writeFileSync(join(root, "share", "card-en.png"), "card");
  assert.deepEqual(listMediaFiles(root), [
    "animals/a.avif",
    "animals/b.webp",
    "share/card-en.png",
  ]);
});

withFixture((root) => {
  mkdirSync(join(root, "animals", "directory.webp"));
  assert.throws(() => listMediaFiles(root), /unsupported media entry/);
});

withFixture((root) => {
  writeFileSync(join(root, "animals", "empty.webp"), "");
  writeFileSync(join(root, "animals", "full.webp"), "full");
  assert.deepEqual(listMediaFiles(root), [
    "animals/empty.webp",
    "animals/full.webp",
  ]);
});

withFixture((root) => {
  const unsafeName =
    process.platform === "win32" ? "unsafe name.webp" : "safe.webp\n..\nescape";
  writeFileSync(join(root, "animals", unsafeName), "x");
  assert.throws(() => listMediaFiles(root), /unsupported media entry/);
});

withFixture((root) => {
  mkdirSync(join(root, "unexpected"));
  assert.throws(() => listMediaFiles(root), /unsupported entry in media root/);
});

process.stdout.write("list-media-files: OK\n");
