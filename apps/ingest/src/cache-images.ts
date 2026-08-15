import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
} from "@posvoji/provider-sdk";
import type { Animal, ImagePolicy } from "@posvoji/schema";
import { cachedImagesDir, imageCacheManifestPath } from "./paths";

// Where the static site serves the files written to cachedImagesDir.
const PUBLIC_PREFIX = "/media/animals";

// Cards render at ~400 CSS pixels; 800 covers 2x displays. Larger originals
// stay at the shelter behind the source link.
const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const ACCEPT_IMAGES = "image/avif,image/webp,image/*,*/*;q=0.8";

// Shelter photo URLs are versioned per listing, so a cached copy is reused
// without any request until it is this old; then a conditional GET checks it.
// Keeps a 1000-image crawl from spending hours on 304s at polite pacing.
const REVALIDATE_AFTER_DAYS = 7;

export interface CachedImageEntry {
  // Content-addressed by the processed bytes, so a re-encode or a changed
  // source photo gets a new name and stale copies are simply deleted.
  file: string;
  width: number;
  height: number;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
}

export interface ImageCacheManifest {
  entries: Record<string, CachedImageEntry>;
}

// The slice of PoliteClient the cache needs; tests substitute a stub.
export interface BytesClient {
  getBytes(url: string, options?: GetBytesOptions): Promise<PoliteBytesResponse>;
}

export function publicUrlFor(file: string): string {
  return `${PUBLIC_PREFIX}/${file}`;
}

// Only providers whose policy grants caching, and within them only images
// the provider marked cache-permitted. The policy map is the authority; the
// per-image rights field must agree (defense in depth against a provider
// that mislabels its images).
export function cacheableUrls(
  animals: Animal[],
  imagePolicies: Map<string, ImagePolicy>,
): string[] {
  const urls = new Set<string>();
  for (const animal of animals) {
    if (imagePolicies.get(animal.source.providerId) !== "cache-permitted") {
      continue;
    }
    for (const image of animal.images) {
      if (image.rights === "cache-permitted") urls.add(image.sourceUrl);
    }
  }
  return [...urls];
}

export function withCachedUrls(
  animals: Animal[],
  manifest: ImageCacheManifest,
): Animal[] {
  return animals.map((animal) => ({
    ...animal,
    images: animal.images.map((image) => {
      const entry =
        image.rights === "cache-permitted"
          ? manifest.entries[image.sourceUrl]
          : undefined;
      if (!entry) return image;
      return { ...image, cachedUrl: publicUrlFor(entry.file) };
    }),
  }));
}

export async function processImage(source: Buffer): Promise<{
  file: string;
  data: Buffer;
  width: number;
  height: number;
}> {
  const { data, info } = await sharp(source)
    .rotate() // apply EXIF orientation before it is stripped
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  return { file: `${hash}.webp`, data, width: info.width, height: info.height };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readManifest(path: string): ImageCacheManifest {
  if (!existsSync(path)) return { entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed.entries === "object" && parsed.entries) {
      return { entries: parsed.entries };
    }
  } catch {
    // A broken manifest just means a full re-fetch.
  }
  return { entries: {} };
}

export interface CacheImagesResult {
  animals: Animal[];
  fetched: number;
  reused: number;
  deleted: number;
}

export interface CacheImagesOptions {
  mediaDir?: string;
  manifestPath?: string;
  revalidateAfterDays?: number;
}

// The removal path is the sync itself: an image that is no longer referenced
// by any cache-permitted animal — or whose source now answers 404/410 — has
// its file deleted on the next run.
export async function cacheImages(
  animals: Animal[],
  client: BytesClient,
  imagePolicies: Map<string, ImagePolicy>,
  options: CacheImagesOptions = {},
): Promise<CacheImagesResult> {
  const mediaDir = options.mediaDir ?? cachedImagesDir;
  const manifestPath = options.manifestPath ?? imageCacheManifestPath;
  const revalidateAfterMs =
    (options.revalidateAfterDays ?? REVALIDATE_AFTER_DAYS) * 24 * 60 * 60_000;

  const previous = readManifest(manifestPath);
  const next: ImageCacheManifest = { entries: {} };
  mkdirSync(mediaDir, { recursive: true });

  let fetched = 0;
  let reused = 0;

  for (const url of cacheableUrls(animals, imagePolicies)) {
    const prev = previous.entries[url];
    const prevUsable =
      prev !== undefined && existsSync(join(mediaDir, prev.file));

    if (
      prevUsable &&
      Date.now() - Date.parse(prev.fetchedAt) < revalidateAfterMs
    ) {
      next.entries[url] = prev;
      reused++;
      continue;
    }

    let res: PoliteBytesResponse;
    try {
      res = await client.getBytes(url, {
        accept: ACCEPT_IMAGES,
        validators: prevUsable
          ? { etag: prev.etag, lastModified: prev.lastModified }
          : undefined,
      });
    } catch (error) {
      // Network trouble or robots.txt: keep what we have, cache nothing new.
      if (prevUsable) next.entries[url] = prev;
      console.warn(`image ${url}: fetch failed (${error})`);
      continue;
    }

    if (res.notModified && prevUsable) {
      next.entries[url] = prev;
      reused++;
      continue;
    }

    if (res.status === 404 || res.status === 410) {
      // The shelter removed the source photo; our copy goes with it.
      continue;
    }

    if (res.status !== 200 || res.body === null) {
      if (prevUsable) next.entries[url] = prev;
      console.warn(`image ${url}: HTTP ${res.status}, not cached`);
      continue;
    }

    if (res.body.length > MAX_SOURCE_BYTES) {
      if (prevUsable) next.entries[url] = prev;
      console.warn(`image ${url}: ${res.body.length} bytes exceeds cap`);
      continue;
    }

    let processed;
    try {
      processed = await processImage(res.body);
    } catch (error) {
      if (prevUsable) next.entries[url] = prev;
      console.warn(`image ${url}: not a processable image (${error})`);
      continue;
    }

    const target = join(mediaDir, processed.file);
    if (!existsSync(target)) writeFileSync(target, processed.data);
    next.entries[url] = {
      file: processed.file,
      width: processed.width,
      height: processed.height,
      etag: headerValue(res.headers["etag"]),
      lastModified: headerValue(res.headers["last-modified"]),
      fetchedAt: new Date().toISOString(),
    };
    fetched++;
  }

  // Content addressing can share one file between URLs, so deletion goes by
  // "no longer referenced", not by "my URL was dropped". Sweeping the whole
  // directory also clears orphans left by a lost manifest.
  const referenced = new Set(
    Object.values(next.entries).map((entry) => entry.file),
  );
  let deleted = 0;
  for (const file of readdirSync(mediaDir)) {
    if (referenced.has(file)) continue;
    rmSync(join(mediaDir, file));
    deleted++;
  }

  writeFileSync(manifestPath, JSON.stringify(next, null, 2));

  return { animals: withCachedUrls(animals, next), fetched, reused, deleted };
}
