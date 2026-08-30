import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
import { mapByHost } from "./by-host";
import { shelterLogosDir, shelterLogoManifestPath } from "./paths";
import { writeFileAtomic } from "./write-atomic";
import { writeContentAddressed } from "./write-content-addressed";

// Where the static site serves the files written to shelterLogosDir.
const PUBLIC_PREFIX = "/media/shelter-logos";

// A shelter's full-size artwork stays at the shelter; this is the box the
// cached copy is fitted inside.
//
// 128 was right when a logo was drawn at 44 CSS pixels. The register now sizes
// each mark from its own proportions and draws them up to 144 CSS pixels wide,
// and the shelter page's hero up to 170, so 128 stopped being a 2x copy and
// started being an upscale: three of the eleven were drawn larger than the
// pixels we held. 384 covers the widest placement at 2x with room over.
//
// These are flat colour and line art, so the file grows far less than the
// area does.
const MAX_SIZE = 384;

// What a vector source is rasterized at, capped so a mark declaring a tiny
// viewBox cannot ask for an enormous bitmap.
const MAX_SVG_DENSITY = 1200;
const DEFAULT_SVG_DENSITY = 72;
const WEBP_QUALITY = 90;
// Same trade as the photo cache: effort costs batch time nobody waits on and
// returns smaller files at the same quality. One logo per shelter, so the
// cost here is nothing at all.
const WEBP_EFFORT = 6;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const ACCEPT_IMAGES = "image/avif,image/webp,image/*,*/*;q=0.8";

// A logo changes about as often as a shelter rebrands, so a copy is reused
// without any request until it is this old.
const REVALIDATE_AFTER_DAYS = 30;

// Whether a mark needs something to sit on, per card background. Shelter
// logos are supplied as transparent files drawn for one background: a white
// wordmark vanishes on a light card, a black one on a dark card, and a mid
// tone can fail on one while reading perfectly on the other. Asking the
// question once per background rather than sorting the ink into "light" or
// "dark" is what keeps the site from boxing a mark that was already legible,
// or leaving one bare that was not.
export interface LogoSurface {
  chipOnLight: boolean;
  chipOnDark: boolean;
  // Whether the file has no transparency at all, so the mark arrives with a
  // background of its own. Most shelters export a transparent PNG or SVG and
  // the card is their ground; a few send a JPEG, where the white or coloured
  // rectangle behind the mark is part of the file and cannot be taken out
  // without punching holes in the artwork that shares its colour.
  opaque: boolean;
}

