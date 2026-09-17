import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { renderCardInChild } from "./share-card-process";

const request = { kind: "typographic" as const, species: "cat" as const,
  text: { name: "Čoko Žan", species: "Mačka", shelter: "Testno zavetišče", city: "Test" } };
const dirs: string[] = [];
function worker(source: string): URL {
  const dir = mkdtempSync(join(tmpdir(), "posvoji-render-test-"));
  dirs.push(dir);
  const file = join(dir, "worker.mjs");
  writeFileSync(file, source);
  return pathToFileURL(file);
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("share-card process isolation", () => {
  it("returns a real JPEG with Slovenian text after a clean worker exit", async () => {
    const image = await renderCardInChild(request);
    expect(await sharp(image).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 630 });
  });

  it("rejects a crashed renderer even when it already wrote output, then renders the next card", async () => {
    const crashed = worker('process.stdout.write("partial JPEG"); process.exit(7);');
    await expect(renderCardInChild(request, { worker: crashed })).rejects.toThrow("exited 7");
    expect((await renderCardInChild(request)).length).toBeGreaterThan(1000);
  });

  it("kills a hung worker and rejects instead of holding the export indefinitely", async () => {
    const hanging = worker('setInterval(() => {}, 1000);');
    await expect(renderCardInChild(request, { worker: hanging, timeoutMs: 200 })).rejects.toThrow("timed out");
  });
});
