import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pruneDevOnlyOutput } from "./prune-dev-output.mjs";

const roots: string[] = [];

function createFixture(chunks: string[]) {
  const webRoot = mkdtempSync(join(tmpdir(), "posvoji-prune-dev-"));
  roots.push(webRoot);
  const manifestPath = join(
    webRoot,
    ".next",
    "server",
    "app",
    "dev",
    "[tool]",
    "page_client-reference-manifest.js",
  );
  const outDir = join(webRoot, "out");
  const chunkDirectory = join(outDir, "_next", "static", "chunks");
  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(join(outDir, "dev", "__production-disabled__"), {
    recursive: true,
  });
  mkdirSync(chunkDirectory, { recursive: true });
  writeFileSync(
    manifestPath,
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST["/dev/[tool]/page"] = ${JSON.stringify({
        clientModules: {
          "[project]/apps/web/app/dev/map/map-states-gallery.tsx": {
            chunks,
          },
        },
        entryJSFiles: {
          "[project]/apps/web/app/dev/[tool]/page": chunks.map((chunk) =>
            chunk.replace("/_next/", ""),
          ),
        },
      })};\n`,
  );
  writeFileSync(
    join(outDir, "dev", "__production-disabled__", "index.html"),
    "dev-only route",
  );
  return { chunkDirectory, outDir, webRoot };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("pruneDevOnlyOutput", () => {
  test("deletes only chunks unreachable outside the dev route", () => {
    const chunks = [
      "/_next/static/chunks/dev-only.js",
      "/_next/static/chunks/dev-dependency.js",
      "/_next/static/chunks/shared.js",
      "/_next/static/chunks/shared-dependency.js",
    ];
    const { chunkDirectory, outDir, webRoot } = createFixture(chunks);
    writeFileSync(
      join(chunkDirectory, "dev-only.js"),
      'import "./dev-dependency.js"; console.log("MapStatesGallery");',
    );
    writeFileSync(join(chunkDirectory, "dev-dependency.js"), "export {};");
    writeFileSync(
      join(chunkDirectory, "shared.js"),
      'import "./shared-dependency.js";',
    );
    writeFileSync(
      join(chunkDirectory, "shared-dependency.js"),
      "export const shared = true;",
    );
    writeFileSync(
      join(outDir, "index.html"),
      '<script src="/_next/static/chunks/shared.js"></script>',
    );

    const result = pruneDevOnlyOutput({
      logger: { log: vi.fn() },
      webRoot,
    });

    expect(result).toEqual({
      deletedChunks: [
        "/_next/static/chunks/dev-dependency.js",
        "/_next/static/chunks/dev-only.js",
      ],
      preservedChunks: [
        "/_next/static/chunks/shared-dependency.js",
        "/_next/static/chunks/shared.js",
      ],
      removedDevOutput: true,
    });
    expect(() => readFileSync(join(outDir, "dev", "index.html"))).toThrow();
    expect(() => readFileSync(join(chunkDirectory, "dev-only.js"))).toThrow();
    expect(
      readFileSync(join(chunkDirectory, "shared-dependency.js"), "utf8"),
    ).toContain("shared");

    expect(
      pruneDevOnlyOutput({ logger: { log: vi.fn() }, webRoot }),
    ).toEqual({
      deletedChunks: [],
      preservedChunks: [
        "/_next/static/chunks/shared-dependency.js",
        "/_next/static/chunks/shared.js",
      ],
      removedDevOutput: false,
    });
  });

  test("rejects traversal before deleting any output", () => {
    const unsafeChunk = "/_next/static/chunks/../../outside.js";
    const { outDir, webRoot } = createFixture([unsafeChunk]);
    writeFileSync(join(outDir, "outside.js"), "keep me");

    expect(() =>
      pruneDevOnlyOutput({ logger: { log: vi.fn() }, webRoot }),
    ).toThrow(/unsafe dev chunk path/);
    expect(readFileSync(join(outDir, "outside.js"), "utf8")).toBe("keep me");
    expect(
      readFileSync(
        join(outDir, "dev", "__production-disabled__", "index.html"),
        "utf8",
      ),
    ).toBe("dev-only route");
  });
});
