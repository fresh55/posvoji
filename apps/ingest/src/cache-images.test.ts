import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
} from "@posvoji/provider-sdk";
import { Animal as AnimalSchema } from "@posvoji/schema";
import type { Animal, ImagePolicy } from "@posvoji/schema";
import {
  DERIVATIVE_VERSION,
  avifFileFor,
  cacheImages,
  cacheableUrls,
  heroSourceUrls,
  processImage,
  publicUrlFor,
  rungFileFor,
  thumbFileFor,
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

async function pngFixture(
  width = 1200,
  height = 900,
  // A flat fixture of the same colour encodes to the same bytes at the same
  // size, which is the point in most tests; a different colour is how a test
  // asks for a second, distinct cached file.
  background = { r: 210, g: 120, b: 60 },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } })
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

// A shelter photo can be a malformed-but-renderable JPEG: browsers decode it
// fine, but libvips' default failOn sensitivity refuses it. This reproduces
// that exact failure ("VipsJpeg: Invalid SOS parameters for sequential
// JPEG") by corrupting one byte of a tiny generated JPEG's SOS header, so no
// binary fixture needs to be committed. Ss (the spectral selection start)
// must be 0 for a baseline sequential scan; setting it to 1 is what libvips'
// strict decode rejects and its relaxed one lets through.
async function damagedSosJpegFixture(): Promise<Buffer> {
  const good = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  let sosIndex = -1;
  for (let i = 0; i < good.length - 1; i++) {
    if (good[i] === 0xff && good[i + 1] === 0xda) {
      sosIndex = i;
      break;
    }
  }
  if (sosIndex === -1) throw new Error("fixture jpeg has no SOS marker");

  const componentCount = good[sosIndex + 4]!;
  const ssOffset = sosIndex + 5 + componentCount * 2;
  const corrupted = Buffer.from(good);
  corrupted[ssOffset] = 0x01;
  return corrupted;
}

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

  it("retries tolerantly when the strict decode rejects a malformed but renderable jpeg", async () => {
    const damaged = await damagedSosJpegFixture();
    const tolerantErrors: unknown[] = [];

    const processed = await processImage(damaged, (error) => {
      tolerantErrors.push(error);
    });

    expect(tolerantErrors).toHaveLength(1);
    expect(String(tolerantErrors[0])).toMatch(/Invalid SOS parameters/);
    const meta = await sharp(processed.data).metadata();
    expect(meta.format).toBe("webp");
  });

  it("still rejects a source neither decode can read", async () => {
    const tolerantErrors: unknown[] = [];
    await expect(
      processImage(Buffer.from("not an image"), (error) => tolerantErrors.push(error)),
    ).rejects.toThrow();
    expect(tolerantErrors).toHaveLength(0);
  });
});

describe("heroSourceUrls", () => {
  it("takes the first image of every animal", () => {
    const animals = [
      animal({
        id: "a",
        images: [
          { sourceUrl: "https://img.si/a1.jpg", rights: "cache-permitted" },
          { sourceUrl: "https://img.si/a2.jpg", rights: "cache-permitted" },
        ],
      }),
      animal({ id: "b", images: [] }),
      animal({
        id: "c",
        images: [
          { sourceUrl: "https://img.si/a2.jpg", rights: "cache-permitted" },
        ],
      }),
    ];
    expect([...heroSourceUrls(animals)]).toEqual([
      "https://img.si/a1.jpg",
      "https://img.si/a2.jpg",
    ]);
  });
});

