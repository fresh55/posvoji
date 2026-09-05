import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
} from "@posvoji/provider-sdk";
import type { Animal, AnimalImage, ImagePolicy } from "@posvoji/schema";
import { mapByHost } from "./by-host";
import { cachedImagesDir, imageCacheManifestPath } from "./paths";
import { writeFileAtomic } from "./write-atomic";
import { writeContentAddressed } from "./write-content-addressed";

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
// Encoder effort buys smaller files at the same quality, and costs only batch
// time nobody waits on. Measured over 10 cached masters: webp effort 6 lands
// 5.9% under sharp's default 4 for 63% more encode time, and avif effort 6
// lands the same bytes as the default with 3% less error against the master.
// Above that the returns stop: avif effort 8 and 9 were larger, not smaller.
// smartSubsample was measured too and left off: it costs 1.4% more bytes for
// a quality difference in the third decimal.
const WEBP_EFFORT = 6;
const AVIF_EFFORT = 6;
// Part of every manifest entry, and it covers the derivatives only: a bump
// re-cuts the thumb, the rungs, the placeholder and the avif from the cached
// masters, without a request and without touching a master. Same idea as
// share-cards' renderer version.
//
// The asymmetry is deliberate. A master is encoded once, when it is fetched,
// and nothing invalidates it: an entry inside the revalidation window, or one
// whose source answers 304, is reused whole and keeps the settings it was
// encoded under. WEBP_QUALITY and WEBP_EFFORT reach the master too, so masters
// stay mixed-generation until their own source photo changes. Re-encoding them
// under new settings would mean refetching every source, which is hours of
// polite crawling, or wiping the manifest to force it. Neither is worth a few
// percent of bytes, so this version says nothing about masters.
//
// v1 = thumb, rungs, placeholder and avif at sharp's default effort.
export const DERIVATIVE_VERSION = 2;
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
  // Which DERIVATIVE_VERSION cut the files above. Absent on entries written
  // before the field existed, which is what v1 means.
  derivativeVersion?: number;
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

// The per-image half of the caching rights. The policy map is the other half.
function isCacheableImage(image: AnimalImage): boolean {
  return image.rights === "cache-permitted";
}

// Whether a surface may draw this image at all, cached or hotlinked. Same rule
// as permittedPhotos in apps/web/lib/animal-images.ts, which is what decides
// which photo a card and a detail page actually lead with.
export function isDrawableImage(image: AnimalImage): boolean {
  return isCacheableImage(image) || image.rights === "display-permitted";
}

// The lead photo is what a card and the top of a detail page show, so it is
// the one worth the extra AVIF encode. A photo shared by several animals is
// a hero as soon as it leads one of them.
//
// The lead is the first image the web will draw, not images[0]: an
// unknown-rights photo never reaches a page, so taking it would mark a URL
// that is not in the manifest and leave the real hero without an AVIF. A
// display-permitted lead does stop the search: it is the photo the page shows,
// it has no cached copy to cut from, and the photo behind it is not a hero.
export function heroSourceUrls(animals: Animal[]): Set<string> {
  const urls = new Set<string>();
  for (const animal of animals) {
    const lead = animal.images.find(isDrawableImage);
    if (lead) urls.add(lead.sourceUrl);
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
      if (isCacheableImage(image)) urls.add(image.sourceUrl);
    }
  }
  return [...urls];
}

// The fields withCachedUrls grafts onto an image below. They describe a file
// this run produced, so anything republishing an image from an older dataset
// has to take them off and let the current manifest put them back: a stale
// cachedUrl names a file the deletion sweep may already have removed, and a
// provider whose caching rights were withdrawn must not keep one at all.
export const CACHE_DERIVED_IMAGE_FIELDS = [
  "cachedUrl",
  "width",
  "height",
  "widths",
  "avif",
  "blurDataURL",
] as const;

