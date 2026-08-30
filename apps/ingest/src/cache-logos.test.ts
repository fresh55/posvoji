import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
  PoliteResponse,
} from "@posvoji/provider-sdk";
import { ProviderPolicy } from "@posvoji/schema";
import {
  cacheLogos,
  logoSurface,
  discoverLogoUrl,
  logoTargets,
  processLogo,
  publicUrlFor,
} from "./cache-logos";

function policy(overrides: Record<string, unknown>): ProviderPolicy {
  return ProviderPolicy.parse({
    providerId: "macja-hisa",
    source: "https://www.macjahisa.si/muce_za_posvojitev.php",
    enabled: true,
    ingestion: "scrape",
    images: "cache-permitted",
    descriptions: "facts-only",
    permission: { status: "granted", date: "2026-08-18" },
    attribution: "Vir: Zavetišče Mačja hiša",
    crawl: { intervalHours: 12 },
    ...overrides,
  });
}

async function pngBytes(size = 64, colour = "#3366cc"): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: colour,
    },
  })
    .png()
    .toBuffer();
}

/** A mark on a transparent ground, which is what a shelter logo usually is.
 *
 *  A solid rectangle will not do for the surface tests: with no clear pixel in
 *  it, it is a file that brings its own background, and the chip questions are
 *  not asked of those at all. */
async function inkBytes(colour: string, size = 32): Promise<Buffer> {
  const ink = await sharp({
    create: { width: size, height: size, channels: 4, background: colour },
  })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size * 2,
      height: size * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: ink, left: size / 2, top: size / 2 }])
    .png()
    .toBuffer();
}

interface StubResponse {
  status: number;
  body: Buffer | null;
  notModified?: boolean;
  headers?: PoliteBytesResponse["headers"];
}

class StubClient {
  pages: string[] = [];
  files: { url: string; options?: GetBytesOptions }[] = [];

  constructor(
    private html: Map<string, string>,
    private bytes: Map<string, StubResponse>,
  ) {}

  async get(url: string): Promise<PoliteResponse> {
    this.pages.push(url);
    const body = this.html.get(url);
    if (body === undefined) return { status: 404, body: null, notModified: false, headers: {} };
    return { status: 200, body, notModified: false, headers: {} };
  }

  async getBytes(
    url: string,
    options?: GetBytesOptions,
  ): Promise<PoliteBytesResponse> {
    this.files.push({ url, options });
    const res = this.bytes.get(url);
    if (!res) return { status: 404, body: null, notModified: false, headers: {} };
    return {
      status: res.status,
      body: res.body,
      notModified: res.notModified ?? false,
      headers: res.headers ?? {},
    };
  }
}

// Records what was in flight while the logos were taken: overall, and for one
// host. Every request holds for a moment, so a loop that finishes one shelter
// before starting the next can never push either peak above 1.
class ConcurrencyClient {
  peak = 0;
  peakPerHost = 0;
  order: string[] = [];
  private inFlight = 0;
  private perHost = new Map<string, number>();

  constructor(
    private html: Map<string, string>,
    private bytes: Map<string, StubResponse>,
    private holdMs = 5,
  ) {}

  private async hold<T>(url: string, answer: () => T): Promise<T> {
    const host = new URL(url).host;
    this.order.push(url);
    this.inFlight++;
    const onHost = (this.perHost.get(host) ?? 0) + 1;
    this.perHost.set(host, onHost);
    this.peak = Math.max(this.peak, this.inFlight);
    this.peakPerHost = Math.max(this.peakPerHost, onHost);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.holdMs));
      return answer();
    } finally {
      this.inFlight--;
      this.perHost.set(host, (this.perHost.get(host) ?? 1) - 1);
    }
  }

  async get(url: string): Promise<PoliteResponse> {
    return this.hold(url, () => {
      const body = this.html.get(url);
      if (body === undefined) {
        return { status: 404, body: null, notModified: false, headers: {} };
      }
      return { status: 200, body, notModified: false, headers: {} };
    });
  }

  async getBytes(url: string): Promise<PoliteBytesResponse> {
    return this.hold(url, () => {
      const res = this.bytes.get(url);
      if (!res) return { status: 404, body: null, notModified: false, headers: {} };
      return {
        status: res.status,
        body: res.body,
        notModified: res.notModified ?? false,
        headers: res.headers ?? {},
      };
    });
  }
}

