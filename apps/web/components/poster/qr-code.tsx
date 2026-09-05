import { encode } from "uqr";

/**
 * The QR code on the poster, drawn at build time.
 *
 * A server component and nothing else. uqr is small, but it is still an
 * encoder nobody browsing the site needs: the symbol is the same on every
 * copy of a sheet that is printed once and hung on a wall, so it is computed
 * during the export and shipped as markup. Importing this from a "use client"
 * file would put the encoder in the browser bundle for no gain at all.
 */

// Four light modules on every side. The specification asks for four, and a
// symbol printed onto white paper with less of a margin is one a phone hunts
// for against whatever is pinned next to it.
const QUIET_ZONE = 4;

// M. L is the default and gives back the least redundancy of the four, which
// is the wrong trade for a sheet that will pick up a thumbprint, a fold and a
// drawing pin; Q and H buy resilience nobody needs by making the modules
// smaller, and a smaller module is the thing that actually stops a scan at
// 40mm across.
const ERROR_CORRECTION = "M" as const;

export type QrSymbol = {
  /** Modules per side, quiet zone included. Also the SVG's own viewBox. */
  size: number;
  /** Every dark module as one path, in module units. */
  path: string;
};

/**
 * The symbol as a single SVG path.
 *
 * Pure and exported so a test can hold it still. The poster is generated once
 * per animal per language during the export, and a code that came out
 * differently on two builds would show up as a diff nobody could read and a
 * cache nobody could trust.
 *
 * One path and not a rect per module: a 33-module symbol is about a thousand
 * of them, and runs of adjacent dark modules on a row collapse into one
 * subpath. Same picture, a fraction of the markup.
 */
export function qrSymbol(value: string): QrSymbol {
  const { size, data } = encode(value, {
    ecc: ERROR_CORRECTION,
    border: QUIET_ZONE,
  });

  const runs: string[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = data[y];
    if (!row) continue;
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (row[x + run]) run += 1;
      runs.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }

  return { size, path: runs.join("") };
}

export function QrCode({
  value,
  className,
  label,
}: {
  /** What the code encodes. The poster hands it an absolute URL. */
  value: string;
  className?: string;
  /** The accessible name. A code with none is a picture of noise. */
  label: string;
}) {
  const { size, path } = qrSymbol(value);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      // The modules are whole units in this coordinate system and the printer
      // resolves them onto a device grid that is not. Anti-aliased edges are
      // what makes a small code read as grey mush under a camera.
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className={className}
    >
      {/* The quiet zone is part of the symbol, so the white it needs is drawn
          here rather than left to whatever the sheet puts behind it. */}
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
