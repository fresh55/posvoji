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
