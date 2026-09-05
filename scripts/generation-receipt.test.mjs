import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GENERATION_ARTIFACTS,
  createGenerationReceipt,
  generationIdFor,
  validateGenerationReceipt,
  validateGenerationReceiptForRepair,
} from "./generation-receipt.mjs";
import { snapshotGeneration } from "./snapshot-generation.mjs";

const GENERATED_AT = "2026-09-02T00:00:00.000Z";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(withMedia = false) {
  const root = mkdtempSync(join(tmpdir(), "posvoji-generation-"));
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
              cachedUrl: "/media/animals/z.webp",
              widths: [320, 800],
              avif: true,
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
  writeJson(join(distDir, "share-cards.json"), {
    entries: withMedia
      ? { "shelter:rex": { files: ["Card.jpg"], fingerprint: "v1" } }
      : {},
  });
  writeJson(join(distDir, "shelter-logos.json"), {
    entries: withMedia ? { shelter: { file: "_logo.svg" } } : {},
  });

  if (withMedia) {
    for (const directory of ["animals", "share", "shelter-logos"]) {
      mkdirSync(join(mediaRoot, directory));
    }
    for (const [relative, body] of [
      ["animals/z.webp", "master"],
      ["animals/z.thumb.webp", "thumb"],
      ["animals/z-320.webp", "rung"],
      ["animals/z.avif", "avif"],
      ["share/Card.jpg", "card-v1"],
      ["shelter-logos/_logo.svg", "logo"],
    ]) {
      writeFileSync(join(mediaRoot, relative), body);
    }
  }

  return { distDir, mediaRoot, root };
}

function seal(paths) {
  const receipt = createGenerationReceipt(paths);
  writeJson(join(paths.distDir, "generation.json"), receipt);
  return receipt;
}

