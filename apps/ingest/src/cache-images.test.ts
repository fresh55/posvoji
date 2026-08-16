import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
} from "@posvoji/provider-sdk";
import type { Animal, ImagePolicy } from "@posvoji/schema";
import {
  cacheImages,
  cacheableUrls,
  processImage,
  publicUrlFor,
} from "./cache-images";

function animal(overrides: {
  id: string;
  providerId?: string;
  images: Animal["images"];
}): Animal {
  const providerId = overrides.providerId ?? "macja-hisa";
  return {
    id: overrides.id,
    source: {
      providerId,
      sourceUrl: `https://example.si/${overrides.id}`,
      fetchedAt: "2026-08-16T06:00:00Z",
      firstSeenAt: "2026-08-16T06:00:00Z",
      lastSeenAt: "2026-08-16T06:00:00Z",
    },
    shelter: { id: providerId, name: "Zavetišče", city: "Celje" },
    species: "cat",
    status: "available",
    images: overrides.images,
    attribution: "Vir: Zavetišče",
  };
}

const CACHE_ONLY = new Map<string, ImagePolicy>([
  ["macja-hisa", "cache-permitted"],
]);

interface StubResponse {
  status: number;
  body: Buffer | null;
  notModified?: boolean;
  headers?: PoliteBytesResponse["headers"];
}

class StubClient {
  calls: { url: string; options?: GetBytesOptions }[] = [];
  constructor(private responses: Map<string, StubResponse | (() => StubResponse)>) {}

  async getBytes(
    url: string,
    options?: GetBytesOptions,
  ): Promise<PoliteBytesResponse> {
    this.calls.push({ url, options });
    const found = this.responses.get(url);
    if (!found) throw new Error(`no stub for ${url}`);
    const res = typeof found === "function" ? found() : found;
    return {
      status: res.status,
      body: res.body,
      notModified: res.notModified ?? false,
      headers: res.headers ?? {},
    };
  }
}

async function pngFixture(width = 1200, height = 900): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 210, g: 120, b: 60 },
    },
  })
    .png()
    .toBuffer();
}

describe("cacheableUrls", () => {
  it("takes only cache-permitted images of cache-permitted providers", () => {
    const animals = [
      animal({
        id: "a",
        images: [
          { sourceUrl: "https://img.si/a.jpg", rights: "cache-permitted" },
          { sourceUrl: "https://img.si/b.jpg", rights: "display-permitted" },
        ],
      }),
      animal({
        id: "b",
        providerId: "other-shelter",
        images: [
          { sourceUrl: "https://img.si/c.jpg", rights: "cache-permitted" },
        ],
      }),
    ];
    const policies = new Map<string, ImagePolicy>([
      ["macja-hisa", "cache-permitted"],
      ["other-shelter", "remote"],
    ]);
    expect(cacheableUrls(animals, policies)).toEqual(["https://img.si/a.jpg"]);
  });

  it("dedupes a photo shared by several animals", () => {
    const shared = { sourceUrl: "https://img.si/x.jpg", rights: "cache-permitted" } as const;
    const animals = [
      animal({ id: "a", images: [shared] }),
      animal({ id: "b", images: [shared] }),
    ];
    expect(cacheableUrls(animals, CACHE_ONLY)).toHaveLength(1);
  });
});

describe("processImage", () => {
  it("resizes to web size, converts to webp and names by content", async () => {
    const processed = await processImage(await pngFixture());
    expect(processed.file).toMatch(/^[0-9a-f]{16}\.webp$/);
    expect(processed.width).toBeLessThanOrEqual(800);
    const meta = await sharp(processed.data).metadata();
    expect(meta.format).toBe("webp");

    // Same source bytes must land on the same name across runs.
    const again = await processImage(await pngFixture());
    expect(again.file).toBe(processed.file);
  });

  it("does not enlarge small photos", async () => {
    const processed = await processImage(await pngFixture(300, 200));
    expect(processed.width).toBe(300);
  });
});

