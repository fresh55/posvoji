import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The site's own mark, as geometry a printed sheet can carry.
 *
 * app/icon.svg is the one drawing: the favicon ships it, and the header paints
 * it as a mask (components/logo.tsx). Neither of those can serve a poster. A
 * mask is a fetch, and a sheet that a browser prints before the request lands
 * prints an empty box; the file's own fill lives in a <style> block with a
 * prefers-color-scheme rule in it, and that rule paints the mark near-white on
 * a printer that has never heard of dark mode.
 *
 * So the paths are read at build time and re-fronted with the sheet's own ink.
 * Read here rather than copied into a constant because a copy is a second
 * drawing to keep in step with the first, and the silhouette is already
 * load-bearing for the header.
 */

const iconPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "icon.svg",
);

/** The drawing's own coordinate system, from the file's viewBox. */
export const BRAND_MARK_VIEWBOX = "0 0 128 120.8";

// The file opens with an HTML comment about the header's dependency on it, and
// carries its colours in a <style> block. Neither belongs in the markup a
// server component hands to React, and the style block would follow the
// visitor's theme into a print preview if it did.
const COMMENT = /<!--[\s\S]*?-->/g;
const STYLE = /<style[\s\S]*?<\/style>/gi;
const SVG_WRAPPER = /^[\s\S]*?<svg[^>]*>|<\/svg>[\s\S]*$/g;

// Read once. The export renders the mark on every poster page in both
// languages, and the file cannot change while pages are being rendered.
let cached: string | undefined;

/**
 * The contents of app/icon.svg with its comment, its style block and its own
 * <svg> wrapper taken off: the paths, and nothing that decides their colour.
 *
 * The caller supplies the wrapper, the viewBox above and one explicit fill,
 * which is what makes the mark print as ink rather than as whatever the
 * browser's colour scheme happens to be.
 */
export function brandMarkPaths(): string {
  if (cached !== undefined) return cached;
  cached = readFileSync(iconPath, "utf8")
    .replace(COMMENT, "")
    .replace(STYLE, "")
    .replace(SVG_WRAPPER, "")
    .trim();
  return cached;
}
