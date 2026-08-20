import Image from "next/image";
import type { ShelterLogo } from "@/lib/shelter-logos";
import { cn } from "@/lib/utils";

// A logo is fitted by height and allowed to run wide, because shelter logos
// are mostly wordmarks: forcing one into the square the fallback uses would
// shrink it to an unreadable strip. The fallback letter stays square.
const SIZE_CLASS = {
  sm: { chip: "h-11 max-w-28 px-2", logo: "h-7", fallback: "size-11 text-base" },
  lg: {
    chip: "h-14 max-w-36 px-2.5",
    logo: "h-9",
    fallback: "size-14 text-lg",
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

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] font-medium text-[var(--filter-accent-foreground)]",
        SIZE_CLASS[size].fallback,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