// An image with every cache-derived field taken off. The caller decides what
// to do with the rights; this only removes what points at a cached file.
export function stripCacheDerivedFields(image: AnimalImage): AnimalImage {
  const stripped: Record<string, unknown> = { ...image };
  for (const field of CACHE_DERIVED_IMAGE_FIELDS) delete stripped[field];
  return stripped as AnimalImage;
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

type SharpPipeline = ReturnType<typeof sharp>;

function encodeMaster(pipeline: SharpPipeline) {
  return pipeline
    .rotate() // apply EXIF orientation before it is stripped
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer({ resolveWithObject: true });
}

// A handful of shelter photos are malformed but still browser-renderable
// JPEGs (e.g. bad SOS parameters from whatever exported them). libvips'
// default failOn sensitivity rejects those outright, so the strict pass
// stays the default and this is a one-shot retry with it relaxed, on the
// same rotate/resize/webp pipeline. onTolerantDecode is only invoked when
// the retry is what saved the image, so a caller can log or count it
// without processImage knowing about logging.
export async function processImage(
  source: Buffer,
  onTolerantDecode?: (error: unknown) => void,
): Promise<{
  file: string;
  data: Buffer;
  width: number;
  height: number;
}> {
  let result: { data: Buffer; info: sharp.OutputInfo };
  try {
    result = await encodeMaster(sharp(source));
  } catch (strictError) {
    try {
      result = await encodeMaster(sharp(source, { failOn: "none" }));
    } catch {
      // The tolerant retry did not help either: surface the original error,
      // which is what today's "not a processable image" warning expects.
      throw strictError;
    }
    onTolerantDecode?.(strictError);
  }
  const { data, info } = result;
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
// placeholder already in the manifest, is left as it is, unless the entry
// was cut by an older DERIVATIVE_VERSION, in which case all of it is cut
// again from the master that is already on disk.
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
    // Read once, and only if this file is actually missing something. Every
    // derivative below is a clone of this one pipeline, sharp's documented
    // one-input-many-outputs shape: the base carries no operations, so a
    // clone starts from the master and applies only its own resize and
    // encode. It writes the same bytes as one sharp() per branch and takes
    // the same time, since a decode is ~14ms against ~570ms for the avif
    // encode. What it buys is one input and one place to change it.
    let base: SharpPipeline | undefined;
    const pipeline = (): SharpPipeline =>
      (base ??= sharp(readFileSync(sourcePath)));

    // An entry cut by an older version has every derivative redone under the
    // same name: the names come from the master's hash, and the master is not
    // re-encoded here, so nothing is added, removed or refetched.
    const stale = group.entries.some(
      (entry) => (entry.derivativeVersion ?? 1) !== DERIVATIVE_VERSION,
    );
    // A derivative that failed to encode leaves the entry on its old version
    // so the next run tries again, exactly as a missing file does. Every
    // derivative below is cut through this, so one bad master costs a warning
    // per derivative and never the whole pass.
    let complete = true;
    const derived = async (
      label: string,
      cut: () => Promise<void>,
    ): Promise<boolean> => {
      try {
        await cut();
        return true;
      } catch (error) {
        console.warn(`image ${file}: ${label} failed (${error})`);
        complete = false;
        return false;
      }
    };
    const webp = (resize: sharp.ResizeOptions, quality = WEBP_QUALITY) =>
      pipeline()
        .clone()
        .resize(resize)
        .webp({ quality, effort: WEBP_EFFORT })
        .toBuffer();

    const thumbPath = join(mediaDir, thumbFileFor(file));
    if (stale || !existsSync(thumbPath)) {
      const cut = await derived("thumbnail", async () =>
        writeFileAtomic(
          thumbPath,
          await webp({ width: THUMB_WIDTH, withoutEnlargement: true }),
        ),
      );
      if (cut) counts.thumbs++;
    }

    const widths: number[] = [];
    for (const rung of LADDER_WIDTHS) {
      // Never enlarge: a photo the shelter published small has fewer rungs,
      // and the cached copy remains the largest one.
      if (rung >= width) continue;
      const rungPath = join(mediaDir, rungFileFor(file, rung));
      if (!stale && existsSync(rungPath)) {
        widths.push(rung);
        continue;
      }
      const cut = await derived(`${rung}px rung`, async () =>
        writeFileAtomic(rungPath, await webp({ width: rung })),
      );
      if (cut) {
        widths.push(rung);
        counts.rungs++;
      }
    }
    widths.push(width);

    let blurDataURL = stale
      ? undefined
      : group.entries.find((e) => e.blurDataURL)?.blurDataURL;
    if (!blurDataURL) {
      const cut = await derived("blur placeholder", async () => {
        const blur = await webp({ width: BLUR_WIDTH }, BLUR_QUALITY);
        blurDataURL = `data:image/webp;base64,${blur.toString("base64")}`;
      });
      if (cut) counts.blurs++;
    }

    let avif = group.hero;
    if (avif && (stale || !existsSync(join(mediaDir, avifFileFor(file))))) {
      const cut = await derived("avif", async () =>
        writeFileAtomic(
          join(mediaDir, avifFileFor(file)),
          await pipeline()
            .clone()
            .avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
            .toBuffer(),
        ),
      );
      if (cut) counts.avifs++;
      else avif = false;
    }

    for (const entry of group.entries) {
      entry.widths = widths;
      if (blurDataURL) entry.blurDataURL = blurDataURL;
      // A photo that no longer leads any animal drops the flag here and the
      // file in the deletion sweep.
      if (avif) entry.avif = true;
      else delete entry.avif;
      if (complete) entry.derivativeVersion = DERIVATIVE_VERSION;
    }
  }

  return counts;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// "absent" is a first run and is fine. "unreadable" is a file that is there
// and cannot be used, which is a different and much worse thing: the manifest
// maps a source URL to a content-addressed file, and nothing on disk can
// reconstruct that mapping.
export type ManifestState = "absent" | "loaded" | "unreadable";

export interface LoadedImageCacheManifest {
  manifest: ImageCacheManifest;
  state: ManifestState;
}

export function loadImageCacheManifest(
  path: string,
): LoadedImageCacheManifest {
  if (!existsSync(path)) return { manifest: { entries: {} }, state: "absent" };
  let why: string;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed.entries === "object" && parsed.entries) {
      return { manifest: { entries: parsed.entries }, state: "loaded" };
    }
    why = "no entries object";
  } catch (error) {
    why = String(error);
  }
  console.warn(
    `images: the cache manifest at ${path} is unreadable (${why}). Every ` +
      `cached copy has lost its source URL and will be fetched again.`,
  );
  return { manifest: { entries: {} }, state: "unreadable" };
}