describe("logoTargets", () => {
  // The logo grant stands on its own. A shelter that publishes no list we
  // ingest can still permit its mark, and gating the sync on `enabled` meant
  // the only way to draw that logo was to claim we crawl them.
  it("takes a permitted logo from a provider we do not crawl", () => {
    const targets = logoTargets([
      policy({
        providerId: "oskar",
        source: "https://zavetisceoskar.si/",
        enabled: false,
        ingestion: "manual",
        images: "none",
        descriptions: "facts-only",
        logo: { use: "permitted", date: "2026-08-30" },
      }),
    ]);

    expect(targets).toEqual([
      {
        providerId: "oskar",
        homeUrl: "https://zavetisceoskar.si",
        logoUrl: undefined,
      },
    ]);
  });

  it("takes only providers with a permitted logo", () => {
    const targets = logoTargets([
      policy({
        providerId: "macja-hisa",
        logo: { use: "permitted", date: "2026-08-20" },
      }),
      // Photograph rights are not logo rights: this one must not be picked up.
      policy({ providerId: "muri", source: "https://muri.si/zivali" }),
      policy({
        providerId: "turk",
        source: "https://zavetisceturk.com/zivali",
        enabled: false,
        images: "none",
        descriptions: "facts-only",
        permission: { status: "none" },
      }),
    ]);

    expect(targets).toEqual([
      {
        providerId: "macja-hisa",
        homeUrl: "https://www.macjahisa.si",
        logoUrl: undefined,
      },
    ]);
  });

  it("carries a supplied file path through", () => {
    const targets = logoTargets([
      policy({
        logo: {
          use: "permitted",
          date: "2026-08-30",
          file: "data/shelter-logos/potepuhi.jpg",
        },
      }),
    ]);
    expect(targets[0]!.logoFile).toBe("data/shelter-logos/potepuhi.jpg");
    expect(targets[0]!.logoUrl).toBeUndefined();
  });

  it("carries a pinned logo url through", () => {
    const targets = logoTargets([
      policy({
        logo: {
          use: "permitted",
          date: "2026-08-20",
          url: "https://www.macjahisa.si/img/logo.png",
        },
      }),
    ]);
    expect(targets[0]!.logoUrl).toBe("https://www.macjahisa.si/img/logo.png");
  });
});

describe("discoverLogoUrl", () => {
  const base = "https://zavetisce.si";

  it("prefers an img the site itself calls a logo", () => {
    const html = `
      <link rel="apple-touch-icon" href="/touch.png">
      <img src="/media/logo-zavetisce.png" alt="Zavetišče">
    `;
    expect(discoverLogoUrl(html, base)).toBe(
      "https://zavetisce.si/media/logo-zavetisce.png",
    );
  });

  it("falls back to the apple touch icon", () => {
    const html = `<link rel="apple-touch-icon" sizes="180x180" href="/touch.png">`;
    expect(discoverLogoUrl(html, base)).toBe("https://zavetisce.si/touch.png");
  });

  it("ranks a .ico favicon below a real icon file", () => {
    const html = `
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
    `;
    expect(discoverLogoUrl(html, base)).toBe("https://zavetisce.si/icon-192.png");
  });

  it("ignores og:image, which is usually a photo of an animal", () => {
    const html = `<meta property="og:image" content="/photos/muca.jpg">`;
    expect(discoverLogoUrl(html, base)).toBeUndefined();
  });

  it("ignores data uris", () => {
    const html = `<img class="logo" src="data:image/gif;base64,R0lGOD">`;
    expect(discoverLogoUrl(html, base)).toBeUndefined();
  });

  it("returns nothing when the page has no candidate", () => {
    expect(discoverLogoUrl("<p>Dobrodošli</p>", base)).toBeUndefined();
  });
});

