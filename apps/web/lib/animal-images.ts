import type { Animal } from "@posvoji/schema";

// Where ingest writes the copies it is allowed to keep. A URL outside this
// directory is the shelter's own file, and none of the siblings below exist
// for it.
const CACHE_PREFIX = "/media/animals/";

/** One image a surface may actually draw, with whatever ingest derived from
 *  it. Every optional field is absent for a photo we only link to, and for a
 *  cached photo that predates the derivation pass, so a caller that reads them
 *  has to have a single-file fallback. */
export type PermittedPhoto = {
  /** What an <img src> points at: our cached copy where there is one. */
  src: string;
  width?: number;
  height?: number;
  /** Ascending, ending with `src`'s own width. */
  widths?: number[];
  /** An `.avif` sibling of `src` exists, at `src`'s own width and no other. */
  avif?: boolean;
  blurDataURL?: string;
};

// Images without explicit display permission stay on the shelter's own site.
// Cacheable images prefer our local, resized copy when ingest has produced one.
export function permittedPhotos(images: Animal["images"]): PermittedPhoto[] {
  return images.flatMap((image) => {
    if (image.rights === "cache-permitted") {
      // The derived fields describe our own copy. A cache that failed leaves
      // the shelter's file hotlinked, and none of them apply to it.
      if (!image.cachedUrl) return [{ src: image.sourceUrl }];
      return [
        {
          src: image.cachedUrl,
          width: image.width,
          height: image.height,
          widths: image.widths,
          avif: image.avif,
          blurDataURL: image.blurDataURL,
        },
      ];
    }
    if (image.rights === "display-permitted") return [{ src: image.sourceUrl }];
    return [];
  });
}

/** The same list as URLs, for callers that only count photos or name one. */
export function permittedImageUrls(images: Animal["images"]): string[] {
  return permittedPhotos(images).map((photo) => photo.src);
}

function isCachedCopy(src: string): boolean {
  return src.startsWith(CACHE_PREFIX) && src.endsWith(".webp");
}

/** A rung is a plain sibling of the cached copy: "<hash>-480.webp". */
function rungUrl(src: string, width: number): string {
  return src.replace(/\.webp$/, `-${width}.webp`);
}

/** The candidates a browser may pick between, or nothing when there is only
 *  one file to serve.
 *
 *  Driven entirely by `widths`, so every URL in the result is one ingest wrote:
 *  the last entry is the cached copy itself and every earlier one has a rung
 *  file on disk. Nothing here guesses a width, which is what keeps the srcset
 *  from pointing at a 404. */
export function photoSrcSet(photo: PermittedPhoto): string | undefined {
  const widths = photo.widths;
  // One rung is the cached copy alone, and a srcset with a single candidate
  // says nothing an src does not.
  if (!widths || widths.length < 2 || !isCachedCopy(photo.src)) return undefined;
  const last = widths.length - 1;
  return widths
    .map((width, i) => `${i === last ? photo.src : rungUrl(photo.src, width)} ${width}w`)
    .join(", ");
}

/** The AVIF sibling, which ingest only derives for an animal's first photo. */
export function photoAvifUrl(photo: PermittedPhoto): string | undefined {
  if (!photo.avif || !isCachedCopy(photo.src)) return undefined;
  return photo.src.replace(/\.webp$/, ".avif");
}

// The ingest cache writes a small sibling next to every cached derivative
// ("<hash>.webp" gets "<hash>.thumb.webp"), sized for the 56px thumb strip.
// Only our own cached copies have one; any other URL passes through unchanged.
export function thumbnailUrl(url: string): string {
  if (!url.startsWith("/media/animals/") || url.endsWith(".thumb.webp")) {
    return url;
  }
  return url.replace(/\.webp$/, ".thumb.webp");
}

/** How many position dots a gallery draws at most. A fourteen-photo animal
 *  would otherwise get a ruler across its picture. */
export const MAX_PHOTO_DOTS = 5;

/** Which slice of a gallery's dots to draw, as [start, count]. The active dot
 *  sits in the middle of the window until the window hits either end, where it
 *  stops moving and the active dot travels the rest of the way itself.
 *
 *  Extracted from the JSX it is drawn in because it is off-by-one-prone
 *  arithmetic with two numbers that have to agree (the cap, and the half of it
 *  that centres the window), and a dot row that quietly stops tracking is not
 *  something a rendering test would notice. */
export function photoDotWindow(
  total: number,
  index: number,
): { start: number; count: number } {
  const count = Math.min(total, MAX_PHOTO_DOTS);
  const middle = Math.floor(MAX_PHOTO_DOTS / 2);
  const start = Math.min(Math.max(index - middle, 0), Math.max(total - count, 0));
  return { start, count };
}

/** The photos either side of `index`, wrapping, without repeating one. Generic
 *  because the gallery holds whole photos now and a two-photo gallery's
 *  neighbours are then the same object twice, which a Set still folds. */
export function adjacentImages<T>(images: readonly T[], index: number): T[] {
  if (images.length < 2) return [];

  const neighbours = [
    images[(index - 1 + images.length) % images.length],
    images[(index + 1) % images.length],
  ].filter((image) => image !== undefined) as T[];
  return [...new Set(neighbours)];
}
