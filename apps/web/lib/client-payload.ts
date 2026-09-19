import { createHash } from "node:crypto";
import { permittedPhotos } from "@/lib/animal-images";
import type { Animal } from "@posvoji/schema";

/** Content-addressed URLs cannot mix a cached page with a newer dataset. */
export function clientPayload(kind: string, value: unknown) {
  const json = JSON.stringify(value);
  const hash = createHash("sha256").update(json).digest("hex").slice(0, 24);
  return { url: `/generated/${kind}-${hash}.json`, json };
}

export function galleryPayload(animal: Pick<Animal, "images">) {
  const photos = permittedPhotos(animal.images).map((photo) => {
    const clean = { ...photo };
    delete clean.blurDataURL;
    return clean;
  });
  return { ...clientPayload("photos", photos), count: photos.length };
}