// A cached 800px hero lands as six files: the copy, its thumb, the 320, 480
// and 640 rungs, and one avif.
const HERO_FILES = 6;

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
    expect(files).toHaveLength(HERO_FILES);
    const main = files.find((file) => /^[0-9a-f]{16}\.webp$/.test(file))!;
    expect(files).toContain(thumbFileFor(main));
    const cachedUrl = result.animals[0]!.images[0]!.cachedUrl;
    expect(cachedUrl).toBe(publicUrlFor(main));

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].etag).toBe('"v1"');
  });

  it("cuts a strip-sized thumbnail next to the cached copy", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), client, CACHE_ONLY, { mediaDir, manifestPath });

    const thumb = readdirSync(mediaDir).find((file) =>
      file.endsWith(".thumb.webp"),
    )!;
    const meta = await sharp(readFileSync(join(mediaDir, thumb))).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(112);
  });

  it("backfills a missing thumbnail without touching the network", async () => {
    const first = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), first, CACHE_ONLY, { mediaDir, manifestPath });

    // A media dir written before thumbnails existed has only the large copy.
    const thumb = readdirSync(mediaDir).find((file) =>
      file.endsWith(".thumb.webp"),
    )!;
    rmSync(join(mediaDir, thumb));

    const second = new StubClient(new Map());
    await cacheImages(animals(), second, CACHE_ONLY, { mediaDir, manifestPath });

    expect(second.calls).toHaveLength(0);
    expect(readdirSync(mediaDir)).toContain(thumb);
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
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);
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
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);

    const result = await cacheImages([], new StubClient(new Map()), CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.deleted).toBe(HERO_FILES);
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

    expect(result.deleted).toBe(HERO_FILES);
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

    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);
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
    // Identical bytes → one content-addressed file, and one set of
    // derivatives, for two URLs.
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);

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
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);
  });

  it("caches only the scoped provider and leaves the rest untouched", async () => {
    const otherUrl = "https://img.si/muri-archie.jpg";
    const policies = new Map<string, ImagePolicy>([
      ["macja-hisa", "cache-permitted"],
      ["muri", "cache-permitted"],
    ]);
    const both = () => [
      animal({ id: "luna", images: [{ sourceUrl: url, rights: "cache-permitted" }] }),
      animal({
        id: "archie",
        providerId: "muri",
        images: [{ sourceUrl: otherUrl, rights: "cache-permitted" }],
      }),
    ];

    // A full run first, so both photos are cached and old enough to revalidate.
    const first = new StubClient(
      new Map([
        [url, { status: 200, body: await pngFixture() }],
        [otherUrl, { status: 200, body: await pngFixture(120) }],
      ]),
    );
    await cacheImages(both(), first, policies, { mediaDir, manifestPath });

    // Same bytes back, so the scoped photo keeps its content-addressed name
    // and any deletion below would have to be an unscoped file.
    const second = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const result = await cacheImages(both(), second, policies, {
      mediaDir,
      manifestPath,
      revalidateAfterDays: 0,
      refreshProviderIds: new Set(["macja-hisa"]),
    });

    // Only the scoped provider's photo was requested; a stub miss would throw.
    expect(second.calls.map(({ url: called }) => called)).toEqual([url]);
    // The unscoped provider keeps its cached copy rather than losing it to the
    // deletion sweep.
    expect(result.deleted).toBe(0);
    expect(result.animals[1]!.images[0]!.cachedUrl).toBeDefined();
    expect(
      existsSync(join(mediaDir, result.animals[1]!.images[0]!.cachedUrl!.split("/").pop()!)),
    ).toBe(true);
  });

  it("derives a smaller rung per ladder width and records them", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const result = await cacheImages(animals(), client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    const image = result.animals[0]!.images[0]!;
    const main = image.cachedUrl!.split("/").pop()!;
    expect(image.widths).toEqual([320, 480, 640, 800]);
    for (const rung of [320, 480, 640]) {
      const path = join(mediaDir, rungFileFor(main, rung));
      expect(rungFileFor(main, rung)).toBe(main.replace(".webp", `-${rung}.webp`));
      const meta = await sharp(readFileSync(path)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(rung);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].widths).toEqual([320, 480, 640, 800]);
  });

  it("never enlarges: a small photo gets no rungs", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture(300, 200) }]]),
    );
    const result = await cacheImages(animals(), client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.animals[0]!.images[0]!.widths).toEqual([300]);
    expect(readdirSync(mediaDir).filter((f) => /-\d+\.webp$/.test(f))).toEqual(
      [],
    );
  });

  it("keeps the placeholder in the manifest rather than on disk", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const result = await cacheImages(animals(), client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    const blur = result.animals[0]!.images[0]!.blurDataURL!;
    expect(blur).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/);
    // A placeholder that is not clearly cheaper than a request is pointless.
    expect(blur.length).toBeLessThan(1500);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].blurDataURL).toBe(blur);
    expect(readdirSync(mediaDir).some((f) => f.includes("blur"))).toBe(false);
  });

  it("derives avif for the hero photo only", async () => {
    const second = "https://img.si/luna-second.jpg";
    const twoPhotos = [
      animal({
        id: "luna",
        images: [
          { sourceUrl: url, rights: "cache-permitted" },
          { sourceUrl: second, rights: "cache-permitted" },
        ],
      }),
    ];
    const client = new StubClient(
      new Map([
        [url, { status: 200, body: await pngFixture() }],
        [
          second,
          {
            status: 200,
            body: await pngFixture(1000, 750, { r: 40, g: 90, b: 160 }),
          },
        ],
      ]),
    );

    const result = await cacheImages(twoPhotos, client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    const [hero, rest] = result.animals[0]!.images;
    expect(hero!.avif).toBe(true);
    expect(rest!.avif).toBeUndefined();

    const heroFile = hero!.cachedUrl!.split("/").pop()!;
    const restFile = rest!.cachedUrl!.split("/").pop()!;
    expect(avifFileFor(heroFile)).toBe(heroFile.replace(".webp", ".avif"));
    const meta = await sharp(
      readFileSync(join(mediaDir, avifFileFor(heroFile))),
    ).metadata();
    expect(meta.format).toBe("heif");
    expect(existsSync(join(mediaDir, avifFileFor(restFile)))).toBe(false);
  });

  it("carries the derived fields onto a schema-valid animal", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const result = await cacheImages(animals(), client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.animals[0]!.images[0]).toMatchObject({
      width: 800,
      height: 600,
      widths: [320, 480, 640, 800],
      avif: true,
    });
    expect(AnimalSchema.safeParse(result.animals[0]).success).toBe(true);
    expect(result.derived).toMatchObject({ rungs: 3, blurs: 1, avifs: 1 });
  });

  it("backfills missing rungs, placeholder and avif without the network", async () => {
    const first = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const before = await cacheImages(animals(), first, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });
    const main = before.animals[0]!.images[0]!.cachedUrl!.split("/").pop()!;

    // A media dir and a manifest written before the derivatives existed.
    rmSync(join(mediaDir, rungFileFor(main, 480)));
    rmSync(join(mediaDir, avifFileFor(main)));
    const stale = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete stale.entries[url].blurDataURL;
    delete stale.entries[url].widths;
    delete stale.entries[url].avif;
    writeFileSync(manifestPath, JSON.stringify(stale));

    const second = new StubClient(new Map());
    const result = await cacheImages(animals(), second, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(second.calls).toHaveLength(0);
    expect(result.derived).toMatchObject({ rungs: 1, blurs: 1, avifs: 1 });
    expect(existsSync(join(mediaDir, rungFileFor(main, 480)))).toBe(true);
    expect(existsSync(join(mediaDir, avifFileFor(main)))).toBe(true);
    expect(result.animals[0]!.images[0]!.blurDataURL).toMatch(/^data:image\//);
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES);
  });

  it("records the derivative version and round-trips it", async () => {
    const client = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), client, CACHE_ONLY, { mediaDir, manifestPath });

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].derivativeVersion).toBe(DERIVATIVE_VERSION);

    // A second run reads the field back and finds nothing left to cut.
    const second = await cacheImages(
      animals(),
      new StubClient(new Map()),
      CACHE_ONLY,
      { mediaDir, manifestPath },
    );
    expect(second.derived).toEqual({
      thumbs: 0,
      rungs: 0,
      blurs: 0,
      avifs: 0,
    });
  });

  it("re-cuts every derivative when the recorded version moved on", async () => {
    const first = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    const before = await cacheImages(animals(), first, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });
    const main = before.animals[0]!.images[0]!.cachedUrl!.split("/").pop()!;
    const filesBefore = readdirSync(mediaDir).sort();
    const masterBytes = readFileSync(join(mediaDir, main));

    // A manifest written by an older encoder, with every file still in place.
    const stale = JSON.parse(readFileSync(manifestPath, "utf8"));
    stale.entries[url].derivativeVersion = DERIVATIVE_VERSION - 1;
    writeFileSync(manifestPath, JSON.stringify(stale));

    const second = new StubClient(new Map());
    const result = await cacheImages(animals(), second, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    // Nothing was requested, and nothing was added or swept: the same names
    // carry newly encoded bytes.
    expect(second.calls).toHaveLength(0);
    expect(result.deleted).toBe(0);
    expect(readdirSync(mediaDir).sort()).toEqual(filesBefore);
    expect(result.derived).toEqual({
      thumbs: 1,
      rungs: 3,
      blurs: 1,
      avifs: 1,
    });
    // The master is a fetched file, not a derivative, so it is left alone.
    expect(readFileSync(join(mediaDir, main))).toEqual(masterBytes);
    // Every derivative is still readable, and the entry has moved on.
    for (const rung of [320, 480, 640]) {
      const meta = await sharp(
        readFileSync(join(mediaDir, rungFileFor(main, rung))),
      ).metadata();
      expect(meta.width).toBe(rung);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.entries[url].derivativeVersion).toBe(DERIVATIVE_VERSION);
    expect(manifest.entries[url].blurDataURL).toMatch(/^data:image\/webp;/);
  });

  it("treats a manifest without the version field as version 1", async () => {
    const first = new StubClient(
      new Map([[url, { status: 200, body: await pngFixture() }]]),
    );
    await cacheImages(animals(), first, CACHE_ONLY, { mediaDir, manifestPath });

    const old = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete old.entries[url].derivativeVersion;
    writeFileSync(manifestPath, JSON.stringify(old));

    const result = await cacheImages(
      animals(),
      new StubClient(new Map()),
      CACHE_ONLY,
      { mediaDir, manifestPath },
    );

    expect(result.derived).toEqual({
      thumbs: 1,
      rungs: 3,
      blurs: 1,
      avifs: 1,
    });
  });

  it("sweeps the derivatives of a dropped photo and keeps the rest", async () => {
    const otherUrl = "https://img.si/muri.jpg";
    const both = [
      animal({ id: "luna", images: [{ sourceUrl: url, rights: "cache-permitted" }] }),
      animal({
        id: "muri",
        images: [{ sourceUrl: otherUrl, rights: "cache-permitted" }],
      }),
    ];
    const client = new StubClient(
      new Map([
        [url, { status: 200, body: await pngFixture() }],
        [
          otherUrl,
          {
            status: 200,
            body: await pngFixture(1000, 750, { r: 40, g: 90, b: 160 }),
          },
        ],
      ]),
    );
    const before = await cacheImages(both, client, CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });
    const gone = before.animals[0]!.images[0]!.cachedUrl!.split("/").pop()!;
    const kept = before.animals[1]!.images[0]!.cachedUrl!.split("/").pop()!;
    expect(readdirSync(mediaDir)).toHaveLength(HERO_FILES * 2);

    const result = await cacheImages([both[1]!], new StubClient(new Map()), CACHE_ONLY, {
      mediaDir,
      manifestPath,
    });

    expect(result.deleted).toBe(HERO_FILES);
    const left = readdirSync(mediaDir);
    for (const file of [
      gone,
      thumbFileFor(gone),
      avifFileFor(gone),
      ...[320, 480, 640].map((w) => rungFileFor(gone, w)),
    ]) {
      expect(left).not.toContain(file);
    }
    for (const file of [
      kept,
      thumbFileFor(kept),
      avifFileFor(kept),
      ...[320, 480, 640].map((w) => rungFileFor(kept, w)),
    ]) {
      expect(left).toContain(file);
    }
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
