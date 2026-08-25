import type { Animal } from "@posvoji/schema";

// Images without explicit display permission stay on the shelter's own site.
// Cacheable images prefer our local, resized copy when ingest has produced one.
export function permittedImageUrls(images: Animal["images"]): string[] {
  return images.flatMap((image) => {
    if (image.rights === "cache-permitted") {
      return [image.cachedUrl ?? image.sourceUrl];
    }
    if (image.rights === "display-permitted") return [image.sourceUrl];
    return [];
  });
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

export function adjacentImageUrls(
  images: readonly string[],
  index: number,
): string[] {
  if (images.length < 2) return [];

  return [
    ...new Set([
      images[(index - 1 + images.length) % images.length],
      images[(index + 1) % images.length],
    ]),
  ].filter((source): source is string => source !== undefined);
}
