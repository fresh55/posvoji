import type { VariantProps } from "class-variance-authority";
import type { AdoptionStatus } from "@posvoji/schema";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { translate, type Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/labels";

// One badge, three surfaces. The grid card, the dialog and the animal page all
// answer the same question and used to answer it three different ways: an
// amber text-xs pill in the dialog, two amber text-2xs pills on the card that
// did not match it or each other, and a plain neutral pill on the animal page
// with no amber at all.
//
// Available is the default state and needs no badge; the badge is for the
// exceptions worth calling out. Unknown used to stay silent along with it, and
// read as available for exactly that reason: the shelter's own listing simply
// never answered the question, which is not the same claim "available" makes.
// statusLabel (lib/labels.ts) still answers undefined for "unknown" — every
// other caller of that function means "no badge for this status" by it, and
// widening it would have turned unknown into a fourth named status everywhere
// rather than the one quiet exception it is here.
type NamedStatus = Exclude<AdoptionStatus, "unknown" | "available">;

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Reserved is a maybe and says so in the site's one warm family. Adopted and
// hold are over, and go quiet. Which of the two, and whether it is the flat
// page tone or the one that carries its own ground onto a photograph, is all
// these maps decide; the colours themselves are variants in ui/badge.tsx.
const TONE: Record<NamedStatus, BadgeVariant> = {
  reserved: "warn",
  adopted: "quiet",
  hold: "quiet",
};

const OVERLAY_TONE: Record<NamedStatus, BadgeVariant> = {
  reserved: "overlay-warn",
  adopted: "overlay-quiet",
  hold: "overlay-quiet",
};

// One tier, everywhere. The grid card used to take a size="sm" of its own, so
// the same fact was 11px on a card and 12px in the dialog that card opens. The
// card is where the badge is smallest and furthest from the reader, which is
// the worst place to shave a pixel off it.
export function StatusBadge({
  status,
  locale,
  /** Set when the badge sits on a photo rather than on the page. */
  overlay = false,
  className,
}: {
  status: AdoptionStatus;
  locale: Locale;
  overlay?: boolean;
  className?: string;
}) {
  if (status === "available") return null;
  if (status === "unknown") {
    return (
      <Badge
        variant={overlay ? "overlay-quiet" : "quiet"}
        className={className}
      >
        {translate(locale, "statusUnknown")}
      </Badge>
    );
  }
  const label = statusLabel(status, locale);
  if (!label) return null;

  return (
    <Badge
      variant={overlay ? OVERLAY_TONE[status] : TONE[status]}
      className={className}
    >
      {label}
    </Badge>
  );
}