export interface CachedLogoEntry extends LogoSurface {
  // Content-addressed by the processed bytes, so a re-encode or a redesigned
  // logo gets a new name and the stale copy is swept.
  file: string;
  width: number;
  height: number;
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
//
// `enabled` is deliberately not part of the test. It says whether we crawl a
// shelter's animals, which is a different grant on a different date from the
// one covering its mark, and the schema keeps them apart for that reason. A
// shelter that publishes no list we ingest can still let us print its logo
// beside its phone number, and requiring `enabled` here meant the only way to
// show that logo was to claim we crawl them.
export function logoTargets(
  policies: ProviderPolicy[],
): { providerId: string; homeUrl: string; logoUrl?: string }[] {
  return policies
    .filter((policy) => policy.logo.use === "permitted")
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

// The two card backgrounds a mark is drawn on, as relative luminance. --card
// is oklch(1 0 0) in light and oklch(0.205 0 0) in dark, and for a neutral the
// oklab lightness is the cube root of the linear value.
const CARD_LIGHT_LUMINANCE = 1;
const CARD_DARK_LUMINANCE = 0.205 ** 3;

// WCAG 1.4.11's minimum for a graphic. A mark is a drawing, not body copy.
const MIN_CONTRAST = 3;

// How much of a mark's ink has to clear MIN_CONTRAST for the mark to be left
// on the card bare.
//
// Two different shares, because the two failures are not the same failure.
// Against white, ink fails only where it is pale, and a mark with any real
// dark structure keeps its drawing: Mačja hiša reads perfectly on white with
// 27% of its ink dark enough, because that 27% is the outline the yellow sits
// inside. Against the dark card the ink that fails is the dark ink, which in
// these marks is the lettering, so a mark has to keep most of itself: Meli at
// 15% and Ljubljana at 35% are mostly black type and lose it.
//
// Both numbers sit in a gap rather than on a boundary, measured across the
// eleven cached logos. On white the shares run 0, 0, 0, 13, then 25 and up, so
// 20 splits a twelve-point window. On the dark card they run up to 51, then 80
// and up, so 60 splits a twenty-nine point one. The tightest margin in the set
// is Mačja hiša at 5 points clear of the white threshold, which is the logo
// this rule most has to get right: it is the yellow one whose black outline
// carries it.
//
// The share is measured on the cached copy, so it moves with the resolution
// that copy is kept at. Raising MAX_SIZE from 128 to 384 took Obalno from 30%
// to 13% on white and gave it a chip it had not had: a small render blurs pale
// ink against transparency into darker edge pixels, and counts those as ink
// that holds. The larger copy is the truer measure, being nearer the artwork
// the shelter drew, but a change to MAX_SIZE is a change to these numbers and
// the flags want re-reading when it happens.
const HOLDS_ON_LIGHT = 0.2;
const HOLDS_ON_DARK = 0.6;

function toLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// What decides a chip is whether the mark survives the card it is drawn on,
// measured, rather than which side of a brightness threshold its ink falls.
// Sorting the ink into "light" or "dark" got two cases wrong in opposite
// directions: a yellow mark with black line art was called light and boxed on
// a dark plate it never needed, and an orange wordmark with no dark pixel at
// all was called dark and left bare on white, where none of it reached 3:1.
// Both answers come out of the same count here, so neither can contradict the
// other.
export async function logoSurface(image: Buffer): Promise<LogoSurface> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let holdsOnLight = 0;
  let holdsOnDark = 0;
  let counted = 0;
  let clear = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = info.channels === 4 ? (data[i + 3] ?? 0) : 255;
    // Fully transparent is what makes a file's own rectangle not part of the
    // mark. A hairline of anti-aliasing is not, so this asks for wholly clear
    // pixels rather than merely not-opaque ones.
    if (alpha === 0) clear++;
    if (alpha < 128) continue;
    const luminance =
      0.2126 * toLinear(data[i] ?? 0) +
      0.7152 * toLinear(data[i + 1] ?? 0) +
      0.0722 * toLinear(data[i + 2] ?? 0);
    if (contrastRatio(luminance, CARD_LIGHT_LUMINANCE) >= MIN_CONTRAST) {
      holdsOnLight++;
    }
    if (contrastRatio(luminance, CARD_DARK_LUMINANCE) >= MIN_CONTRAST) {
      holdsOnDark++;
    }
    counted++;
  }

  // A file with no clear pixel anywhere brings its own ground. The card is
  // not behind that mark, its own rectangle is, so a chip would only be a
  // second background behind the first: the site rounds its corners instead
  // and draws it as the plate it already is.
  const opaque = clear === 0;

  // A logo with no opaque pixel at all is left bare on both: there is no ink
  // for a chip to rescue.
  if (counted === 0) {
    return { chipOnLight: false, chipOnDark: false, opaque: false };
  }
  return {
    chipOnLight: !opaque && holdsOnLight / counted < HOLDS_ON_LIGHT,
    chipOnDark: !opaque && holdsOnDark / counted < HOLDS_ON_DARK,
    opaque,
  };
}

// The margin a source file carries is not the mark. Several shelters export
// their logo with a wide transparent apron, and the site sizes a logo by the
// cached file's dimensions, so an untrimmed apron shrinks the drawn ink by
// exactly its share of the box. A uniform image makes trim throw; it has no
// margin to lose, so it is used as it came.
async function trimmed(source: Buffer): Promise<Buffer> {
  try {
    return await sharp(source).trim({ threshold: 10 }).toBuffer();
  } catch {
    return source;
  }
}

// A vector, drawn at the size we are going to keep it at.
//
// sharp renders an SVG at the size the file declares, at 72 dpi, and the
// resize below will not enlarge a bitmap. Together those pin a vector to
// whatever its author happened to type in the width attribute: Maribor's mark
// declares width="85", so the shelter with the most scalable source in the
// register had the smallest copy of any of them. Raising the density asks the
// renderer for the pixels instead of asking the resizer to invent them.
//
// Anything that is not a vector comes back untouched, including the cached
// webp that refreshed() re-reads.
async function rasterized(source: Buffer): Promise<Buffer> {
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(source).metadata();
    if (meta.format !== "svg") return source;
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    // Unreadable here is unreadable in processLogo, which reports it.
    return source;
  }

  const longest = Math.max(width, height);
  if (longest <= 0) return source;
  const density = Math.min(
    MAX_SVG_DENSITY,
    Math.max(
      DEFAULT_SVG_DENSITY,
      Math.ceil((DEFAULT_SVG_DENSITY * MAX_SIZE) / longest),
    ),
  );
  try {
    return await sharp(source, { density }).png().toBuffer();
  } catch {
    // A density the renderer refuses is not worth losing the logo over.
    return source;
  }
}