describe("processLogo", () => {
  it("fits a logo inside the box without enlarging it", async () => {
    const processed = await processLogo(await pngBytes(600));
    expect(processed.width).toBe(384);
    expect(processed.height).toBe(384);
    expect(processed.file).toMatch(/^[0-9a-f]{16}\.webp$/);
    expect(processed.chipOnLight).toBe(false);
  });

  it("leaves a small raster logo at its own size", async () => {
    const processed = await processLogo(await pngBytes(40));
    expect(processed.width).toBe(40);
  });

  // A vector has no size of its own, only the one its author typed. Rendering
  // it at that size and then refusing to enlarge the bitmap pinned Maribor's
  // mark, which declares width="85", to 85px: the most scalable source in the
  // register produced the smallest copy in it.
  it("draws a vector at the size it is kept at, not the size it declares", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="85" height="40" viewBox="0 0 85 40">' +
        '<rect width="85" height="40" fill="#101010"/></svg>',
    );

    const processed = await processLogo(svg);
    expect(processed.width).toBeGreaterThan(300);
  });

  // The site sizes a logo by the cached file's dimensions, so a transparent
  // apron around the mark shrinks the drawn ink by its share of the box.
  it("trims transparent margins down to the mark", async () => {
    const ink = await sharp({
      create: { width: 20, height: 12, channels: 4, background: "#101010" },
    })
      .png()
      .toBuffer();
    const padded = await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: ink, left: 38, top: 42 }])
      .png()
      .toBuffer();

    const processed = await processLogo(padded);
    expect(processed.width).toBe(20);
    expect(processed.height).toBe(12);
  });
});

describe("logoSurface", () => {
  it("gives a white wordmark something to sit on in light mode only", async () => {
    expect(await logoSurface(await inkBytes("#ffffff"))).toEqual({
      chipOnLight: true,
      chipOnDark: false,
      opaque: false,
    });
  });

  it("gives a black wordmark something to sit on in dark mode only", async () => {
    expect(await logoSurface(await inkBytes("#101010"))).toEqual({
      chipOnLight: false,
      chipOnDark: true,
      opaque: false,
    });
  });

  // The case a light-or-dark reading gets wrong in both directions. This ink
  // has no dark pixel, so it was called light and plated in dark mode where
  // it was already legible; and it reaches 1.9:1 on white, where it was left
  // bare and washed out. It is the shelter's own orange (Horjul).
  it("gives a mid-tone orange the light chip and leaves it bare on dark", async () => {
    expect(await logoSurface(await inkBytes("#e8842c"))).toEqual({
      chipOnLight: true,
      chipOnDark: false,
      opaque: false,
    });
  });

  // A quarter of the ink being dark is enough to carry the drawing on white,
  // because that quarter is the outline the bright fill sits inside. Mačja
  // hiša is this logo and it reads on both cards with no chip at all.
  it("leaves a bright logo with black line art bare on both", async () => {
    const outline = await sharp({
      create: { width: 64, height: 20, channels: 4, background: "#000000" },
    })
      .png()
      .toBuffer();
    const logo = await sharp({
      create: {
        width: 64,
        height: 80,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 64,
              height: 64,
              channels: 4,
              background: "#f5c400",
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
        { input: outline, left: 0, top: 44 },
      ])
      .png()
      .toBuffer();

    expect(await logoSurface(logo)).toEqual({
      chipOnLight: false,
      chipOnDark: false,
      opaque: false,
    });
  });

  // A file with no transparent pixel anywhere carries its own background, so
  // the card is not behind it and a chip would only be a second rectangle
  // behind the first. Several shelters send exactly this: a JPEG of the mark
  // on flat white.
  it("reads a file with no transparency as bringing its own ground", async () => {
    const white = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();

    expect(await logoSurface(white)).toEqual({
      chipOnLight: false,
      chipOnDark: false,
      opaque: true,
    });
  });

  // A logo is mostly transparent padding, so counting every pixel would read
  // almost every logo as pale.
  it("ignores transparent padding around the ink", async () => {
    const ink = await sharp({
      create: { width: 8, height: 8, channels: 4, background: "#000000" },
    })
      .png()
      .toBuffer();
    const padded = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      },
    })
      .composite([{ input: ink, left: 28, top: 28 }])
      .png()
      .toBuffer();

    expect(await logoSurface(padded)).toEqual({
      chipOnLight: false,
      chipOnDark: true,
      opaque: false,
    });
  });
});

