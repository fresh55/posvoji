import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  GetBytesOptions,
  PoliteBytesResponse,
  PoliteResponse,
} from "@posvoji/provider-sdk";
import type { ProviderPolicy } from "@posvoji/schema";
import { shelterLogosDir, shelterLogoManifestPath } from "./paths";

// Where the static site serves the files written to shelterLogosDir.
const PUBLIC_PREFIX = "/media/shelter-logos";

// The logo renders at 44 CSS pixels in the shelter block and smaller in the
// grid, so 128 covers every use at 2x. A shelter's full-size artwork stays at
// the shelter.
const MAX_SIZE = 128;
const WEBP_QUALITY = 90;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const ACCEPT_IMAGES = "image/avif,image/webp,image/*,*/*;q=0.8";

// A logo changes about as often as a shelter rebrands, so a copy is reused
// without any request until it is this old.
const REVALIDATE_AFTER_DAYS = 30;

// Whether the logo's own ink is light or dark. Shelter logos are supplied as
// transparent PNGs drawn for one background: a white wordmark vanishes on a
// light card, a black one on a dark card. Recording the ink lets the site sit
// each logo on a chip it contrasts with, in either theme.
export type LogoTone = "light" | "dark";

export interface CachedLogoEntry {
  // Content-addressed by the processed bytes, so a re-encode or a redesigned
  // logo gets a new name and the stale copy is swept.
  file: string;
  width: number;
  height: number;
  tone: LogoTone;
  // Kept so a reviewer can see exactly which file on the shelter's site this
  // came from without re-running discovery.
  sourceUrl: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: string;
}

export interface LogoManifest {
  entries: Record<string, CachedLogoEntry>;
}

// The slice of PoliteClient the logo sync needs; tests substitute a stub.
export interface LogoClient {
  get(url: string): Promise<PoliteResponse>;
  getBytes(url: string, options?: GetBytesOptions): Promise<PoliteBytesResponse>;
}

export function publicUrlFor(file: string): string {
  return `${PUBLIC_PREFIX}/${file}`;
}

// Only providers whose policy carries a dated logo grant. The policy is the
// only authority here: `images: cache-permitted` covers animal photographs,
// never the shelter's own mark.
export function logoTargets(
  policies: ProviderPolicy[],
): { providerId: string; homeUrl: string; logoUrl?: string }[] {
  return policies
    .filter((policy) => policy.enabled && policy.logo.use === "permitted")
    .map((policy) => ({
      providerId: policy.providerId,
      homeUrl: new URL(policy.source).origin,
      logoUrl: policy.logo.url,
    }));
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(
    tag,
  );
  return match?.[2] ?? match?.[3];
}

function largestSize(sizes: string | undefined): number {
  if (!sizes) return 0;
  return Math.max(
    0,
    ...[...sizes.matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])),
  );
}

// A ranked guess, not a parser: shelter sites are hand-built and the mark
// turns up in a different place on each one. Anything discovered here is
// pinned back into policy.yaml so the next run is exact rather than guessed.
export function discoverLogoUrl(
  html: string,
  baseUrl: string,
): string | undefined {
  const candidates: { href: string; score: number }[] = [];
  const push = (href: string | undefined, score: number) => {
    if (!href) return;
    // Data URIs and tracking pixels are never the mark.
    if (href.startsWith("data:")) return;
    try {
      candidates.push({ href: new URL(href, baseUrl).toString(), score });
    } catch {
      // A malformed href is simply not a candidate.
    }
  };

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const href = attr(tag, "href");
    if (rel.includes("apple-touch-icon")) {
      // Square, sized for a home screen, and almost always the real mark.
      push(href, 70 + largestSize(attr(tag, "sizes")) / 100);
    } else if (rel.split(/\s+/).includes("icon")) {
      // A .ico favicon is a last resort: sharp cannot read the format and it
      // is usually 16px anyway.
      const ico = /\.ico(\?|$)/i.test(href ?? "");
      push(href, (ico ? 10 : 40) + largestSize(attr(tag, "sizes")) / 100);
    }
  }

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (
      attr(tag, "property") ??
      attr(tag, "itemprop") ??
      attr(tag, "name") ??
      ""
    ).toLowerCase();
    // og:image is deliberately absent: on a shelter's home page it is
    // typically a photograph of an animal, not the shelter's mark.
    if (key === "logo" || key === "og:logo") push(attr(tag, "content"), 80);
  }

  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const haystack = [
      attr(tag, "src"),
      attr(tag, "class"),
      attr(tag, "id"),
      attr(tag, "alt"),
    ]
      .join(" ")
      .toLowerCase();
    if (!/logo|grb|znak/.test(haystack)) continue;
    // An <img> the site itself calls a logo beats a generated icon, and it
    // is the artwork a visitor associates with the shelter.
    push(attr(tag, "src"), 90);
  }

  let best: { href: string; score: number } | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best?.href;
}

