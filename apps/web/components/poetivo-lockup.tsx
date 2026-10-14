import {
  POETIVO_INK,
  POETIVO_MARK,
  POETIVO_TILE,
  POETIVO_TILE_RADIUS,
} from "@/lib/poetivo-mark";
import { POETIVO_NAME } from "@/lib/site";

/**
 * Poetivo, the way it appears on this site: a verb from the catalogue, then
 * the lit-window mark pressed against the name in the wordmark's weight.
 *
 * One drawing for the two places that show it, the header's line under the
 * site's name and the footer's credit, so the brand wears one dress on a
 * page.
 *
 * The mark belongs to the name and sits with it. Leading the line, the way a
 * "powered by" badge does, it landed under the p of "posvoji.si" and read as
 * the site's own mark, with the words beside it a caption to nothing. A word
 * space separates the verb from the mark; a margin, smaller than a space,
 * separates the mark from the name, so the two distances say which word the
 * mark belongs to.
 *
 * In the text flow and not a flex row: an inline-flex box is an atomic
 * inline that text-decoration does not reach, and the footer's link would
 * lose its underline on exactly these words.
 *
 * The tile is 1em so it takes the caller's text size. Sunk 0.125em under the
 * baseline it is centred on the capitals beside it, which is where an icon
 * drawn at text size sits.
 *
 * The name is a constant beside the address it stands for, never a catalogue
 * string: it is not translated, and the weight is the wordmark's. The verb
 * is the caller's because the two callers want it differently cased.
 */
export function PoetivoLockup({ verb }: { verb: string }) {
  return (
    <span>
      {`${verb} `}
      {/* The brand's colours and not the theme's: the tile is made to read
          on light and dark chrome alike, and a P in currentColor on it would
          vanish on the dark theme. lib/poetivo-mark.ts says where the
          geometry comes from. */}
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="inline-block size-[1em] align-[-0.125em] mr-[0.25em]"
      >
        <rect
          width="16"
          height="16"
          rx={POETIVO_TILE_RADIUS}
          fill={POETIVO_TILE}
        />
        <path d={POETIVO_MARK} fill={POETIVO_INK} />
      </svg>
      <span className="font-semibold tracking-[-0.035em]">{POETIVO_NAME}</span>
    </span>
  );
}
