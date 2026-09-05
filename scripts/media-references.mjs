const MEDIA_PREFIX = "/media/";
const MEDIA_PATH = /^(animals|share|shelter-logos)\/[A-Za-z0-9._-]+$/;
const IMAGE_RIGHTS = new Set([
  "unknown",
  "display-permitted",
  "cache-permitted",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSnapshot(dataset, shareManifest, logoManifest) {
  if (
    !isRecord(dataset) ||
    typeof dataset.generatedAt !== "string" ||
    Number.isNaN(Date.parse(dataset.generatedAt)) ||
    !Array.isArray(dataset.animals)
  ) {
    throw new Error("generated animals.json has an invalid dataset shape");
  }
  for (const animal of dataset.animals) {
    if (
      !isRecord(animal) ||
      typeof animal.id !== "string" ||
      animal.id.length === 0 ||
      !Array.isArray(animal.images)
    ) {
      throw new Error("generated animals.json has an invalid animal media shape");
    }
    for (const image of animal.images) {
      if (
        !isRecord(image) ||
        !IMAGE_RIGHTS.has(image.rights) ||
        (image.cachedUrl !== undefined && typeof image.cachedUrl !== "string") ||
        (image.avif !== undefined && typeof image.avif !== "boolean") ||
        (image.widths !== undefined &&
          (!Array.isArray(image.widths) ||
            image.widths.some(
              (width) => !Number.isInteger(width) || width <= 0,
            )))
      ) {
        throw new Error(
          `generated animals.json has invalid image media fields for ${animal.id}`,
        );
      }
    }
  }

  for (const [name, manifest] of [
    ["share-cards.json", shareManifest],
    ["shelter-logos.json", logoManifest],
  ]) {
    if (
      manifest !== undefined &&
      (!isRecord(manifest) || !isRecord(manifest.entries))
    ) {
      throw new Error(`generated ${name} has an invalid manifest shape`);
    }
  }
  for (const [id, entry] of Object.entries(shareManifest?.entries ?? {})) {
    if (
      !isRecord(entry) ||
      !Array.isArray(entry.files) ||
      entry.files.some((file) => typeof file !== "string")
    ) {
      throw new Error(`generated share-cards.json has an invalid entry for ${id}`);
    }
  }
  for (const [id, entry] of Object.entries(logoManifest?.entries ?? {})) {
    if (!isRecord(entry) || typeof entry.file !== "string") {
      throw new Error(`generated shelter-logos.json has an invalid entry for ${id}`);
    }
  }
}

/**
 * Derive the exact local files a generated snapshot may publish.
 *
 * The returned map keeps human-readable reasons because verify-media prints
 * them for missing files. Deployment consumes only its keys as an allowlist,
 * so an unreferenced file left in the local cache can never become public.
 */
export function collectMediaReferences(
  dataset,
  shareManifest = undefined,
  logoManifest = undefined,
) {
  validateSnapshot(dataset, shareManifest, logoManifest);
  const referenced = new Map();

  function reference(url, why) {
    if (typeof url !== "string") {
      throw new Error(
        `generated media reference is not a string: ${String(url)}`,
      );
    }
    if (!url.startsWith(MEDIA_PREFIX)) {
      // A full URL is served by its source host, not by this media directory.
      return;
    }
    const relative = url.slice(MEDIA_PREFIX.length);
    if (!MEDIA_PATH.test(relative)) {
      throw new Error(
        `unsafe or unsupported local media path in generated data: ${url}`,
      );
    }
    const reasons = referenced.get(relative);
    if (reasons) reasons.add(why);
    else referenced.set(relative, new Set([why]));
  }

  let photos = 0;
  for (const animal of dataset.animals) {
    for (const image of animal.images) {
      if (image.rights !== "cache-permitted" || !image.cachedUrl) continue;
      photos += 1;
      const cached = image.cachedUrl;
      reference(cached, `${animal.id} photo`);
      reference(cached.replace(/\.webp$/, ".thumb.webp"), `${animal.id} thumb`);

      const widths = image.widths ?? [];
      for (const width of widths.slice(0, -1)) {
        reference(
          cached.replace(/\.webp$/, `-${width}.webp`),
          `${animal.id} ${width}w rung`,
        );
      }
      if (image.avif) {
        reference(cached.replace(/\.webp$/, ".avif"), `${animal.id} hero avif`);
      }
    }
  }

  for (const [id, entry] of Object.entries(shareManifest?.entries ?? {})) {
    for (const file of entry.files) {
      reference(`/media/share/${file}`, `${id} share card`);
    }
  }

  for (const [id, entry] of Object.entries(logoManifest?.entries ?? {})) {
    reference(`/media/shelter-logos/${entry.file}`, `${id} logo`);
  }

  return {
    referenced,
    photos,
    shareCards: Object.keys(shareManifest?.entries ?? {}).length,
    shelterLogos: Object.keys(logoManifest?.entries ?? {}).length,
  };
}
