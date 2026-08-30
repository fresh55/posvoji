import Image from "next/image";
import type { ReactNode } from "react";
import { shelterInitial } from "@/lib/shelter-initial";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";

// A shelter's mark is drawn on the page itself, the way a wall of sponsor
// logos is, rather than inside a plate of its own.
//
// The plate was doing three jobs and only one of them was needed. It gave a
// white-ink logo something to be visible against, which is real. It also fixed
// a column so a grid of cards lined up, which the fixed row height below does
// without drawing anything, and it boxed nine perfectly legible dark marks in
// grey rectangles they did not ask for. Those rectangles were the loudest
// thing on the register: seventeen cards and seventeen plates, fifteen of them
// light grey and two of them black.
//
// So the box is gone and the ink decides. See TONE_CHIP.

// How fast a mark's drawn height falls off as the mark gets wider.
//
// The eleven logos in the set run from 0.82:1 (a portrait pictogram) to about
// 4:1 (a one-line wordmark). Drawing them all at one height, which is what the
// old plate did, gave the pictogram a 23px square and the wordmark its full
// width: the same card drew one shelter at a fifth of another's size. Drawing
// them all at one area is the other extreme, and it puts every wordmark at
// about 22px tall, which is under the size its letters stay readable at.
//
// 0.35 is between the two, nearer equal height. It lets the portrait marks
// reach their height cap and the widest wordmarks reach their width cap, and
// across the eleven the largest drawn area is under twice the smallest, which
// is close enough that no mark reads as dwarfing its neighbour.
const WIDTH_FALLOFF = 0.35;

// Per size: the row a mark is centred in, the height an aspect-1 mark is drawn
// at, the two caps that bound it, and the fallback ring's size.
//
// `row` is the whole point of the size and the only thing a caller has to care
// about: it is drawn whatever the mark turns out to be, so a grid of cards
// starts every shelter's name at the same y even though the marks above them
// are eleven different shapes.
//
// xs, sm and lg are one scale, picked by how much room the placement has.
// "register" is not a fourth step on it: it is a placement, named for the one
// it exists for, and its numbers are measured against that page. The
// register's narrowest card is the two-column band at 640px, which leaves
// about 256px inside the card padding, and the widest count pill beside the
// mark takes 80 of it. 144 plus the chip's own padding is what still fits
// there with room to spare, and it is a third of the 394px card the
// three-column band draws, which is the width the marks are actually read at.
// `fallback` is the avatar drawn where there is no logo: a diameter off the
// Tailwind scale and the letter size that sits in it, which stays near 37% of
// the diameter the way an avatar's initials usually do. A letter that keeps
// one proportion of a 32px avatar is a thin mark, and the same proportion of
// a 56px one is a balloon.
const SIZE = {
  // Chip-scale placements where sm crowds a compact card.
  xs: {
    row: "h-9",
    height: 26,
    maxHeight: 28,
    maxWidth: 72,
    fallback: "size-8 text-xs",
  },
  sm: {
    row: "h-12",
    height: 34,
    maxHeight: 36,
    maxWidth: 92,
    fallback: "size-10 text-sm",
  },
  lg: {
    row: "h-20",
    height: 62,
    maxHeight: 66,
    maxWidth: 170,
    fallback: "size-14 text-xl",
  },
  // The register card. The one placement that draws every logo in the set
  // side by side, so the one placement where the falloff above is actually
  // read.
  register: {
    row: "h-16",
    height: 52,
    maxHeight: 54,
    maxWidth: 144,
    fallback: "size-12 text-lg",
  },
} as const;

// A chip is drawn only where the mark would otherwise be ink on ink.
//
// Shelters draw their logo for their own site's background, and the page
// follows prefers-color-scheme, so whether a mark holds is a question about a
// mark and a card together, asked twice. The ingest run measures it that way
// (see chipNeeds in apps/ingest/src/cache-logos.ts) and the manifest carries
// both answers, so the two flags below are independent: a mark can want a
// chip on one card, on the other, on neither, and in principle on both.
//
// Sorting the ink into "light" or "dark" instead got the middle of the range
// wrong in both directions at once. Horjul's orange has no dark pixel, so it
// counted as light ink: it was boxed on the dark card, where all of it
// already cleared 3:1, and left bare on white, where none of it did.
//
// Both chips are the same pair of neutrals, so the cases read as one
// treatment rather than as two different components. Neither can be a themed
// token: a chip exists to disagree with the card it is on.
//
// The padding and the border box are on the base class and are drawn whether
// or not a chip is filled, so a mark keeps its exact position when the theme
// flips. Only the colour is conditional, which is what keeps this CSS-only.
//
// The negative margin cancels the padding exactly, so the mark itself sits
// flush with the card's text column and a chip grows outward from it rather
// than pushing it in. Padding alone indented every mark by the chip's padding,
// including the ones that never draw a chip, and the whole wall stood 6px
// right of the shelter name under it. A filled shape wanting to sit a little
// proud of a flat edge is the usual optical correction, so the marks that do
// draw a chip are the ones it is right for.
const CHIP_BASE =
  "-m-1.5 inline-flex items-center justify-center rounded-ui border border-transparent p-1.5";

