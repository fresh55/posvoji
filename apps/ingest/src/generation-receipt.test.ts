import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertCommittedGeneration,
  writeGenerationReceipt,
  type GenerationPaths,
} from "./generation-receipt";

const GENERATED_AT = "2026-09-02T00:00:00.000Z";

describe("ingest generation commit", () => {
  let root: string;
  let paths: Required<GenerationPaths>;

  function writeJson(name: string, value: unknown): void {
    writeFileSync(
      join(paths.distDir, name),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "posvoji-generation-commit-"));
    paths = {
      distDir: join(root, "dist"),
      mediaRoot: join(root, "media"),
      receiptPath: join(root, "dist", "generation.json"),
    };
    mkdirSync(paths.distDir);
    mkdirSync(paths.mediaRoot);
    writeJson("animals.json", { generatedAt: GENERATED_AT, animals: [] });
    writeJson("animals.crawled.json", {
      generatedAt: GENERATED_AT,
      animals: [],
    });
    writeJson("image-cache.json", { entries: {} });
    writeJson("overrides.json", {
      generatedAt: GENERATED_AT,
      enabled: false,
    });
    writeJson("share-cards.json", { entries: {} });
    writeJson("shelter-logos.json", { entries: {} });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("advances the input revision when a standalone media job reseals a generation", () => {
    const inputRevision = { version: 1, authority: "a".repeat(64), sequence: 7 };
    writeJson("input-revision.json", inputRevision);
    writeJson("crawl-manifest.json", {
      version: 1, generatedAt: GENERATED_AT, codeSha: "b".repeat(40),
      policyRevision: "c".repeat(64), overridesRevision: "d".repeat(64),
      inputRevision: { authority: inputRevision.authority, sequence: 7 }, providers: {},
    });
    const initial = writeGenerationReceipt(paths, { preserveInputRevision: true });
    const resealed = writeGenerationReceipt(paths);
    expect(resealed).not.toBe(initial);
    expect(JSON.parse(readFileSync(join(paths.distDir, "crawl-manifest.json"), "utf8")).inputRevision)
      .toMatchObject({ authority: inputRevision.authority, sequence: 8 });
    expect(() => assertCommittedGeneration(paths)).not.toThrow();
  });

  it("writes the receipt last and rejects a later partial image-cache write", () => {
    const generationId = writeGenerationReceipt(paths);

    expect(
      JSON.parse(readFileSync(paths.receiptPath, "utf8")).generationId,
    ).toBe(generationId);
    expect(readdirSync(paths.distDir).filter((name) => name.endsWith(".tmp")))
      .toEqual([]);
    expect(() => assertCommittedGeneration(paths)).not.toThrow();

    writeJson("image-cache.json", {
      entries: { "https://img.example/new.jpg": { file: "new.webp" } },
    });
    expect(() => assertCommittedGeneration(paths)).toThrow(
      /stale for image-cache\.json/,
    );
  });

});
