import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "size-11 text-base",
  lg: "size-14 text-lg",
} as const;

// Logos are static files, listed at build time (see lib/shelter-logos.ts), so
// a shelter without one never risks a 404: it gets an initial-letter avatar
// instead, same as the animal dialog's shelter block.
export function ShelterAvatar({
  name,
  id,
  hasLogo,
  size = "sm",
}: {
  name: string;
  id: string;
  hasLogo: boolean;
  size?: keyof typeof SIZE_CLASS;
}) {
  if (hasLogo) {
    return (
      <Image
        src={`/shelter-logos/${id}.svg`}
        alt=""
        width={56}
        height={56}
        className={cn("shrink-0 rounded-ui object-contain", SIZE_CLASS[size])}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-ui border border-[var(--filter-accent-border)] bg-[var(--filter-accent)] font-medium text-[var(--filter-accent-foreground)]",
        SIZE_CLASS[size],
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