// Logos are line art and flat colour with transparency, so they are fitted
// inside a box rather than cropped, and the alpha channel is kept.
export async function processLogo(source: Buffer): Promise<
  LogoSurface & {
    file: string;
    data: Buffer;
    width: number;
    height: number;
  }
> {
  // Rasterize before trimming: trimming a vector would render it at its
  // declared size first and throw the resolution away before the resize ever
  // sees it.
  const { data, info } = await sharp(await trimmed(await rasterized(source)))
    .resize({
      width: MAX_SIZE,
      height: MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer({ resolveWithObject: true });
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  return {
    file: `${hash}.webp`,
    data,
    width: info.width,
    height: info.height,
    ...(await logoSurface(data)),
  };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readManifest(path: string): LogoManifest {
  if (!existsSync(path)) return { entries: {} };
  let why: string;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed.entries === "object" && parsed.entries) {
      return { entries: parsed.entries };
    }
    why = "no entries object";
  } catch (error) {
    why = String(error);
  }
  // Loud, because the entry is the only record of which file belongs to which
  // shelter: nothing on disk can be matched back up.
  console.warn(`logos: the manifest at ${path} is unreadable (${why})`);
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

// What one shelter's turn produced. An absent entry drops the shelter from
// the manifest; an absent counter means the turn was neither a fetch nor a
// reuse, which is every carry-forward path.
interface LogoOutcome {
  entry?: CachedLogoEntry;
  counted?: "fetched" | "reused";
  discovered?: string;
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

  // Same rule as the photo cache: with no usable manifest the sweep below
  // reads every file on disk as an orphan, and a shelter whose logo fetch
  // fails this run would lose the copy it already had. Keep the files for one
  // run, warn, and sweep on the next one.
  const startedWith = readdirSync(logosDir);
  const manifestLost =
    Object.keys(previous.entries).length === 0 && startedWith.length > 0;
  if (manifestLost) {
    console.warn(
      `logos: no usable manifest at ${manifestPath} but ` +
        `${startedWith.length} file(s) in ${logosDir}. Keeping them and ` +
        `skipping the deletion sweep for this run.`,
    );
  }

  // A kept entry re-judged from the cached bytes. The tone rule and the trim
  // are judgements about bytes we already hold, so a change to either has to
  // reach a logo that keeps answering 304, not wait for the shelter to
  // redesign it. The file is rewritten only when trimming would actually
  // change its dimensions: a re-encode of unchanged pixels is not
  // byte-stable, so rewriting unconditionally would mint a new content hash
  // every run. An unreadable file keeps its entry; the next revalidation
  // replaces it anyway.
  const refreshed = async (entry: CachedLogoEntry): Promise<CachedLogoEntry> => {
    try {
      const bytes = readFileSync(join(logosDir, entry.file));
      const alreadyTrim = await sharp(await trimmed(bytes)).metadata();
      if (
        alreadyTrim.width !== entry.width ||
        alreadyTrim.height !== entry.height
      ) {
        const processed = await processLogo(bytes);
        writeContentAddressed(join(logosDir, processed.file), processed.data);
        return {
          ...entry,
          file: processed.file,
          width: processed.width,
          height: processed.height,
          chipOnLight: processed.chipOnLight,
          chipOnDark: processed.chipOnDark,
          opaque: processed.opaque,
        };
      }
      return { ...entry, ...(await logoSurface(bytes)) };
    } catch {
      return entry;
    }
  };

  // One shelter's turn: its home page, then its logo, in that order. Nothing
  // here touches next.entries, discovered or the counters. The outcome is
  // handed back and applied once every host has finished, so both records keep
  // the order of `targets` and the counters are summed in one place.
  const cacheOne = async (target: {
    providerId: string;
    homeUrl: string;
    logoUrl?: string;
  }): Promise<LogoOutcome> => {
    const stored = previous.entries[target.providerId];
    // The file on disk is the whole test. An entry written before a judgement
    // existed is not stale, because refreshed() takes every judgement off the
    // bytes: an older manifest is brought up to date without a request.
    const storedUsable =
      stored !== undefined && existsSync(join(logosDir, stored.file));
    // A kept copy gets today's judgement of its bytes (see refreshed above).
    // prev stays a const so the prevUsable checks below keep narrowing it.
    const prev = storedUsable ? await refreshed(stored) : undefined;
    const prevUsable = prev !== undefined;
    // Keep what we have, take nothing new. Reached by every failure path
    // below, and none of them counts as a fetch or a reuse.
    const keepPrevious: LogoOutcome = prevUsable ? { entry: prev } : {};

    if (
      prevUsable &&
      Date.now() - Date.parse(prev.fetchedAt) < revalidateAfterMs &&
      // A logo pinned in policy.yaml after the copy was taken has to win over
      // the cached guess, otherwise the pin would not take effect for a month.
      (target.logoUrl === undefined || target.logoUrl === prev.sourceUrl)
    ) {
      return { entry: prev, counted: "reused" };
    }

    let sourceUrl = target.logoUrl;
    let discoveredUrl: string | undefined;
    if (!sourceUrl) {
      try {
        const home = await client.get(target.homeUrl);
        if (home.status !== 200 || home.body === null) {
          console.warn(
            `logo ${target.providerId}: home page HTTP ${home.status}`,
          );
          return keepPrevious;
        }
        sourceUrl = discoverLogoUrl(home.body, target.homeUrl);
      } catch (error) {
        // Network trouble or robots.txt: keep what we have, take nothing new.
        console.warn(`logo ${target.providerId}: home page failed (${error})`);
        return keepPrevious;
      }
      if (!sourceUrl) {
        console.warn(`logo ${target.providerId}: no logo found on the page`);
        return keepPrevious;
      }
      discoveredUrl = sourceUrl;
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
      console.warn(`logo ${target.providerId}: fetch failed (${error})`);
      return { ...keepPrevious, discovered: discoveredUrl };
    }

    if (res.notModified && prevUsable) {
      return { entry: prev, counted: "reused", discovered: discoveredUrl };
    }

    if (res.status === 404 || res.status === 410) {
      // The shelter removed the file; our copy goes with it.
      console.warn(`logo ${target.providerId}: ${sourceUrl} is gone`);
      return { discovered: discoveredUrl };
    }

    if (res.status !== 200 || res.body === null) {
      console.warn(`logo ${target.providerId}: HTTP ${res.status}, not cached`);
      return { ...keepPrevious, discovered: discoveredUrl };
    }

    if (res.body.length > MAX_SOURCE_BYTES) {
      console.warn(`logo ${target.providerId}: ${res.body.length} bytes exceeds cap`);
      return { ...keepPrevious, discovered: discoveredUrl };
    }

    let processed;
    try {
      processed = await processLogo(res.body);
    } catch (error) {
      // Reached for .ico and for anything that was not an image at all.
      console.warn(
        `logo ${target.providerId}: ${sourceUrl} is not a processable image (${error})`,
      );
      return { ...keepPrevious, discovered: discoveredUrl };
    }

    writeContentAddressed(join(logosDir, processed.file), processed.data);
    return {
      counted: "fetched",
      discovered: discoveredUrl,
      entry: {
        file: processed.file,
        width: processed.width,
        height: processed.height,
        chipOnLight: processed.chipOnLight,
        chipOnDark: processed.chipOnDark,
        opaque: processed.opaque,
        sourceUrl,
        etag: headerValue(res.headers["etag"]),
        lastModified: headerValue(res.headers["last-modified"]),
        fetchedAt: new Date().toISOString(),
      },
    };
  };

  // One worker per shelter site. Each shelter's home page and logo still go
  // out one after the other against its own host, and PoliteClient keeps its
  // delay between them; only the wait for other shelters is gone. Two
  // shelters that happen to share a host share a queue and stay serialized.
  const outcomes = await mapByHost(
    targets,
    (target) => target.homeUrl,
    cacheOne,
  );

  let fetched = 0;
  let reused = 0;
  targets.forEach((target, index) => {
    // logoTargets comes from the policy files, where providerId is unique and
    // validated, so no two outcomes can write the same entry.
    const outcome = outcomes[index]!;
    if (outcome.entry) next.entries[target.providerId] = outcome.entry;
    if (outcome.discovered) discovered[target.providerId] = outcome.discovered;
    if (outcome.counted === "fetched") fetched++;
    else if (outcome.counted === "reused") reused++;
  });

  // Content addressing can share one file between shelters, so deletion goes
  // by "no longer referenced". Sweeping the whole directory also clears
  // orphans left by a lost manifest.
  const referenced = new Set(
    Object.values(next.entries).map((entry) => entry.file),
  );
  let deleted = 0;
  if (!manifestLost) {
    for (const file of readdirSync(logosDir)) {
      if (referenced.has(file)) continue;
      try {
        rmSync(join(logosDir, file));
        deleted++;
      } catch (error) {
        console.warn(`logo file ${file}: could not be deleted (${error})`);
      }
    }
  }

  writeFileAtomic(manifestPath, JSON.stringify(next, null, 2));

  return { manifest: next, fetched, reused, deleted, discovered };
}
