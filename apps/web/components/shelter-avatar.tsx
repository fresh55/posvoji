import Image from "next/image";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";

// A logo is fitted by height and centred in a chip of a fixed width, because
// shelter logos are mostly wordmarks: forcing one into a square would shrink
// it to an unreadable strip, and letting the chip take its width from the
// logo made the chip a different width on every card. In the shelters grid
// that put the seventeen names at as many starting positions, and the ones
// beside the widest wordmarks lost enough room to be cut mid-word.
//
// The fallback letter is drawn on the same box rather than on a square, for
// the same reason: a square tile beside a 112px chip is the alignment problem
// again, six cards' worth of it. The letter is centred, so it reads as a
// nameplate rather than as a stretched avatar.
const SIZE_CLASS = {
  // For chip-scale placements where sm's 44px chip crowds a compact card.
  xs: { chip: "h-9 w-24 px-1.5", logo: "h-6", fallback: "h-9 w-24 text-sm" },
  sm: { chip: "h-11 w-28 px-2", logo: "h-7", fallback: "h-11 w-28 text-base" },
  lg: {
    chip: "h-14 w-36 px-2.5",
    logo: "h-9",
    fallback: "h-14 w-36 text-lg",
  },
} as const;

// Shelters draw their logo for their own site's background, so the ink is
// white about as often as it is black. The chip is keyed to the ink the
// fetcher measured rather than to the page theme, which is what keeps a white
// wordmark visible in light mode and a black one visible in dark mode.
const TONE_CLASS = {
  dark: "border-black/10 bg-white",
  light: "border-white/15 bg-neutral-900",
} as const;

// Logos are read from the ingest manifest at build time (see
// lib/shelter-logos.ts), so a shelter without one never risks a 404: it gets
// an initial-letter avatar instead.
export function ShelterAvatar({
  name,
  logo,
  size = "sm",
}: {
  name: string;
  logo: ShelterLogo | undefined;
  size?: keyof typeof SIZE_CLASS;
}) {
  if (logo) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-ui border",
          SIZE_CLASS[size].chip,
          TONE_CLASS[logo.tone],
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
      </span>
    );
  }

  // Neutral, not the selection green it used to borrow. An initial letter says
  // which shelter this is and nothing else, and identity is the grey tier of
  // the badge grammar; the green tiers are for a filter the visitor switched
  // on and for a fact that has been checked.
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-ui border bg-muted font-medium text-muted-foreground",
        SIZE_CLASS[size].fallback,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