// Pale ink on the white card: a dark chip, spelled off again in dark mode.
// Off rather than merely not on, or the plate stays painted over a card that
// is darker than it and draws exactly the box this design exists to remove.
const CHIP_ON_LIGHT =
  "border-white/15 bg-neutral-800 dark:border-transparent dark:bg-transparent";

// Dark ink on the dark card: a light chip, in dark mode only. Written after
// CHIP_ON_LIGHT at the call site so that a mark wanting both gets this one in
// dark mode, which is the pair tailwind-merge keeps.
const CHIP_ON_DARK = "dark:border-black/10 dark:bg-neutral-100";

/** The pixel box a logo is drawn in, from the cached copy's own dimensions.
 *
 *  Height first, from the falloff, then the width that ratio implies; if that
 *  runs past the width cap the width wins and the height is taken back down to
 *  match. Both come out exact, so the mark is never letterboxed inside a box
 *  larger than itself and never squashed to fit one smaller. */
function markBox(logo: ShelterLogo, size: keyof typeof SIZE) {
  const { height: base, maxHeight, maxWidth } = SIZE[size];
  const ratio = logo.width / logo.height;

  let height = Math.min(base / ratio ** WIDTH_FALLOFF, maxHeight);
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

// The avatar the initial-letter fallback is drawn in.
//
// Six of the seventeen shelters in the register have not granted us their
// logo, and we do not take one without a grant. What stands in for it should
// not be mistaken for a logo we do have, and the circle does that work on its
// own: every real mark on this page is a rectangle sitting on the card, so a
// filled round plate is plainly a stand-in rather than somebody's wordmark.
//
// A drawn pen ring stood here first and was too much personality for the job.
// This is the avatar shape the rest of the web uses, in the site's own muted
// tokens: bg-muted behind muted-foreground, one border for an edge, because
// --muted is oklch(0.97) against a white card and a borderless plate has 1.06:1
// to hold itself with.
const FALLBACK_PLATE = "border-border bg-muted text-muted-foreground";

// Green says one thing on this site. See the accent prop.
const FALLBACK_ACCENT =
  "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]";

/**
 * A shelter's mark, or a drawn stand-in where we have no right to one.
 *
 * Logos are read from the ingest manifest at build time (see
 * lib/shelter-logos.ts), so a shelter without one never risks a 404. The
 * letter comes from lib/shelter-initial.ts rather than from the head of the
 * name, because half the register opens with "Zavetišče": every call site gets
 * that by passing the name it already passes.
 */
export function ShelterAvatar({
  name,
  logo,
  size = "sm",
  accent = false,
}: {
  name: string;
  logo: ShelterLogo | undefined;
  size?: keyof typeof SIZE;
  /** Paint the fallback avatar in the site's provider green. Only true where
   *  the shelter actually shares an animal list: green says that one thing
   *  everywhere on this site, so a plate wearing it on a contact-only shelter
   *  claimed something false. A shelter with a logo is unaffected, since a
   *  real mark carries its own colour. */
  accent?: boolean;
}) {
  const { row } = SIZE[size];

  // The row, not the mark, is what every caller is really placing. Fixed
  // height, contents pinned left, so a column of these agrees on where the
  // next line starts without any of the marks agreeing on anything.
  //
  // min-w-0 rather than shrink-0, so a row that somehow runs out of space
  // gives it up here rather than pushing whatever shares the line off the
  // card. Nothing narrower is styled for: the caps are measured against the
  // narrowest card the register draws and every width from 320 up was checked
  // against them.
  //
  // The mark inside carries no max-width of its own. It had one, and it cost
  // the widest marks 12px each: a percentage max-width on the image resolves
  // against a chip whose own width is resolved from the image, and the browser
  // settles that loop by taking the chip's padding off twice. The drawn box is
  // exact or it is not worth computing.
  const inRow = (mark: ReactNode) => (
    <span className={cn("flex min-w-0 items-center", row)}>{mark}</span>
  );

  if (logo) {
    const box = markBox(logo, size);
    return inRow(
      <span
        className={cn(
          CHIP_BASE,
          logo.chipOnLight && CHIP_ON_LIGHT,
          logo.chipOnDark && CHIP_ON_DARK,
        )}
      >
        <Image
          src={logo.url}
          alt=""
          // The cached copy's own dimensions, so the intrinsic ratio is the
          // file's; the style is the drawn box markBox worked out.
          width={logo.width}
          height={logo.height}
          // A mark that brings its own background is a plate already, and a
          // square-cornered one reads as an unfinished image sitting on the
          // card rather than as part of it. Rounding it is the whole
          // treatment: it never takes a chip, because the rectangle a chip
          // would draw is the one the file already has.
          className={cn(logo.opaque && "rounded-ui")}
          style={{ width: box.width, height: box.height }}
        />
      </span>,
    );
  }

  // aria-hidden, because the letter is cut from the shelter's own name, which
  // is printed beside it: read out, it is the name's first letter and then the
  // name.
  return inRow(
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full border font-medium",
        accent ? FALLBACK_ACCENT : FALLBACK_PLATE,
        SIZE[size].fallback,
      )}
    >
      {shelterInitial(name)}
    </span>,
  );
}
