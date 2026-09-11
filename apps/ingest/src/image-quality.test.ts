import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  laplacianVariance,
  scoreGreyPixels,
  scoreImage,
} from "./image-quality";

function grey(width: number, height: number, at: (x: number, y: number) => number) {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels[y * width + x] = at(x, y);
  }
  return pixels;
}

// A block pattern rather than a single-pixel checkerboard: it survives the
// downscale to 256px, which is where the score is actually taken.
async function blocksPng(width = 800, height = 600, block = 40): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value =
        (Math.floor(x / block) + Math.floor(y / block)) % 2 === 0 ? 220 : 40;
      const i = (y * width + x) * channels;
      raw[i] = value;
      raw[i + 1] = value;
      raw[i + 2] = value;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

describe("laplacianVariance", () => {
  it("is zero on a flat field", () => {
    expect(laplacianVariance(grey(16, 16, () => 128), 16, 16)).toBe(0);
  });

  it("is zero on a linear gradient, which has no edges", () => {
    // The 3x3 laplacian is a second derivative, so a ramp cancels out.
    const variance = laplacianVariance(grey(16, 16, (x) => x * 8), 16, 16);
    expect(variance).toBeCloseTo(0, 6);
  });

  it("rises with the number of edges", () => {
    const few = laplacianVariance(
      grey(32, 32, (x) => (x < 16 ? 40 : 220)),
      32,
      32,
    );
    const many = laplacianVariance(
      grey(32, 32, (x, y) => ((x + y) % 2 === 0 ? 40 : 220)),
      32,
      32,
    );
    expect(few).toBeGreaterThan(0);
    expect(many).toBeGreaterThan(few);
  });

  it("has no interior to measure below 3px", () => {
    expect(laplacianVariance(grey(2, 2, () => 128), 2, 2)).toBe(0);
  });
});

describe("scoreGreyPixels", () => {
  it("gives a flat mid-grey field the exposure term alone", () => {
    // No edges at all, and the mean sits on the exposure target, so what is
    // left is the exposure weight.
    const score = scoreGreyPixels(grey(32, 32, () => 128), 32, 32);
    expect(score).toBeCloseTo(0.25, 3);
  });

  it("penalises a dark frame and a blown-out one alike", () => {
    const mid = scoreGreyPixels(grey(32, 32, () => 128), 32, 32);
    const dark = scoreGreyPixels(grey(32, 32, () => 20), 32, 32);
    const blown = scoreGreyPixels(grey(32, 32, () => 248), 32, 32);
    expect(mid).toBeCloseTo(0.25, 2);
    expect(dark).toBeLessThan(mid / 2);
    expect(blown).toBeLessThan(mid / 2);
  });

  it("puts detail above flatness at the same exposure", () => {
    const flat = scoreGreyPixels(grey(64, 64, () => 130), 64, 64);
    const detailed = scoreGreyPixels(
      grey(64, 64, (x, y) => (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 40 : 220),
      64,
      64,
    );
    expect(detailed).toBeGreaterThan(flat);
  });

  it("stays inside 0 and 1 however hard the edges are", () => {
    const extreme = scoreGreyPixels(
      grey(64, 64, (x, y) => ((x + y) % 2 === 0 ? 0 : 255)),
      64,
      64,
    );
    expect(extreme).toBeGreaterThan(0.9);
    expect(extreme).toBeLessThanOrEqual(1);
  });
});

describe("scoreImage", () => {
  it("scores the same bytes the same way every time", async () => {
    const bytes = await blocksPng();
    expect(await scoreImage(bytes)).toBe(await scoreImage(bytes));
  });

  it("scores a photo above a blurred copy of itself", async () => {
    const sharpPhoto = await blocksPng();
    const blurred = await sharp(sharpPhoto).blur(8).png().toBuffer();
    expect(await scoreImage(sharpPhoto)).toBeGreaterThan(
      await scoreImage(blurred),
    );
  });

  it("does not reward the larger file", async () => {
    // The same pattern at two sizes. Measuring a fixed-width copy is what
    // keeps a 1600px photo from beating a 400px one on size alone.
    const large = await scoreImage(await blocksPng(1600, 1200, 80));
    const small = await scoreImage(await blocksPng(400, 300, 20));
    expect(Math.abs(large - small)).toBeLessThan(0.1);
  });

  it("scores a dark photo below the same photo at a usable exposure", async () => {
    const bright = await blocksPng();
    const dark = await sharp(bright).linear(0.25, 0).png().toBuffer();
    expect(await scoreImage(bright)).toBeGreaterThan(await scoreImage(dark));
  });
});
