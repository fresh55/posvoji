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
import type { Animal, AnimalImage, ImagePolicy } from "@posvoji/schema";
import { cachedImagesDir, imageCacheManifestPath } from "./paths";

// Where the static site serves the files written to cachedImagesDir.
const PUBLIC_PREFIX = "/media/animals";

// Cards render at ~400 CSS pixels; 800 covers 2x displays. Larger originals
// stay at the shelter behind the source link.
const MAX_WIDTH = 800;
// The dialog's thumb strip renders at 56 CSS pixels; 112 covers 2x displays.
const THUMB_WIDTH = 112;
const WEBP_QUALITY = 80;
// Smaller copies of the cached photo, for viewports that would otherwise pay
// for the full 800px file. The cached copy stays the largest rung; a rung at
// or above its width is skipped rather than enlarged.
const LADDER_WIDTHS = [320, 480, 640];
// The placeholder is decoded from a data URL inside animals.json, so it has
// to stay small enough to be cheaper than the request it replaces. 10px wide
// at this quality lands in the low hundreds of bytes.
const BLUR_WIDTH = 10;
const BLUR_QUALITY = 20;
// sharp's AVIF quality scale sits lower than its WebP one for the same
// perceived result. 55 matches WebP q80 closely while staying smaller.
const AVIF_QUALITY = 55;
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
  // Widths that exist on disk for this file, ascending, ending with the
  // cached copy's own width. Absent on entries written before the ladder
  // existed; the derivation pass fills them in without a request.
  widths?: number[];
  // The inline placeholder lives in the manifest rather than on disk: it
  // ships inside animals.json, so it is never a file anybody requests.
  blurDataURL?: string;
  // An <hash>.avif sibling of the cached copy exists. Only an animal's first
  // image gets one.
  avif?: boolean;
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

// Every cached file gets a small sibling under this name. The web app derives
// the thumb URL from cachedUrl by the same pattern, so the Animal schema does
// not need a field for it.
export function thumbFileFor(file: string): string {
  return file.replace(/\.webp$/, ".thumb.webp");
}

// Same idea as the thumb: a rung is a plain sibling of the cached copy, so
// the web app can build its srcset from cachedUrl and the widths list.
export function rungFileFor(file: string, width: number): string {
  return file.replace(/\.webp$/, `-${width}.webp`);
}

export function avifFileFor(file: string): string {
  return file.replace(/\.webp$/, ".avif");
}

// The first image is what a card and the top of a detail page show, so it is
// the one worth the extra AVIF encode. A photo shared by several animals is
// a hero as soon as it leads one of them.
export function heroSourceUrls(animals: Animal[]): Set<string> {
  const urls = new Set<string>();
  for (const animal of animals) {
    const first = animal.images[0];
    if (first) urls.add(first.sourceUrl);
  }
  return urls;
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
      const cached: AnimalImage = {
        ...image,
        cachedUrl: publicUrlFor(entry.file),
        width: entry.width,
        height: entry.height,
      };
      // The derived fields are only set when the derivation actually
      // produced them, so a failed encode leaves the field off rather than
      // promising a file that is not there.
      if (entry.widths && entry.widths.length > 0) cached.widths = entry.widths;
      if (entry.blurDataURL) cached.blurDataURL = entry.blurDataURL;
      if (entry.avif) cached.avif = true;
      return cached;
    }),
  }));
}

export interface HotlinkedImage {
  providerId: string;
  animalId: string;
  sourceUrl: string;
}

