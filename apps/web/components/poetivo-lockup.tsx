import {
  POETIVO_INK,
  POETIVO_MARK,
  POETIVO_TILE,
  POETIVO_TILE_RADIUS,
} from "@/lib/poetivo-mark";
import { POETIVO_NAME } from "@/lib/site";

/**
 * Poetivo, the way it appears on this site: the lit-window mark, then a verb
 * from the catalogue, then the name in the wordmark's weight.
 *
 * One drawing for the two places that show it, the header's line under the
 * site's name and the footer's credit, so the brand wears one dress on a
 * page. Mark first, the way the footer's repository link leads with its own
 * mark and the way every "powered by" lockup reads: a badge, then its
 * words. With the mark between the verb and the name the eye snagged on a
 * square dropped into the middle of a phrase.
 *
 * A fragment and not a wrapper. The caller is an inline-flex row with its
 * own gap, and an inline-flex wrapper in between would be an atomic inline
 * that text-decoration does not reach, so the footer's link would lose its
 * underline on exactly these words. The two pieces land in the caller's row
 * as its own children instead.
 *
 * The name is a constant beside the address it stands for, never a catalogue
 * string: it is not translated, and the weight is the wordmark's. The verb
 * is the caller's because the two callers want it differently cased.
 */
export function PoetivoLockup({ verb }: { verb: string }) {
  return (
    <>
      {/* The brand's colours and not the theme's: the tile is made to read
          on light and dark chrome alike, and a P in currentColor on it would
          vanish on the dark theme. lib/poetivo-mark.ts says where the
          geometry comes from. */}
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
        <rect
          width="16"
          height="16"
          rx={POETIVO_TILE_RADIUS}
          fill={POETIVO_TILE}
        />
        <path d={POETIVO_MARK} fill={POETIVO_INK} />
      </svg>
      <span>
        {verb}{" "}
        <span className="font-semibold tracking-[-0.035em]">{POETIVO_NAME}</span>
      </span>
    </>
  );
}
