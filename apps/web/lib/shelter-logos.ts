import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "dist",
  "shelter-logos.json",
);

/** Whether the logo's own ink is light or dark, measured at fetch time. */
export type LogoTone = "light" | "dark";

export interface ShelterLogo {
  url: string;
  // Decides which chip the logo sits on, so a white wordmark stays visible in
  // light mode and a black one in dark mode.
  tone: LogoTone;
  // The cached copy's own dimensions. Shelter logos are mostly wide
  // wordmarks, so the avatar needs the real ratio to give one a slot it fits
  // in rather than letterboxing it into a square.
  width: number;
  height: number;
}

/** Shelter id to its cached logo. */
export type ShelterLogos = Record<string, ShelterLogo>;

// Read at build time, like the dataset itself. A logo is shelter content, so
// it is fetched by the ingest run rather than committed: before the first run
// this is empty and every shelter falls back to an initial-letter avatar.
// Read once. The build prerenders every animal and shelter page and each one
// asks for the manifest, so without this the same 3.6 KB file is stat'd, read
// and parsed about a thousand times for an answer that cannot change between
// pages. Same shape lib/shelters.ts and lib/dataset.ts already use.
let cached: ShelterLogos | undefined;

export function getShelterLogos(): ShelterLogos {
  if (cached) return cached;
  cached = readShelterLogos();
  return cached;
}

function readShelterLogos(): ShelterLogos {
  if (!existsSync(manifestPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = parsed?.entries;
    if (!entries || typeof entries !== "object") return {};
    const logos: ShelterLogos = {};
    for (const [id, entry] of Object.entries(entries)) {
      const { file, width, height, tone } = entry as Record<string, unknown>;
      if (
        typeof file !== "string" ||
        typeof width !== "number" ||
        typeof height !== "number" ||
        (tone !== "light" && tone !== "dark")
      ) {
        continue;
      }
      logos[id] = {
        url: `/media/shelter-logos/${file}`,
        tone,
        width,
        height,
      };
    }
    return logos;
  } catch {
    // A broken manifest is not worth failing a build over: no logos, and the
    // next ingest run rewrites it.
    return {};
  }
}