describe("cacheLogos", () => {
  let dir: string;
  let manifestPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "posvoji-logos-"));
    manifestPath = join(dir, "shelter-logos.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const logosDir = () => join(dir, "files");

  // A shelter with no site to fetch from sends the artwork instead, and the
  // file travels with the repository. Nothing about that turn touches the
  // network: no home page, no logo request, no discovery.
  it("reads a supplied logo off the disk without a request", async () => {
    const client = new StubClient(new Map(), new Map());
    const root = join(dir, "root");
    mkdirSync(join(root, "data", "shelter-logos"), { recursive: true });
    writeFileSync(
      join(root, "data", "shelter-logos", "potepuhi.jpg"),
      await sharp({
        create: { width: 300, height: 120, channels: 3, background: "#ffffff" },
      })
        .jpeg()
        .toBuffer(),
    );

    const result = await cacheLogos(
      [
        {
          providerId: "potepuhi",
          homeUrl: "https://example.si",
          logoFile: "data/shelter-logos/potepuhi.jpg",
        },
      ],
      client,
      { logosDir: logosDir(), manifestPath, fileRoot: root },
    );

    expect(client.pages).toEqual([]);
    expect(client.files).toEqual([]);
    const entry = result.manifest.entries["potepuhi"]!;
    expect(entry.sourceUrl).toBe("data/shelter-logos/potepuhi.jpg");
    // Flat white with nothing transparent in it: its own plate, no chip.
    expect(entry.opaque).toBe(true);
    expect(entry.chipOnLight).toBe(false);
    expect(entry.chipOnDark).toBe(false);
    expect(existsSync(join(logosDir(), entry.file))).toBe(true);
  });

  it("refuses a supplied path that climbs out of the repository", async () => {
    const client = new StubClient(new Map(), new Map());
    const root = join(dir, "root");
    mkdirSync(root, { recursive: true });

    const result = await cacheLogos(
      [
        {
          providerId: "potepuhi",
          homeUrl: "https://example.si",
          logoFile: "../outside.png",
        },
      ],
      client,
      { logosDir: logosDir(), manifestPath, fileRoot: root },
    );

    expect(result.manifest.entries["potepuhi"]).toBeUndefined();
  });

  it("discovers, fetches and records a logo", async () => {
    const client = new StubClient(
      new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
      new Map([
        [
          "https://zavetisce.si/logo.png",
          { status: 200, body: await pngBytes(), headers: { etag: '"v1"' } },
        ],
      ]),
    );

    const result = await cacheLogos(
      [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }],
      client,
      { logosDir: logosDir(), manifestPath },
    );

    expect(result.fetched).toBe(1);
    const entry = result.manifest.entries["zonzani"]!;
    expect(entry.sourceUrl).toBe("https://zavetisce.si/logo.png");
    expect(entry.chipOnLight).toBe(false);
    expect(entry.etag).toBe('"v1"');
    expect(existsSync(join(logosDir(), entry.file))).toBe(true);
    expect(publicUrlFor(entry.file)).toBe(`/media/shelter-logos/${entry.file}`);
    expect(result.discovered).toEqual({
      zonzani: "https://zavetisce.si/logo.png",
    });
  });

  it("skips discovery when the policy pins the url", async () => {
    const client = new StubClient(
      new Map(),
      new Map([
        ["https://zavetisce.si/brand.png", { status: 200, body: await pngBytes() }],
      ]),
    );

    const result = await cacheLogos(
      [
        {
          providerId: "zonzani",
          homeUrl: "https://zavetisce.si",
          logoUrl: "https://zavetisce.si/brand.png",
        },
      ],
      client,
      { logosDir: logosDir(), manifestPath },
    );

    expect(client.pages).toEqual([]);
    expect(result.fetched).toBe(1);
    expect(result.discovered).toEqual({});
  });

  it("reuses a fresh copy without any request", async () => {
    const html = new Map([
      ["https://zavetisce.si", `<img class="logo" src="/logo.png">`],
    ]);
    const bytes = new Map([
      ["https://zavetisce.si/logo.png", { status: 200, body: await pngBytes() }],
    ]);
    const targets = [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }];
    const options = { logosDir: logosDir(), manifestPath };

    await cacheLogos(targets, new StubClient(html, bytes), options);
    const second = new StubClient(html, bytes);
    const result = await cacheLogos(targets, second, options);

    expect(result.reused).toBe(1);
    expect(second.pages).toEqual([]);
    expect(second.files).toEqual([]);
  });

  it("re-fetches when the policy pins a url the cached copy did not come from", async () => {
    const options = { logosDir: logosDir(), manifestPath };
    await cacheLogos(
      [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }],
      new StubClient(
        new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
        new Map([
          ["https://zavetisce.si/logo.png", { status: 200, body: await pngBytes(64, "#111111") }],
        ]),
      ),
      options,
    );

    const client = new StubClient(
      new Map(),
      new Map([
        ["https://zavetisce.si/better.png", { status: 200, body: await pngBytes(64, "#cc3366") }],
      ]),
    );
    const result = await cacheLogos(
      [
        {
          providerId: "zonzani",
          homeUrl: "https://zavetisce.si",
          logoUrl: "https://zavetisce.si/better.png",
        },
      ],
      client,
      options,
    );

    expect(result.fetched).toBe(1);
    expect(result.manifest.entries["zonzani"]!.sourceUrl).toBe(
      "https://zavetisce.si/better.png",
    );
  });

  // The file outlives the entry by one run. Something is usually still holding
  // the manifest that named it, and a logo is renamed whenever its bytes
  // change, so deleting it the moment it stops being referenced leaves every
  // reader of the previous manifest pointing at a 404.
  it("drops a shelter that no longer permits its logo, and its file a run later", async () => {
    const options = { logosDir: logosDir(), manifestPath };
    const empty = () => new StubClient(new Map(), new Map());
    await cacheLogos(
      [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }],
      new StubClient(
        new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
        new Map([
          ["https://zavetisce.si/logo.png", { status: 200, body: await pngBytes() }],
        ]),
      ),
      options,
    );
    expect(readdirSync(logosDir())).toHaveLength(1);

    // The entry goes at once, so the site stops drawing it immediately.
    const first = await cacheLogos([], empty(), options);
    expect(first.manifest.entries).toEqual({});
    expect(first.deleted).toBe(0);
    expect(readdirSync(logosDir())).toHaveLength(1);

    // By the next run no manifest names it and the sweep takes it.
    const second = await cacheLogos([], empty(), options);
    expect(second.deleted).toBe(1);
    expect(readdirSync(logosDir())).toEqual([]);
  });

  // The window the grace generation exists for: a mark whose bytes change is
  // written under a new name, and the old one has to stay readable for
  // whatever is still holding the manifest that named it.
  it("keeps the previous file for a run when a logo is replaced", async () => {
    const options = { logosDir: logosDir(), manifestPath };
    const targets = [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }];
    const serve = (body: Buffer) =>
      new StubClient(
        new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
        new Map([["https://zavetisce.si/logo.png", { status: 200, body }]]),
      );

    const before = await cacheLogos(targets, serve(await pngBytes(64)), options);
    const oldFile = before.manifest.entries["zonzani"]!.file;

    const after = await cacheLogos(targets, serve(await pngBytes(48)), {
      ...options,
      revalidateAfterDays: 0,
    });
    const newFile = after.manifest.entries["zonzani"]!.file;

    expect(newFile).not.toBe(oldFile);
    expect(existsSync(join(logosDir(), newFile))).toBe(true);
    expect(existsSync(join(logosDir(), oldFile))).toBe(true);
  });

  it("keeps the previous copy when the home page cannot be read", async () => {
    const options = { logosDir: logosDir(), manifestPath };
    const targets = [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }];
    await cacheLogos(
      targets,
      new StubClient(
        new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
        new Map([
          ["https://zavetisce.si/logo.png", { status: 200, body: await pngBytes() }],
        ]),
      ),
      options,
    );

    const result = await cacheLogos(targets, new StubClient(new Map(), new Map()), {
      ...options,
      revalidateAfterDays: 0,
    });

    expect(result.manifest.entries["zonzani"]).toBeDefined();
    expect(result.deleted).toBe(0);
  });

  it("keeps every file when the manifest was lost", async () => {
    const options = { logosDir: logosDir(), manifestPath };
    const targets = [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }];
    await cacheLogos(
      targets,
      new StubClient(
        new Map([["https://zavetisce.si", `<img class="logo" src="/logo.png">`]]),
        new Map([
          ["https://zavetisce.si/logo.png", { status: 200, body: await pngBytes() }],
        ]),
      ),
      options,
    );

    // Without the manifest every file on disk looks like an orphan, and a
    // shelter whose fetch fails this run would lose the copy it had.
    rmSync(manifestPath);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await cacheLogos(
      targets,
      new StubClient(new Map(), new Map()),
      options,
    );
    warn.mockRestore();

    expect(result.deleted).toBe(0);
    expect(readdirSync(logosDir())).toHaveLength(1);
  });

  it("keeps nothing when the source is not a processable image", async () => {
    const client = new StubClient(
      new Map([["https://zavetisce.si", `<img class="logo" src="/logo.ico">`]]),
      new Map([
        [
          "https://zavetisce.si/logo.ico",
          { status: 200, body: Buffer.from("not an image") },
        ],
      ]),
    );

    const result = await cacheLogos(
      [{ providerId: "zonzani", homeUrl: "https://zavetisce.si" }],
      client,
      { logosDir: logosDir(), manifestPath },
    );

    expect(result.fetched).toBe(0);
    expect(result.manifest.entries).toEqual({});
  });

  it("takes every shelter's logo at the same time, one request per shelter", async () => {
    const shelters = ["macjahisa.si", "muri.si", "zonzani.si"];
    const html = new Map<string, string>();
    const bytes = new Map<string, StubResponse>();
    for (const [index, host] of shelters.entries()) {
      html.set(`https://${host}`, `<img class="logo" src="/logo.png">`);
      bytes.set(`https://${host}/logo.png`, {
        status: 200,
        body: await pngBytes(64, `#${(index + 3) * 111111}`),
      });
    }
    const client = new ConcurrencyClient(html, bytes);

    const result = await cacheLogos(
      shelters.map((host, index) => ({
        providerId: `shelter-${index}`,
        homeUrl: `https://${host}`,
      })),
      client,
      { logosDir: logosDir(), manifestPath },
    );

    // Each shelter's home page and logo still go out one after the other
    // against its own server; only the wait for the other shelters is gone.
    expect(client.peak).toBe(shelters.length);
    expect(client.peakPerHost).toBe(1);
    for (const host of shelters) {
      expect(client.order.filter((url) => url.includes(host))).toEqual([
        `https://${host}`,
        `https://${host}/logo.png`,
      ]);
    }
    expect(result.fetched).toBe(shelters.length);
    expect(Object.keys(result.discovered)).toEqual([
      "shelter-0",
      "shelter-1",
      "shelter-2",
    ]);
  });
});
