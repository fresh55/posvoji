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
const SIZE = {
  // Chip-scale placements where sm crowds a compact card.
  xs: { row: "h-9", height: 26, maxHeight: 28, maxWidth: 72, ring: 30 },
  sm: { row: "h-12", height: 34, maxHeight: 36, maxWidth: 92, ring: 38 },
  lg: { row: "h-20", height: 62, maxHeight: 66, maxWidth: 170, ring: 58 },
  // The register card. The one placement that draws every logo in the set
  // side by side, so the one placement where the falloff above is actually
  // read.
  register: { row: "h-16", height: 52, maxHeight: 54, maxWidth: 144, ring: 46 },
} as const;

// The initial's size inside the ring's 48-unit viewBox, so it grows with the
// ring but not in step with it: a letter that keeps one proportion of a 30px
// ring is a thin mark, and the same proportion of a 58px ring is a balloon.
const RING_TEXT = {
  xs: 20,
  sm: 19,
  lg: 17,
  register: 18,
} as const;

// A chip is drawn only where the mark would otherwise be ink on ink.
//
// Shelters draw their logo for their own site's background, so the ink is
// white about as often as it is black, and the page follows
// prefers-color-scheme. That is two independent facts, and the chip is needed
// for exactly one of the four combinations on each side: dark ink needs a
// light chip on a dark page, white ink needs a dark chip on a light page.
// Everywhere else the mark sits on the card with nothing behind it.
//
// Both chips are the same pair of neutrals, so the two cases read as one
// treatment rather than as two different components. Neither can be a themed
// token: a chip exists to disagree with the page it is on.
//
// The padding and the border box are on the base class and are drawn whether
// or not the chip is filled, so a mark keeps its exact position when the theme
// flips. Only the colour is conditional, which is what keeps this CSS-only.
//
// The negative margin cancels the padding exactly, so the mark itself sits
// flush with the card's text column and the chip grows outward from it rather
// than pushing it in. Padding alone indented every mark by the chip's padding,
// including the nine that never draw a chip, and the whole wall stood 6px
// right of the shelter name under it. A filled shape wanting to sit a little
// proud of a flat edge is the usual optical correction, so the two shelters
// that do draw a chip are the two it is right for.
const CHIP_BASE =
  "-m-1.5 inline-flex items-center justify-center rounded-ui border border-transparent p-1.5";

const TONE_CHIP = {
  // Black or coloured ink: bare on a light page, on a light chip in dark mode.
  dark: "dark:border-black/10 dark:bg-neutral-100",
  // White ink: on a dark chip in light mode, bare in dark mode. The chip has
  // to be spelled off again rather than merely not spelled on, or a
  // neutral-800 plate stays painted over a card that is darker than it and
  // draws exactly the box this design exists to remove.
  light:
    "border-white/15 bg-neutral-800 dark:border-transparent dark:bg-transparent",
} as const;

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

// The ring the initial-letter fallback is drawn in.
//
// Six of the seventeen shelters in the register have not granted us their
// logo, and we do not take one without a grant. What stands in for it must not
// look like a logo we do have, which is the whole trouble with the grey square
// it used to be: at a glance the six read as shelters whose mark happened to
// be a letter.
//
// A pen circle cannot be mistaken for a mark on a wall. This is one stroke,
// four quarters whose radii run from 17.0 to 20.6 so the curve never settles
// into a true circle, and rather than closing it carries on past the start and
// lays a second line beside the first, which is what a hand does. Drawn once
// here rather than imported, because it is six numbers different from a circle
// and nothing else in the site needs it.
//
// The wobble has to be this large to be seen. At half of it the ring rendered
// as a plain 46px circle, which is the default avatar of every product on the
// web and says nothing about a shelter we were not given a logo by.
const RING_PATH =
  "M22.4 5.6C33.8 5.6 43 13.2 43 22.6C43 34 35.1 43.2 25.4 43.2C14 43.2 4.8 35.1 4.8 25.2C4.8 14.4 12.7 5.6 22.4 5.6C26 6.2 29.4 7 32.6 8.6";

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
  /** Paint the fallback ring in the site's provider green. Only true where the
   *  shelter actually shares an animal list: green says that one thing
   *  everywhere on this site, so a ring wearing it on a contact-only shelter
   *  claimed something false. A shelter with a logo is unaffected, since a
   *  real mark carries its own colour. */
  accent?: boolean;
}) {
  const { row, ring } = SIZE[size];

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
      <span className={cn(CHIP_BASE, TONE_CHIP[logo.tone])}>
        <Image
          src={logo.url}
          alt=""
          // The cached copy's own dimensions, so the intrinsic ratio is the
          // file's; the style is the drawn box markBox worked out.
          width={logo.width}
          height={logo.height}
          style={{ width: box.width, height: box.height }}
        />
      </span>,
    );
  }

  return inRow(
    <svg
      aria-hidden
      width={ring}
      height={ring}
      viewBox="0 0 48 48"
      fill="none"
      // The same pull left the chip takes, for the same reason: the ring's
      // stroke sits about 4px inside its own box, so without this the six
      // shelters drawing one stood indented from the eleven drawing a mark.
      className="-ml-1 shrink-0"
    >
      <path
        d={RING_PATH}
        // The ring is filled only where it is green. Muted, it is a line and
        // nothing else: a filled grey circle is the plate this replaced.
        fill={accent ? "var(--filter-accent)" : "none"}
        stroke={
          accent ? "var(--filter-accent-border)" : "var(--muted-foreground)"
        }
        // Muted, not faint. A pen line at 0.45 read as a smudge beside marks
        // that are solid ink, and the six shelters drawing it are six of
        // seventeen: they have to hold the grid, not apologise for being in it.
        strokeOpacity={accent ? 1 : 0.6}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <text
        // The ring's own centre, which is not the viewBox's: the wobble puts
        // it about a unit up and left of 24, and a letter centred on 24 sat
        // visibly low in it.
        x="23.9"
        y="24.6"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={RING_TEXT[size]}
        fontWeight={500}
        fill={
          accent
            ? "var(--filter-accent-foreground)"
            : "var(--muted-foreground)"
        }
      >
        {shelterInitial(name)}
      </text>
    </svg>,
  );
}