// A cache-permitted image with no cachedUrl means the cache attempt failed
// (source gone, too large, unreadable) and animal-images.ts's fallback is
// quietly hotlinking the shelter instead. That should never outlive one run,
// so it is worth naming instead of hiding inside the fetched/reused/deleted
// counts.
export function hotlinkedCachePermittedImages(
  animals: Animal[],
): HotlinkedImage[] {
  const found: HotlinkedImage[] = [];
  for (const animal of animals) {
    for (const image of animal.images) {
      if (image.rights === "cache-permitted" && !image.cachedUrl) {
        found.push({
          providerId: animal.source.providerId,
          animalId: animal.id,
          sourceUrl: image.sourceUrl,
        });
      }
    }
  }
  return found;
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

export interface DerivedCounts {
  thumbs: number;
  rungs: number;
  blurs: number;
  avifs: number;
}

// Every derivative is cut from our own cached copy, so an entry reused from
// an older manifest gains one without another request to the shelter. Only
// cache-permitted images ever reach the manifest, so the rights check is
// already behind us. The pass is a backfill: a file already on disk, or a
// placeholder already in the manifest, is left as it is.
export async function deriveVariants(
  manifest: ImageCacheManifest,
  heroes: ReadonlySet<string>,
  mediaDir: string,
): Promise<DerivedCounts> {
  const counts: DerivedCounts = { thumbs: 0, rungs: 0, blurs: 0, avifs: 0 };

  // Content addressing lets several URLs share one file, so the work is
  // grouped by file: one encode, and every entry pointing at it records the
  // same result.
  const groups = new Map<
    string,
    { entries: CachedImageEntry[]; hero: boolean }
  >();
  for (const [url, entry] of Object.entries(manifest.entries)) {
    const group = groups.get(entry.file) ?? { entries: [], hero: false };
    group.entries.push(entry);
    if (heroes.has(url)) group.hero = true;
    groups.set(entry.file, group);
  }

  for (const [file, group] of groups) {
    const sourcePath = join(mediaDir, file);
    if (!existsSync(sourcePath)) continue;
    const width = group.entries[0]!.width;
    // Read once, and only if this file is actually missing something.
    let source: Buffer | undefined;
    const read = (): Buffer => (source ??= readFileSync(sourcePath));

    const thumbPath = join(mediaDir, thumbFileFor(file));
    if (!existsSync(thumbPath)) {
      try {
        const thumb = await sharp(read())
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        writeFileSync(thumbPath, thumb);
        counts.thumbs++;
      } catch (error) {
        console.warn(`image ${file}: thumbnail failed (${error})`);
      }
    }

    const widths: number[] = [];
    for (const rung of LADDER_WIDTHS) {
      // Never enlarge: a photo the shelter published small has fewer rungs,
      // and the cached copy remains the largest one.
      if (rung >= width) continue;
      const rungPath = join(mediaDir, rungFileFor(file, rung));
      if (existsSync(rungPath)) {
        widths.push(rung);
        continue;
      }
      try {
        const resized = await sharp(read())
          .resize({ width: rung })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        writeFileSync(rungPath, resized);
        widths.push(rung);
        counts.rungs++;
      } catch (error) {
        console.warn(`image ${file}: ${rung}px rung failed (${error})`);
      }
    }
    widths.push(width);

    let blurDataURL = group.entries.find((e) => e.blurDataURL)?.blurDataURL;
    if (!blurDataURL) {
      try {
        const blur = await sharp(read())
          .resize({ width: BLUR_WIDTH })
          .webp({ quality: BLUR_QUALITY })
          .toBuffer();
        blurDataURL = `data:image/webp;base64,${blur.toString("base64")}`;
        counts.blurs++;
      } catch (error) {
        console.warn(`image ${file}: blur placeholder failed (${error})`);
      }
    }

    let avif = group.hero;
    if (avif && !existsSync(join(mediaDir, avifFileFor(file)))) {
      try {
        const encoded = await sharp(read())
          .avif({ quality: AVIF_QUALITY })
          .toBuffer();
        writeFileSync(join(mediaDir, avifFileFor(file)), encoded);
        counts.avifs++;
      } catch (error) {
        console.warn(`image ${file}: avif failed (${error})`);
        avif = false;
      }
    }

    for (const entry of group.entries) {
      entry.widths = widths;
      if (blurDataURL) entry.blurDataURL = blurDataURL;
      // A photo that no longer leads any animal drops the flag here and the
      // file in the deletion sweep.
      if (avif) entry.avif = true;
      else delete entry.avif;
    }
  }

  return counts;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readImageCacheManifest(path: string): ImageCacheManifest {
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
  derived: DerivedCounts;
}

export interface CacheImagesOptions {
  mediaDir?: string;
  manifestPath?: string;
  revalidateAfterDays?: number;
  // Restricts which providers' photos this run will actually request. Every
  // other cache-permitted image keeps its manifest entry, its file and its
  // cachedUrl without a single request, so a targeted export can cache one
  // shelter's photos without revalidating hundreds of unrelated ones. Left
  // unset, every provider is in scope.
  refreshProviderIds?: ReadonlySet<string>;
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

  const previous = readImageCacheManifest(manifestPath);
  const next: ImageCacheManifest = { entries: {} };
  mkdirSync(mediaDir, { recursive: true });

  // Scoped runs still walk every cache-permitted URL, because the deletion
  // sweep below reads next.entries as the full list of what is still wanted.
  // Out-of-scope URLs are carried over from the previous manifest instead of
  // being requested again.
  const scope = options.refreshProviderIds;
  const inScope =
    scope === undefined
      ? undefined
      : new Set(
          cacheableUrls(
            animals.filter((a) => scope.has(a.source.providerId)),
            imagePolicies,
          ),
        );

  let fetched = 0;
  let reused = 0;

  for (const url of cacheableUrls(animals, imagePolicies)) {
    const prev = previous.entries[url];
    const prevUsable =
      prev !== undefined && existsSync(join(mediaDir, prev.file));

    if (inScope && !inScope.has(url)) {
      if (prevUsable) next.entries[url] = prev;
      continue;
    }

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

  // Thumbs, rungs, placeholders and the hero AVIF are all cut from our own
  // processed copies, without a single request.
  const derived = await deriveVariants(
    next,
    heroSourceUrls(animals),
    mediaDir,
  );

  // Content addressing can share one file between URLs, so deletion goes by
  // "no longer referenced", not by "my URL was dropped". Sweeping the whole
  // directory also clears orphans left by a lost manifest.
  const referenced = new Set(
    Object.values(next.entries).flatMap((entry) => [
      entry.file,
      thumbFileFor(entry.file),
      // The largest rung is the cached copy itself, already listed above.
      ...(entry.widths ?? [])
        .filter((width) => width !== entry.width)
        .map((width) => rungFileFor(entry.file, width)),
      ...(entry.avif ? [avifFileFor(entry.file)] : []),
    ]),
  );
  let deleted = 0;
  for (const file of readdirSync(mediaDir)) {
    if (referenced.has(file)) continue;
    rmSync(join(mediaDir, file));
    deleted++;
  }

  writeFileSync(manifestPath, JSON.stringify(next, null, 2));

  return {
    animals: withCachedUrls(animals, next),
    fetched,
    reused,
    deleted,
    derived,
  };
}
