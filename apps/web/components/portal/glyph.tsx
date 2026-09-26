import type { LucideIcon } from "lucide-react";
import { portalSpeciesIcon } from "@/components/portal/portal-fields";

/**
 * An icon the caller chose at render time, drawn at the portal's stroke.
 *
 * The icon is a prop rather than a component named in place: naming one there
 * would be a component created during render, which react-hooks/static-
 * components rejects because it would remount on every pass.
 */
export function Glyph({
  icon: Icon,
  className,
}: {
  icon: LucideIcon;
  className: string;
}) {
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/**
 * The square at the head of an animal's card or page: its photo, or the mark
 * of its species when it has none.
 */
export function PortalThumb({
  src,
  species,
  width,
  height,
  loading,
}: {
  src: string | null;
  species: string | null;
  /** The stored photo's own size, where the caller knows it. The box is what
   *  sizes it on screen. */
  width?: number;
  height?: number;
  loading?: "lazy";
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-ui border bg-muted/40 text-muted-foreground"
      >
        <Glyph icon={portalSpeciesIcon(species)} className="size-6" />
      </span>
    );
  }
  return (
    // A cache-permitted photo can still fall back to the shelter's own host,
    // and a listing's is served by the API, neither of which next/image knows.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={width}
      height={height}
      alt=""
      loading={loading}
      decoding="async"
      className="size-16 shrink-0 rounded-ui border bg-muted/40 object-cover"
    />
  );
}