{
  const paths = fixture(false);
  try {
    const receipt = seal(paths);
    assert.deepEqual(Object.keys(receipt.artifacts), GENERATION_ARTIFACTS);
    assert.deepEqual(receipt.media, {});
    assert.equal(
      validateGenerationReceipt(paths).receipt.generationId,
      receipt.generationId,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    const receipt = seal(paths);
    assert.deepEqual(Object.keys(receipt.media), [
      "animals/z-320.webp",
      "animals/z.avif",
      "animals/z.thumb.webp",
      "animals/z.webp",
      "share/Card.jpg",
      "shelter-logos/_logo.svg",
    ]);
    validateGenerationReceipt(paths);

    // Stable share-card names can change bytes without changing a manifest.
    // The media digests must catch that cross-file generation mix.
    writeFileSync(join(paths.mediaRoot, "share", "Card.jpg"), "card-v2");
    assert.throws(
      () => validateGenerationReceipt(paths),
      /media\/share\/Card\.jpg/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    const receipt = seal(paths);
    writeFileSync(join(paths.mediaRoot, "animals", "unreferenced.webp"), "old");
    const targetRoot = join(paths.root, "snapshot");
    const snapshot = snapshotGeneration({
      sourceDist: paths.distDir,
      sourceMedia: paths.mediaRoot,
      targetRoot,
    });
    assert.equal(snapshot.generationId, receipt.generationId);
    assert.equal(snapshot.mediaFiles, 6);
    assert.equal(
      existsSync(join(snapshot.mediaRoot, "animals", "unreferenced.webp")),
      false,
    );

    // Producers replace names atomically. Replacing and removing source names
    // after unlock must not affect the inode/copy pinned by the deploy.
    const replacement = join(paths.mediaRoot, "animals", "replacement.tmp");
    writeFileSync(replacement, "new-master");
    renameSync(replacement, join(paths.mediaRoot, "animals", "z.webp"));
    rmSync(join(paths.mediaRoot, "share", "Card.jpg"));
    validateGenerationReceipt({
      distDir: snapshot.distDir,
      mediaRoot: snapshot.mediaRoot,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    seal(paths);
    const thumb = join(paths.mediaRoot, "animals", "z.thumb.webp");
    rmSync(thumb);
    assert.deepEqual(
      validateGenerationReceiptForRepair(paths, "image-derivatives")
        .repairableMedia,
      ["animals/z.thumb.webp"],
    );
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "shelter-logos"),
      /outside the safe shelter-logos repair slice/,
    );

    // Existing bytes have unknown provenance. The derivation job skips
    // existing files, so only absence is a safe automatic repair signal.
    writeFileSync(thumb, "");
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "image-derivatives"),
      /animals\/z\.thumb\.webp \(empty regular file\)/,
    );
    writeFileSync(thumb, "corrupt-thumb");
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "image-derivatives"),
      /animals\/z\.thumb\.webp \(digest is stale\)/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    seal(paths);
    rmSync(join(paths.mediaRoot, "shelter-logos", "_logo.svg"));
    assert.deepEqual(
      validateGenerationReceiptForRepair(paths, "shelter-logos")
        .repairableMedia,
      ["shelter-logos/_logo.svg"],
    );

    // A missing cached master cannot be reconstructed by derive-images, and
    // an unrelated missing share card cannot be hidden by either repair job.
    rmSync(join(paths.mediaRoot, "animals", "z.webp"));
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "image-derivatives"),
      (error) =>
        error instanceof Error &&
        error.message.includes("animals/z.webp") &&
        error.message.includes("shelter-logos/_logo.svg"),
    );
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "shelter-logos"),
      /animals\/z\.webp/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    seal(paths);
    rmSync(join(paths.mediaRoot, "animals", "z-320.webp"));
    writeJson(join(paths.distDir, "image-cache.json"), {
      entries: { mixed: { file: "other.webp" } },
    });
    assert.throws(
      () => validateGenerationReceiptForRepair(paths, "image-derivatives"),
      /stale for image-cache\.json/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    seal(paths);
    writeFileSync(join(paths.mediaRoot, "animals", "z.webp"), "");
    assert.throws(
      () => validateGenerationReceipt(paths),
      /animals\/z\.webp.*empty regular file/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(true);
  try {
    rmSync(join(paths.mediaRoot, "animals", "z.thumb.webp"));
    rmSync(join(paths.mediaRoot, "share", "Card.jpg"));
    assert.throws(
      () => createGenerationReceipt(paths),
      (error) =>
        error instanceof Error &&
        error.message.includes("animals/z.thumb.webp") &&
        error.message.includes("share/Card.jpg"),
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(false);
  try {
    assert.throws(
      () => validateGenerationReceipt(paths),
      /generation\.json is not readable/,
    );
    writeFileSync(join(paths.distDir, "generation.json"), "{not json");
    assert.throws(
      () => validateGenerationReceipt(paths),
      /generation\.json is not valid JSON/,
    );
    const receipt = seal(paths);
    writeJson(join(paths.distDir, "generation.json"), {
      ...receipt,
      artifacts: {
        ...receipt.artifacts,
        // RegExp.test coerces arrays to strings; validation must not.
        "animals.json": [receipt.artifacts["animals.json"]],
      },
    });
    assert.throws(
      () => validateGenerationReceipt(paths),
      /invalid artifacts digest for "animals\.json"/,
    );
    writeJson(join(paths.distDir, "generation.json"), receipt);
    writeJson(join(paths.distDir, "share-cards.json"), {
      entries: { changed: { files: [] } },
    });
    assert.throws(
      () => validateGenerationReceipt(paths),
      /stale for share-cards\.json/,
    );

    writeJson(join(paths.distDir, "share-cards.json"), { entries: {} });
    writeJson(join(paths.distDir, "generation.json"), {
      ...receipt,
      media: { "animals/not-referenced.webp": "a".repeat(64) },
    });
    assert.throws(
      () => validateGenerationReceipt(paths),
      /does not name exactly the current snapshot/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const paths = fixture(false);
  try {
    writeJson(join(paths.distDir, "animals.crawled.json"), {
      generatedAt: "2026-09-01T00:00:00.000Z",
      animals: [],
    });
    assert.throws(
      () => createGenerationReceipt(paths),
      /animals\.crawled\.json is not from animals\.json generation/,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
}

{
  const artifactsA = {
    "z.json": "1".repeat(64),
    "A.json": "2".repeat(64),
  };
  const artifactsB = {
    "A.json": "2".repeat(64),
    "z.json": "1".repeat(64),
  };
  const mediaA = {
    "share/z.jpg": "3".repeat(64),
    "animals/_A.webp": "4".repeat(64),
  };
  const mediaB = {
    "animals/_A.webp": "4".repeat(64),
    "share/z.jpg": "3".repeat(64),
  };
  const id = generationIdFor(GENERATED_AT, artifactsA, mediaA);
  assert.equal(id, generationIdFor(GENERATED_AT, artifactsB, mediaB));
  assert.equal(
    id,
    "3495f455301331f7a6aa0840b672e063c55f8d676ada526ed8cddf5d67cc2203",
  );
}

{
  const paths = fixture(false);
  try {
    const manifest = {
      version: 1, generatedAt: GENERATED_AT, codeSha: "b".repeat(40),
      policyRevision: "c".repeat(64), overridesRevision: "d".repeat(64),
      inputRevision: { authority: "e".repeat(64), sequence: 7 },
      providers: { fixture: { snapshotId: "f".repeat(64), checkedAt: GENERATED_AT } },
    };
    writeJson(join(paths.distDir, "crawl-manifest.json"), manifest);
    const receipt = seal(paths);
    assert.ok(receipt.artifacts["crawl-manifest.json"]);
    const targetRoot = join(paths.root, "snapshot");
    const saved = snapshotGeneration({ sourceDist: paths.distDir, sourceMedia: paths.mediaRoot, targetRoot });
    assert.equal(saved.generationId, receipt.generationId);
    assert.ok(existsSync(join(targetRoot, "dist", "crawl-manifest.json")));
    writeJson(join(paths.distDir, "crawl-manifest.json"), { ...manifest, inputRevision: { ...manifest.inputRevision, sequence: 8 } });
    assert.throws(() => validateGenerationReceipt(paths), /stale for crawl-manifest/);
    rmSync(join(paths.distDir, "crawl-manifest.json"));
    assert.throws(() => validateGenerationReceipt(paths), /artifacts/);
  } finally { rmSync(paths.root, { recursive: true, force: true }); }
}

process.stdout.write("generation-receipt: OK\n");
