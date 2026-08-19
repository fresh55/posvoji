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
