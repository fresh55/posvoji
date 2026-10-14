"use client";

import { preload } from "react-dom";
import { photoAvifUrl, photoSrcSet, type PermittedPhoto } from "@/lib/animal-images";

/** The exported gallery starts on its first photo. Export cannot know a
 *  shared link's ?foto=N query: hydration may select another photo, and this
 *  first-photo hint can compete with that later request. */
export function AnimalPhotoPreload({ photo, sizes }: {
  photo: PermittedPhoto | undefined;
  sizes: string;
}) {
  if (!photo) return null;
  const avif = photoAvifUrl(photo);
  const srcSet = avif ? undefined : photoSrcSet(photo);
  // Match the picture's first supported source. Hinting both formats would
  // download a WebP that an AVIF-capable browser never draws.
  preload(avif ?? photo.src, {
    as: "image",
    type: avif ? "image/avif" : undefined,
    fetchPriority: "high",
    imageSrcSet: srcSet,
    imageSizes: srcSet ? sizes : undefined,
  });
  return null;
}
