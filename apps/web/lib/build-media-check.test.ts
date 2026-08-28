import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMediaWarnings, warnAboutMissingMedia } from "@/lib/build-media-check";

let dir: string | undefined;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function makeTempTree(): {
  animalsMediaDir: string;
  shareCardManifestPath: string;
  shelterLogoManifestPath: string;
} {
  dir = mkdtempSync(join(tmpdir(), "posvoji-media-check-"));
  return {
    animalsMediaDir: join(dir, "animals"),
    shareCardManifestPath: join(dir, "share-cards.json"),
    shelterLogoManifestPath: join(dir, "shelter-logos.json"),
  };
}

describe("buildMediaWarnings", () => {
  it("warns about nothing when photos and manifests are all present", () => {
    const paths = makeTempTree();
    mkdirSync(paths.animalsMediaDir, { recursive: true });
    writeFileSync(join(paths.animalsMediaDir, "abc123.webp"), "");
    writeFileSync(paths.shareCardManifestPath, "{}");
    writeFileSync(paths.shelterLogoManifestPath, "{}");

    expect(buildMediaWarnings(paths)).toEqual([]);
  });

  it("warns once about photos when public/media/animals does not exist", () => {
    const paths = makeTempTree();
    writeFileSync(paths.shareCardManifestPath, "{}");
    writeFileSync(paths.shelterLogoManifestPath, "{}");

    const warnings = buildMediaWarnings(paths);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/public\/media\/animals/);
  });

  it("warns about photos when the directory exists but is empty", () => {
    const paths = makeTempTree();
    mkdirSync(paths.animalsMediaDir, { recursive: true });
    writeFileSync(paths.shareCardManifestPath, "{}");
    writeFileSync(paths.shelterLogoManifestPath, "{}");

    const warnings = buildMediaWarnings(paths);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/public\/media\/animals/);
  });

  it("warns about manifests when either one is missing", () => {
    const paths = makeTempTree();
    mkdirSync(paths.animalsMediaDir, { recursive: true });
    writeFileSync(join(paths.animalsMediaDir, "abc123.webp"), "");
    writeFileSync(paths.shareCardManifestPath, "{}");
    // shelterLogoManifestPath left unwritten.

    const warnings = buildMediaWarnings(paths);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/share-cards\.json|shelter-logos\.json/);
  });

  it("warns about both when neither photos nor manifests exist", () => {
    const paths = makeTempTree();

    expect(buildMediaWarnings(paths)).toHaveLength(2);
  });
});

describe("warnAboutMissingMedia", () => {
  it("logs at most once per build even when called repeatedly", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const envKey = "POSVOJI_BUILD_MEDIA_WARNED";
    const hadEnv = envKey in process.env;
    const previousEnv = process.env[envKey];
    delete process.env[envKey];
    try {
      const before = spy.mock.calls.length;
      warnAboutMissingMedia();
      warnAboutMissingMedia();
      warnAboutMissingMedia();
      // Whatever the real repo tree produces (zero, one or two lines), a
      // second and third call must add nothing further: the env-var dedupe
      // survives across the whole build, not just one call.
      const afterOnce = spy.mock.calls.length;
      warnAboutMissingMedia();
      expect(spy.mock.calls.length).toBe(afterOnce);
      expect(afterOnce).toBeGreaterThanOrEqual(before);
    } finally {
      spy.mockRestore();
      if (hadEnv) process.env[envKey] = previousEnv;
      else delete process.env[envKey];
    }
  });
});