describe("cacheImages", () => {
  let dir: string;
  let mediaDir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-image-cache-"));
    mediaDir = join(dir, "media");
    manifestPath = join(dir, "image-cache.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const url = "https://img.si/luna.jpg";
  const animals = () =>
    [animal({ id: "luna", images: [{ sourceUrl: url, rights: "cache-permitted" }] })];

  it("downloads, stores and fills cachedUrl", async () => {
    const client = new StubClient(
      new Map([
        [url, { status: 200, body: await pngFixture(), headers: { etag: '"v1"' } }],
      ]),
    );

    const result = await cacheImages(animals(), client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.fetched).toBe(1);
    const files = readdirSync(mediaDir);
    expect(files).toHaveLength(1);
    const cachedUrl = result.animals[0]!.images[0]!.cachedUrl;
    expect(cachedUrl).toBe(publicUrlFor(files[0]!));

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].etag).toBe('"v1"');
  });

  it("revalidates with stored validators and reuses the copy on 304", async () => {
    const first = new StubClient(
      new Map([
        [url, { status: 200, body: await pngFixture(), headers: { etag: '"v1"' } }],
      ]),
    );
    await cacheImages(animals(), first, CACHE_ONLY, { mediaDir, manifestPath });

    const second = new StubClient(
      new Map([[url, { status: 304, body: null, notModified: true }]]),
    );
    const result = await cacheImages(animals(), second, CACHE_ONLY, {
      mediaDir,
      manifestPath,
      revalidateAfterDays: 0,
    });

    expect(second.calls[0]?.options?.validators?.etag).toBe('"v1"');
    expect(result.reused).toBe(1);
    expect(result.animals[0]!.images[0]!.cachedUrl).toBeDefined();
    expect(readdirSync(mediaDir)).toHaveLength(1);
  });

  it("reuses a fresh copy without touching the network", async () => {
    const first = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), first, CACHE_ONLY, { mediaDir, manifestPath });

    const second = new StubClient(new Map());
    const result = await cacheImages(animals(), second, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(second.calls).toHaveLength(0);
    expect(result.reused).toBe(1);
    expect(result.animals[0]!.images[0]!.cachedUrl).toBeDefined();
  });

  it("drops the copy of an animal that left the dataset", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), client, CACHE_ONLY, { mediaDir, manifestPath });
    expect(readdirSync(mediaDir)).toHaveLength(1);

    const result = await cacheImages([], new StubClient(new Map()), CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.deleted).toBe(1);
    expect(readdirSync(mediaDir)).toHaveLength(0);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries).toEqual({});
  });

  it("drops the copy when the source answers 404", async () => {
    const ok = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), ok, CACHE_ONLY, { mediaDir, manifestPath });

    const gone = new StubClient(
      new Map([[url, { status: 404, body: Buffer.alloc(0) }]]),
    );
    const result = await cacheImages(animals(), gone, CACHE_ONLY, {
      mediaDir,
      manifestPath,
      revalidateAfterDays: 0,
    });

    expect(result.deleted).toBe(1);
    expect(readdirSync(mediaDir)).toHaveLength(0);
    expect(result.animals[0]!.images[0]!.cachedUrl).toBeUndefined();
  });

  it("keeps the existing copy when a refetch fails transiently", async () => {
    const ok = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), ok, CACHE_ONLY, { mediaDir, manifestPath });

    const flaky = new StubClient(
      new Map([[url, { status: 503, body: Buffer.alloc(0) }]]),
    );
    const result = await cacheImages(animals(), flaky, CACHE_ONLY, {
      mediaDir,
      manifestPath,
      revalidateAfterDays: 0,
    });

    expect(readdirSync(mediaDir)).toHaveLength(1);
    expect(result.animals[0]!.images[0]!.cachedUrl).toBeDefined();
  });

  it("keeps a shared file while any URL still references it", async () => {
    const other = "https://img.si/luna-2.jpg";
    const bytes = await pngFixture();
    const both = [
      animal({
        id: "luna",
        images: [
          { sourceUrl: url, rights: "cache-permitted" },
          { sourceUrl: other, rights: "cache-permitted" },
        ],
      }),
    ];
    const client = new StubClient(
      new Map([
        [url, { status: 200, body: bytes }],
        [other, { status: 200, body: bytes }],
      ]),
    );
    await cacheImages(both, client, CACHE_ONLY, { mediaDir, manifestPath });
    // Identical bytes → one content-addressed file for two URLs.
    expect(readdirSync(mediaDir)).toHaveLength(1);

    const oneLeft = [
      animal({ id: "luna", images: [{ sourceUrl: url, rights: "cache-permitted" }] }),
    ];
    const revalidate = new StubClient(
      new Map([[url, { status: 200, body: bytes }]]),
    );
    const result = await cacheImages(oneLeft, revalidate, CACHE_ONLY, {
      mediaDir,
      manifestPath,
      revalidateAfterDays: 0,
    });

    expect(result.deleted).toBe(0);
    expect(readdirSync(mediaDir)).toHaveLength(1);
  });

  it("caches nothing for a provider without cache permission", async () => {
    const client = new StubClient(new Map());
    const remoteOnly = new Map<string, ImagePolicy>([["macja-hisa", "remote"]]);

    const result = await cacheImages(animals(), client, remoteOnly, {
      mediaDir,
      manifestPath,
    });

    expect(client.calls).toHaveLength(0);
    expect(result.animals[0]!.images[0]!.cachedUrl).toBeUndefined();
    expect(existsSync(mediaDir) ? readdirSync(mediaDir) : []).toHaveLength(0);
  });
});
