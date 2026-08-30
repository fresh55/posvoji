import Image from "next/image";
import type { ReactNode } from "react";
import { shelterInitial } from "@/lib/shelter-initial";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";

// A logo is fitted by height and allowed to run wide, because shelter logos
// are mostly wordmarks: forcing one into the square the fallback uses would
// shrink it to an unreadable strip. The fallback letter stays square.
//
// xs, sm and lg are one scale, picked by how much room the placement has.
// "register" is not a fourth step on it: it is a placement, and it is named
// for the one it exists for, because what sets its numbers is not a size the
// caller wanted but the fact that the register draws every logo in the set
// side by side.
const SIZE_CLASS = {
  // For chip-scale placements where sm's 44px chip crowds a compact card, the
  // map pick card's header being the first of these.
  xs: { chip: "h-9 max-w-24 px-1.5", logo: "h-6", fallback: "size-9 text-sm" },
  sm: { chip: "h-11 max-w-28 px-2", logo: "h-7", fallback: "size-11 text-base" },
  lg: {
    chip: "h-14 max-w-36 px-2.5",
    logo: "h-9",
    fallback: "size-14 text-lg",
  },
  // sm's logo height with a plate wide enough for a wordmark, for the register
  // card, which is the only placement that draws every logo in the set side by
  // side and so the only one where their heights are compared.
  //
  // sm's plate left 64px of usable width (80px track, px-2), and a 28px-tall
  // logo wider than about 2.3:1 hit that cap and lost height instead: the four
  // widest wordmarks rendered 13px to 18px tall while a square logo rendered
  // the full 28px, so the same card drew one shelter's mark at twice another's.
  // 128px of plate with px-2 gives 112px of usable width. Nothing up to 4:1 is
  // capped at all, and the widest logo in the set (4.74:1) renders about 24px
  // rather than 13px.
  //
  // The fallback is h-12 square against a 128px logo plate, which is a wider
  // spread than sm's, so both plates take the same 48px height and read as one
  // family with the letter's own square kept.
  register: {
    chip: "h-12 max-w-32 px-2",
    logo: "h-7",
    fallback: "size-12 text-base",
  },
} as const;

// The column an avatar reserves when `track` is on, one per size. A chip is
// sized to its own logo and the eleven committed logos run from 0.82 to 4.74 in
// aspect, so chips measure 39px to 112px wide: down a grid of cards the shelter
// name after one started at eight different x-offsets. The track fixes the
// column instead, so every name starts at the same x.
//
// sm's 80px is the measured median chip; xs and lg keep the same proportion to
// their chip height, since no caller has measured them. register's 128px is not
// a median but the width the widest wordmark needs to stay readable, and it is
// the same value as that size's max-w, so the track never squeezes a plate.
const TRACK_CLASS = {
  xs: "w-16",
  sm: "w-20",
  lg: "w-24",
  register: "w-32",
} as const;

// Shelters draw their logo for their own site's background, so the ink is
// white about as often as it is black. The chip is keyed to the ink the
// fetcher measured rather than to the page theme, which is what keeps a white
// wordmark visible in light mode and a black one visible in dark mode.
//
// Neutral greys rather than white and near-black. Both plates have to hold
// their tone whatever the page theme is doing, so neither can be a themed
// token, but pure values made three different plates out of one grid: a white
// plate vanished into a light card and left a small mark floating, a
// neutral-900 plate drew a heavy black blob next to it, and the initial-letter
// fallback sat between them on bg-muted. 100 lands on the fallback's own
// weight in light mode, which is where most readers are, and 800 is a plate
// rather than a hole.
const TONE_CLASS = {
  dark: "border-black/10 bg-neutral-100",
  light: "border-white/15 bg-neutral-800",
} as const;

// Logos are read from the ingest manifest at build time (see
// lib/shelter-logos.ts), so a shelter without one never risks a 404: it gets
// an initial-letter avatar instead. The letter comes from
// lib/shelter-initial.ts rather than from the head of the name, so the plates
// down a grid of cards are different letters; every call site gets that by
// passing the name it already passes.
export function ShelterAvatar({
  name,
  logo,
  size = "sm",
  accent = false,
  track = false,
}: {
  name: string;
  logo: ShelterLogo | undefined;
  size?: keyof typeof SIZE_CLASS;
  /** Paint the letter fallback in the site's provider green. Only true where
   *  the shelter actually shares an animal list: green marks that state
   *  everywhere else, so an initial wearing it on a contact-only shelter
   *  claimed something false. A shelter with a logo is unaffected, since its
   *  chip is keyed to the logo's own ink. */
  accent?: boolean;
  /** Reserve a fixed-width column for the avatar, so a list of them starts
   *  every neighbouring line at the same x. See TRACK_CLASS. Off by default:
   *  a lone avatar beside one name has nothing to line up with, and the ragged
   *  plate is the honest width of the logo. */
  track?: boolean;
}) {
  // The one place the track is applied, so a chip and a letter cannot drift
  // into different columns.
  const inTrack = (avatar: ReactNode) =>
    track ? (
      <span className={cn("flex shrink-0 justify-center", TRACK_CLASS[size])}>
        {avatar}
      </span>
    ) : (
      avatar
    );

  if (logo) {
    return inTrack(
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-ui border",
          SIZE_CLASS[size].chip,
          TONE_CLASS[logo.tone],
          // The plate takes the whole track rather than being centred in it:
          // a flex item that is sized by its content will not shrink below
          // that content, so a wide wordmark would have overflowed the column
          // it is meant to sit in. The logo is not letterboxed to fit. It
          // keeps object-contain and w-auto inside the plate, so the widest
          // wordmarks are scaled down, never cropped and never stretched.
          track && "w-full",
        )}
      >
        <Image
          src={logo.url}
          alt=""
          // The cached copy's own dimensions, so the browser reserves the
          // right box before the file loads and nothing shifts.
          width={logo.width}
          height={logo.height}
          className={cn("w-auto max-w-full object-contain", SIZE_CLASS[size].logo)}
        />
      </span>,
    );
  }

  return inTrack(
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-ui border font-medium",
        accent
          ? "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]"
          : "border-border bg-muted text-muted-foreground",
        SIZE_CLASS[size].fallback,
      )}
    >
      {shelterInitial(name)}
    </span>,
  );
}
