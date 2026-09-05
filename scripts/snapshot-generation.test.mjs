import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGenerationReceipt,
  validateGenerationReceipt,
} from "./generation-receipt.mjs";
import { snapshotGeneration } from "./snapshot-generation.mjs";

const GENERATED_AT = "2026-09-02T00:00:00.000Z";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(withMedia) {
  const root = mkdtempSync(join(tmpdir(), "posvoji-snapshot-generation-"));
  const distDir = join(root, "dist");
  const mediaRoot = join(root, "media");
  mkdirSync(distDir);
  mkdirSync(mediaRoot);
  const animals = withMedia
    ? [
        {
          id: "shelter:rex",
          images: [
            {
              rights: "cache-permitted",
              cachedUrl: "/media/animals/a.webp",
              widths: [800],
            },
          ],
        },
      ]
    : [];
  writeJson(join(distDir, "animals.json"), {
    generatedAt: GENERATED_AT,
    animals,
  });
  writeJson(join(distDir, "animals.crawled.json"), {
    generatedAt: GENERATED_AT,
    animals: [],
  });
  writeJson(join(distDir, "image-cache.json"), { entries: {} });
  writeJson(join(distDir, "overrides.json"), {
    generatedAt: GENERATED_AT,
    enabled: false,
  });
  writeJson(join(distDir, "share-cards.json"), { entries: {} });
  writeJson(join(distDir, "shelter-logos.json"), { entries: {} });
  if (withMedia) {
    mkdirSync(join(mediaRoot, "animals"));
    writeFileSync(join(mediaRoot, "animals", "a.webp"), "master");
    writeFileSync(join(mediaRoot, "animals", "a.thumb.webp"), "thumb");
  }
  writeJson(
    join(distDir, "generation.json"),
    createGenerationReceipt({ distDir, mediaRoot }),
  );
  return { distDir, mediaRoot, root };
}

for (const withMedia of [false, true]) {
  const paths = fixture(withMedia);
  try {
    const result = snapshotGeneration({
      sourceDist: paths.distDir,
      sourceMedia: paths.mediaRoot,
      targetRoot: join(paths.root, "snapshot"),
    });
    assert.equal(result.mediaFiles, withMedia ? 2 : 0);
    assert.equal(result.linked + result.copied, result.mediaFiles);
    validateGenerationReceipt({
      distDir: result.distDir,
      mediaRoot: result.mediaRoot,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    const targetRoot = join(paths.root, "snapshot");
    mkdirSync(targetRoot);
    assert.throws(
      () =>
        snapshotGeneration({
          sourceDist: paths.distDir,
          sourceMedia: paths.mediaRoot,
          targetRoot,
        }),
      /EEXIST/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    rmSync(join(paths.mediaRoot, "animals", "a.thumb.webp"));
    assert.throws(
      () =>
        snapshotGeneration({
          sourceDist: paths.distDir,
          sourceMedia: paths.mediaRoot,
          targetRoot: join(paths.root, "missing"),
        }),
      /animals\/a\.thumb\.webp/,
    );

    writeFileSync(join(paths.mediaRoot, "animals", "a.thumb.webp"), "thumb");
    writeJson(join(paths.distDir, "image-cache.json"), { entries: { mixed: {} } });
    assert.throws(
      () =>
        snapshotGeneration({
          sourceDist: paths.distDir,
          sourceMedia: paths.mediaRoot,
          targetRoot: join(paths.root, "tampered"),
        }),
      /stale for image-cache\.json/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    const crossDevice = Object.assign(new Error("cross-device link"), {
      code: "EXDEV",
    });
    const result = snapshotGeneration({
      sourceDist: paths.distDir,
      sourceMedia: paths.mediaRoot,
      targetRoot: join(paths.root, "copied"),
      createLink: () => {
        throw crossDevice;
      },
    });
    assert.equal(result.linked, 0);
    assert.equal(result.copied, 2);
    validateGenerationReceipt({
      distDir: result.distDir,
      mediaRoot: result.mediaRoot,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

process.stdout.write("snapshot-generation: OK\n");
