import sharp from "sharp";

// How good a cached photo looks, as one number, so an animal's own photos can
// be put in an order rather than left in the one its listing page emitted.
// Nothing here compares photos of different animals: the score only ever
// decides which of Luna's four photos leads Luna's card.
//
// Recorded on every manifest entry and only recomputed when this version
// moves, the same backfill shape DERIVATIVE_VERSION has in cache-images.ts.
// It is deliberately a second version rather than part of that one: bumping
// DERIVATIVE_VERSION re-cuts every thumb, rung, placeholder and avif in the
// cache, which is thousands of encodes, and a changed weight down here has to
// re-read the masters without re-encoding a single file.
//
// v1 = laplacian sharpness over a 256px grey copy, gaussian exposure term.
export const QUALITY_VERSION = 1;

// Both terms are measured on a small grey copy of the master. 256px keeps the
// edge detail a card actually shows and costs a decode rather than an encode.
// Never enlarged: a photo the shelter published at 200px is measured at 200px
// instead of being upscaled into blur it does not have.
const SCORE_WIDTH = 256;

// A variance of 5000 is the top of the sharpness range, and anything above it
// is capped. Measured over all 1777 cached masters: p5 134, p25 274, median
// 472, p75 998, p95 3537, highest 9096. 5000 leaves the spread the ordering
// actually works in across the middle of the range and saturates only the
// sharpest couple of percent, where the difference stopped being visible on a
// 400px card anyway. 1000 was tried first and flattened the top quarter into
// one value.
const SHARPNESS_FULL_SCALE = Math.log10(1 + 5000);
// Mean luminance the exposure term is happiest at, and how fast it falls away
// from it. Mid grey with a wide sigma: 0.35 to 0.65 is barely touched, a dark
// cage shot at 0.2 keeps about a quarter of the term, a blown-out white wall
// at 0.8 the same.
const EXPOSURE_TARGET = 0.5;
const EXPOSURE_SIGMA = 0.18;
// Sharpness is what separates a usable card photo from an unusable one.
// Exposure only breaks ties between photos that are both in focus, so it
// carries the smaller weight.
const SHARPNESS_WEIGHT = 0.75;
const EXPOSURE_WEIGHT = 0.25;

// Variance of the 3x3 laplacian ([0 -1 0; -1 4 -1; 0 -1 0]) over the interior
// pixels. A photo in focus has edges everywhere and a wide spread of
// responses; a blurry one flattens them towards zero. Exported for the tests.
export function laplacianVariance(
  pixels: Uint8Array,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumOfSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const response =
        4 * pixels[i]! -
        pixels[i - 1]! -
        pixels[i + 1]! -
        pixels[i - width]! -
        pixels[i + width]!;
      sum += response;
      sumOfSquares += response * response;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  // Non-negative by definition; floating point can still land a hair under.
  return Math.max(0, sumOfSquares / count - mean * mean);
}

function meanOf(pixels: Uint8Array): number {
  if (pixels.length === 0) return 0;
  let sum = 0;
  for (const value of pixels) sum += value;
  return sum / pixels.length;
}

// The score, given the grey pixels of the scaled copy. Split out from the
// decode so the weights can be tested without a file.
//
//   sharpness = log10(1 + laplacian variance) / log10(1 + 5000), capped at 1
//   exposure  = exp(-(mean/255 - 0.5)^2 / (2 * 0.18^2))
//   score     = 0.75 * sharpness + 0.25 * exposure
//
// The log is what makes the sharpness term usable. The raw variance runs from
// single digits on a soft snap to four figures on a crisp portrait, so a
// linear term would put one photo at the top and every other one at zero.
//
// Both terms come off a copy scaled to a fixed width, so a 2000px original
// and a 600px one are measured the same way and nothing here favours the
// larger file.
export function scoreGreyPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
): number {
  const sharpness = Math.min(
    1,
    Math.log10(1 + laplacianVariance(pixels, width, height)) /
      SHARPNESS_FULL_SCALE,
  );
  const offset = meanOf(pixels) / 255 - EXPOSURE_TARGET;
  const exposure = Math.exp(
    -(offset * offset) / (2 * EXPOSURE_SIGMA * EXPOSURE_SIGMA),
  );
  const score = SHARPNESS_WEIGHT * sharpness + EXPOSURE_WEIGHT * exposure;
  // Four decimals is finer than anything the ordering can act on and keeps
  // the manifest from carrying seventeen digits per entry.
  return Math.round(score * 10_000) / 10_000;
}

// One cached master's score. Throws whatever sharp throws on a file it cannot
// decode; the caller decides what an unreadable master means.
export async function scoreImage(master: Buffer): Promise<number> {
  const { data, info } = await sharp(master)
    .greyscale()
    .resize({ width: SCORE_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // greyscale() usually leaves one channel, but a master with an alpha band
  // comes back with two, so read the first band of each pixel rather than
  // trusting the buffer to be one byte per pixel.
  const pixels =
    info.channels === 1
      ? new Uint8Array(data.buffer, data.byteOffset, data.length)
      : Uint8Array.from({ length: info.width * info.height }, (_, i) =>
          data.readUInt8(i * info.channels),
        );
  return scoreGreyPixels(pixels, info.width, info.height);
}
