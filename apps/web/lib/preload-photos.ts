import { photoSrcSet, type PermittedPhoto } from "@/lib/animal-images";

/**
 * Warms the browser cache for photos a gesture is about to bring into view.
 *
 * Client only: it builds Image elements, so it has to run where there is a
 * document. Both callers are client components (the card gallery's neighbours,
 * the dialog fan's next tier), and each owns the `seen` set, so a photo is
 * only ever asked for once per surface.
 */
export function preloadPhotos(
  photos: readonly PermittedPhoto[],
  sizes: string,
  seen: Set<string>,
) {
  for (const photo of photos) {
    if (seen.has(photo.src)) continue;
    seen.add(photo.src);
    const preload = new window.Image();
    // The visitor has not asked for these yet, so they must not compete with
    // the photo they are actually looking at.
    preload.fetchPriority = "low";
    preload.decoding = "async";
    // The same ladder and the same sizes the rendered photo carries, set
    // before src so the browser runs its own selection over them. That is what
    // makes the preload fetch the rung this layout would pick rather than the
    // largest file at every width, and it means the fetch the visitor then
    // triggers is a cache hit rather than a second, different file.
    const srcSet = photoSrcSet(photo);
    if (srcSet) {
      preload.sizes = sizes;
      preload.srcset = srcSet;
    }
    preload.src = photo.src;
  }
}
