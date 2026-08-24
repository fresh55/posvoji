import type { AdoptionStatus } from "@posvoji/schema";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

// One badge, three surfaces. The grid card, the dialog and the animal page all
// answer the same question and used to answer it three different ways: an
// amber text-xs pill in the dialog, two amber text-2xs pills on the card that
// did not match it or each other, and a plain neutral pill on the animal page
// with no amber at all.
//
// Available is the default state and needs no badge; the badge is for the
// exceptions worth calling out. Unknown is an animal the shelter's own listing
// still carries, so it reads as available and stays silent too. Both of those
// live here rather than as an inline condition at each call site, which is how
// the three of them drifted apart in the first place.
type NamedStatus = Exclude<AdoptionStatus, "unknown" | "available">;

// Reserved is a maybe and says so in the site's one warm family. Adopted and
// hold are over, and go quiet.
const TONE: Record<NamedStatus, string> = {
  reserved:
    "border-[var(--status-warn-border)] bg-[var(--status-warn)] text-[var(--status-warn-foreground)]",
  adopted: "border-transparent bg-muted text-muted-foreground",
  hold: "border-transparent bg-muted text-muted-foreground",
};

// On a photograph the wash has nothing to sit on. A 15% fill tints an
// arbitrary backdrop rather than covering it, and backdrop-blur takes out
// detail without moving luminance, so amber ink over a mid-tone photo was
// 1.38:1. The overlay brings its own opaque ground instead.
const OVERLAY_TONE: Record<NamedStatus, string> = {
  reserved:
    "border-transparent bg-[var(--status-warn-solid)] text-[var(--status-warn-solid-foreground)]",
  adopted: "border-transparent bg-background text-muted-foreground",
  hold: "border-transparent bg-background text-muted-foreground",
};

export function StatusBadge({
  status,
  locale,
  /** "sm" is the grid card's tier; the dialog and the animal page take the default. */
  size = "default",
  /** Set when the badge sits on a photo rather than on the page. */
  overlay = false,
  className,
}: {
  status: AdoptionStatus;
  locale: Locale;
  size?: "default" | "sm";
  overlay?: boolean;
  className?: string;
}) {
  if (status === "available" || status === "unknown") return null;
  const label = statusLabel(status, locale);
  if (!label) return null;

  return (
    <Badge
      variant="outline"
      size={size}
      className={cn(
        overlay ? OVERLAY_TONE[status] : TONE[status],
        overlay && "shadow-xs backdrop-blur-sm",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