// What decides the chip is the near-black ink, not the average colour. A
// colourful logo with black outlines or a black wordmark falls apart on a
// dark chip however bright its fills are (the mean got exactly that wrong for
// a yellow logo with black line art), while a mark drawn in white simply has
// no dark pixels at all. So: light ink only when dark pixels are essentially
// absent and the rest is bright; everything else goes on the white chip.
export async function inkTone(image: Buffer): Promise<LogoTone> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let dark = 0;
  let counted = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = info.channels === 4 ? (data[i + 3] ?? 0) : 255;
    if (alpha < 128) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;
    if (luminance < 100) dark++;
    counted++;
  }

  // A logo with no opaque pixel at all is treated as dark ink, which puts it
  // on the light chip the majority use.
  if (counted === 0) return "dark";
  return dark / counted < 0.03 && sum / counted > 140 ? "light" : "dark";
}

// Logos are line art and flat colour with transparency, so they are fitted
// inside a box rather than cropped, and the alpha channel is kept.
export async function processLogo(source: Buffer): Promise<{
  file: string;
  data: Buffer;
  width: number;
  height: number;
  tone: LogoTone;
}> {
  const { data, info } = await sharp(source)
    .resize({
      width: MAX_SIZE,
      height: MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  return {
    file: `${hash}.webp`,
    data,
    width: info.width,
    height: info.height,
    tone: await inkTone(data),
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readManifest(path: string): LogoManifest {
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

export interface CacheLogosResult {
  manifest: LogoManifest;
  fetched: number;
  reused: number;
  deleted: number;
  // Discovered source URLs worth pinning into policy.yaml, keyed by provider.
  discovered: Record<string, string>;
}

export interface CacheLogosOptions {
  logosDir?: string;
  manifestPath?: string;
  revalidateAfterDays?: number;
}

// One logo per permitted shelter. A shelter that revokes the grant drops out
// of logoTargets, so the next run deletes its file: the removal path is the
// sync itself, as it is for photographs.
export async function cacheLogos(
  targets: { providerId: string; homeUrl: string; logoUrl?: string }[],
  client: LogoClient,
  options: CacheLogosOptions = {},
): Promise<CacheLogosResult> {
  const logosDir = options.logosDir ?? shelterLogosDir;
  const manifestPath = options.manifestPath ?? shelterLogoManifestPath;
  const revalidateAfterMs =
    (options.revalidateAfterDays ?? REVALIDATE_AFTER_DAYS) * 24 * 60 * 60_000;

  const previous = readManifest(manifestPath);
  const next: LogoManifest = { entries: {} };
  const discovered: Record<string, string> = {};
  mkdirSync(logosDir, { recursive: true });

  let fetched = 0;
  let reused = 0;

  for (const target of targets) {
    const prev = previous.entries[target.providerId];
    const prevUsable =
      prev !== undefined &&
      prev.tone !== undefined &&
      existsSync(join(logosDir, prev.file));

    if (
      prevUsable &&
      Date.now() - Date.parse(prev.fetchedAt) < revalidateAfterMs &&
      // A logo pinned in policy.yaml after the copy was taken has to win over
      // the cached guess, otherwise the pin would not take effect for a month.
      (target.logoUrl === undefined || target.logoUrl === prev.sourceUrl)
    ) {
      next.entries[target.providerId] = prev;
      reused++;
      continue;
    }

    let sourceUrl = target.logoUrl;
    if (!sourceUrl) {
      try {
        const home = await client.get(target.homeUrl);
        if (home.status !== 200 || home.body === null) {
          console.warn(
            `logo ${target.providerId}: home page HTTP ${home.status}`,
          );
          if (prevUsable) next.entries[target.providerId] = prev;
          continue;
        }
        sourceUrl = discoverLogoUrl(home.body, target.homeUrl);
      } catch (error) {
        // Network trouble or robots.txt: keep what we have, take nothing new.
        if (prevUsable) next.entries[target.providerId] = prev;
        console.warn(`logo ${target.providerId}: home page failed (${error})`);
        continue;
      }
      if (!sourceUrl) {
        if (prevUsable) next.entries[target.providerId] = prev;
        console.warn(`logo ${target.providerId}: no logo found on the page`);
        continue;
      }
      discovered[target.providerId] = sourceUrl;
    }

    let res: PoliteBytesResponse;
    try {
      res = await client.getBytes(sourceUrl, {
        accept: ACCEPT_IMAGES,
        validators:
          prevUsable && prev.sourceUrl === sourceUrl
            ? { etag: prev.etag, lastModified: prev.lastModified }
            : undefined,
      });
    } catch (error) {
      if (prevUsable) next.entries[target.providerId] = prev;
      console.warn(`logo ${target.providerId}: fetch failed (${error})`);
      continue;
    }

    if (res.notModified && prevUsable) {
      next.entries[target.providerId] = prev;
      reused++;
      continue;
    }

    if (res.status === 404 || res.status === 410) {
      // The shelter removed the file; our copy goes with it.
      console.warn(`logo ${target.providerId}: ${sourceUrl} is gone`);
      continue;
    }

    if (res.status !== 200 || res.body === null) {
      if (prevUsable) next.entries[target.providerId] = prev;
      console.warn(`logo ${target.providerId}: HTTP ${res.status}, not cached`);
      continue;
    }

    if (res.body.length > MAX_SOURCE_BYTES) {
      if (prevUsable) next.entries[target.providerId] = prev;
      console.warn(`logo ${target.providerId}: ${res.body.length} bytes exceeds cap`);
      continue;
    }

    let processed;
    try {
      processed = await processLogo(res.body);
    } catch (error) {
      // Reached for .ico and for anything that was not an image at all.
      if (prevUsable) next.entries[target.providerId] = prev;
      console.warn(
        `logo ${target.providerId}: ${sourceUrl} is not a processable image (${error})`,
      );
      continue;
    }

    const path = join(logosDir, processed.file);
    if (!existsSync(path)) writeFileSync(path, processed.data);
    next.entries[target.providerId] = {
      file: processed.file,
      width: processed.width,
      height: processed.height,
      tone: processed.tone,
      sourceUrl,
      etag: headerValue(res.headers["etag"]),
      lastModified: headerValue(res.headers["last-modified"]),
      fetchedAt: new Date().toISOString(),
    };
    fetched++;
  }

  // Content addressing can share one file between shelters, so deletion goes
  // by "no longer referenced". Sweeping the whole directory also clears
  // orphans left by a lost manifest.
  const referenced = new Set(
    Object.values(next.entries).map((entry) => entry.file),
  );
  let deleted = 0;
  for (const file of readdirSync(logosDir)) {
    if (referenced.has(file)) continue;
    rmSync(join(logosDir, file));
    deleted++;
  }

  writeFileSync(manifestPath, JSON.stringify(next, null, 2));

  return { manifest: next, fetched, reused, deleted, discovered };
}