export function readImageCacheManifest(path: string): ImageCacheManifest {
  return loadImageCacheManifest(path).manifest;
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

// What one URL's turn produced. An absent entry drops the URL from the
// manifest; an absent counter means the turn was neither a fetch nor a reuse,
// which is every carry-forward path.
interface UrlOutcome {
  entry?: CachedImageEntry;
  counted?: "fetched" | "reused";
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

  const { manifest: previous, state: manifestState } =
    loadImageCacheManifest(manifestPath);
  const next: ImageCacheManifest = { entries: {} };
  mkdirSync(mediaDir, { recursive: true });

  // A manifest that is gone, unreadable or empty makes every entry look
  // uncached, and the sweep at the end reads "not in the manifest" as
  // "nobody wants it": on
  // a scoped run that is every other provider's photos, on a full run every
  // URL whose fetch failed this once. Files are cheap and a re-crawl of a
  // thousand photos is not, so a run that starts with no manifest and a media
  // directory full of files keeps the files and skips the sweep. The manifest
  // fills back in as URLs are fetched, and the next run sweeps normally.
  const startedWith = readdirSync(mediaDir);
  const manifestLost =
    (manifestState !== "loaded" ||
      Object.keys(previous.entries).length === 0) &&
    startedWith.length > 0;
  if (manifestLost) {
    console.warn(
      `images: no usable cache manifest at ${manifestPath} but ` +
        `${startedWith.length} file(s) in ${mediaDir}. Keeping them and ` +
        `skipping the deletion sweep for this run.`,
    );
  }

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

  // One URL's turn. Nothing here touches next.entries or the counters: the
  // outcome is handed back and applied once every host has finished, so the
  // manifest keeps the order cacheableUrls produced and the counters are
  // summed in a single place instead of being incremented from several
  // workers at once.
  const cacheOne = async (url: string): Promise<UrlOutcome> => {
    const prev = previous.entries[url];
    const prevUsable =
      prev !== undefined && existsSync(join(mediaDir, prev.file));
    // Keep what we have, cache nothing new. Reached by every failure path
    // below, and none of them counts as a fetch or a reuse.
    const keepPrevious: UrlOutcome = prevUsable ? { entry: prev } : {};

    if (inScope && !inScope.has(url)) return keepPrevious;

    if (
      prevUsable &&
      Date.now() - Date.parse(prev.fetchedAt) < revalidateAfterMs
    ) {
      return { entry: prev, counted: "reused" };
    }

    let res: PoliteBytesResponse;
    try {
      res = await client.getBytes(url, {
        accept: ACCEPT_IMAGES,
        maxBytes: MAX_SOURCE_BYTES,
        validators: prevUsable
          ? { etag: prev.etag, lastModified: prev.lastModified }
          : undefined,
      });
    } catch (error) {
      // Network trouble or robots.txt.
      console.warn(`image ${url}: fetch failed (${error})`);
      return keepPrevious;
    }

    if (res.notModified && prevUsable) {
      return {
        entry: {
          ...prev,
          etag: headerValue(res.headers["etag"]) ?? prev.etag,
          lastModified:
            headerValue(res.headers["last-modified"]) ?? prev.lastModified,
          // A 304 is a successful freshness check. Advancing the clock keeps
          // the next conditional request one full revalidation window away.
          fetchedAt: new Date().toISOString(),
        },
        counted: "reused",
      };
    }

    if (res.status === 404 || res.status === 410) {
      // The shelter removed the source photo; our copy goes with it.
      return {};
    }

    if (res.status !== 200 || res.body === null) {
      console.warn(`image ${url}: HTTP ${res.status}, not cached`);
      return keepPrevious;
    }

    let processed;
    try {
      processed = await processImage(res.body, (error) => {
        console.warn(`image ${url}: needed a tolerant decode (${error})`);
      });
    } catch (error) {
      console.warn(`image ${url}: not a processable image (${error})`);
      return keepPrevious;
    }

    writeContentAddressed(join(mediaDir, processed.file), processed.data);
    return {
      counted: "fetched",
      entry: {
        file: processed.file,
        width: processed.width,
        height: processed.height,
        etag: headerValue(res.headers["etag"]),
        lastModified: headerValue(res.headers["last-modified"]),
        fetchedAt: new Date().toISOString(),
      },
    };
  };

  // Hosts run at the same time, each host's own photos one after the other.
  const urls = cacheableUrls(animals, imagePolicies);
  const outcomes = await mapByHost(urls, (url) => url, cacheOne);

  let fetched = 0;
  let reused = 0;
  urls.forEach((url, index) => {
    // cacheableUrls deduplicates, so every outcome carries its own key and no
    // two of them can write the same entry.
    const outcome = outcomes[index]!;
    if (outcome.entry) next.entries[url] = outcome.entry;
    if (outcome.counted === "fetched") fetched++;
    else if (outcome.counted === "reused") reused++;
  });

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
  if (!manifestLost) {
    for (const file of readdirSync(mediaDir)) {
      if (referenced.has(file)) continue;
      try {
        rmSync(join(mediaDir, file));
        deleted++;
      } catch (error) {
        // A file held open by another process, or a stray directory. Neither
        // is worth losing the rest of the run over.
        console.warn(`image ${file}: could not be deleted (${error})`);
      }
    }
  }

  writeFileAtomic(manifestPath, JSON.stringify(next, null, 2));

  return {
    animals: withCachedUrls(animals, next),
    fetched,
    reused,
    deleted,
    derived,
  };
}
