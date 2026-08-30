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

export interface ShelterLogo {
  url: string;
  // Whether the mark needs something to sit on, measured against each card
  // background at fetch time. Two answers rather than one reading of the ink,
  // because a mark can need a chip on one card and be perfectly legible on
  // the other: a mid-tone orange wordmark fails on white and reads on the
  // dark card, and the light-or-dark reading got that backwards both ways.
  chipOnLight: boolean;
  chipOnDark: boolean;
  // Whether the file has no transparency, so the mark arrives with its own
  // rectangle behind it. Those get their corners rounded rather than a chip:
  // the background they carry is already the plate, and a chip behind it would
  // only be a second one. Absent from an older manifest, where it reads false,
  // which is what every logo written before this was.
  opaque: boolean;
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
  const logos = readShelterLogos();
  // Nothing read is not worth remembering. The parse is memoized because a
  // build asks for it once per page across a thousand pages, but memoizing an
  // empty answer makes a momentary mismatch permanent: a dev server that read
  // the manifest in the window between a field being renamed here and the
  // ingest run writing it kept answering "no logos" for the rest of its life,
  // long after the file on disk was right. There is also nothing to save in
  // that case, since the expensive part is parsing entries there were none of.
  if (Object.keys(logos).length === 0) return logos;
  cached = logos;
  return cached;
}

/** The chip flags for one entry, from either shape the manifest has had.
 *
 *  The ingest run measures both answers now (logoSurface in
 *  apps/ingest/src/cache-logos.ts), but a data/dist written before that
 *  carries one "light" or "dark" reading of the ink instead, and data/dist is
 *  an artifact that gets restored, copied between clones and written by
 *  whichever checkout the scheduled crawl runs from. Reading the old shape
 *  costs three lines and takes away a failure that is both silent and total:
 *  the fields are checked per entry, so a manifest this build does not
 *  recognise does not degrade, it drops every logo on the site. */
function chipsFor(
  entry: Record<string, unknown>,
): Pick<ShelterLogo, "chipOnLight" | "chipOnDark"> | undefined {
  const { chipOnLight, chipOnDark, tone } = entry;
  if (typeof chipOnLight === "boolean" && typeof chipOnDark === "boolean") {
    return { chipOnLight, chipOnDark };
  }
  // The reading this replaced: "light" ink was plated in light mode and
  // "dark" ink in dark mode, which is what the two flags now say separately.
  if (tone === "light") return { chipOnLight: true, chipOnDark: false };
  if (tone === "dark") return { chipOnLight: false, chipOnDark: true };
  return undefined;
}

/** The manifest's entries as logos, skipping any this build cannot read.
 *
 *  Separate from the file handling so the shapes can be tested without a
 *  manifest on disk. */
export function logosFromEntries(entries: Record<string, unknown>): ShelterLogos {
  const logos: ShelterLogos = {};
  for (const [id, value] of Object.entries(entries)) {
    const entry = value as Record<string, unknown>;
    const { file, width, height } = entry;
    const chips = chipsFor(entry);
    if (
      typeof file !== "string" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      chips === undefined
    ) {
      continue;
    }
    logos[id] = {
      url: `/media/shelter-logos/${file}`,
      ...chips,
      // Older manifests have no such field, and every logo written before it
      // existed came from a transparent file.
      opaque: entry["opaque"] === true,
      width,
      height,
    };
  }
  return logos;
}

function readShelterLogos(): ShelterLogos {
  if (!existsSync(manifestPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = parsed?.entries;
    if (!entries || typeof entries !== "object") return {};
    const logos = logosFromEntries(entries);
    // A manifest with entries in it that yields no logos is the failure worth
    // saying out loud: the site renders, every shelter falls back to its
    // initial, and nothing else reports that anything went wrong.
    const found = Object.keys(entries).length;
    if (found > 0 && Object.keys(logos).length === 0) {
      console.warn(
        `shelter logos: ${found} entries in ${manifestPath}, none readable. ` +
          "The manifest was written by a different version of the ingest run.",
      );
    }
    return logos;
  } catch {
    // A broken manifest is not worth failing a build over: no logos, and the
    // next ingest run rewrites it.
    return {};
  }
}
