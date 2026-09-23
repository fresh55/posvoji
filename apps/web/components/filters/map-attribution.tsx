import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Shared creator, licence and source link for every map using these boundaries. */
export function BoundariesCredit({
  className,
  newWindow,
}: {
  className?: string;
  newWindow?: string;
} = {}) {
  return (
    <>
      <a
        href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
        className={cn("pointer-events-auto underline underline-offset-2 hover:text-foreground", className)}
        target="_blank"
        rel="noreferrer"
      >
        GURS
        {newWindow && <span className="sr-only"> {newWindow}</span>}
      </a>
      , CC BY 4.0.
    </>
  );
}

/**
 * Keep source names and licences visible at every width, off the plate: over
 * the map, the credit sat on the coast with the sea's name and a marker in the
 * same corner. A quiet footnote line by default; a card with larger text and
 * touch targets where the credit closes a figure of its own.
 */
export function MapAttribution({
  messages,
  variant = "footnote",
  className,
}: {
  messages: Pick<Messages, "regionBoundaries" | "reliefSource" | "newWindow">;
  variant?: "footnote" | "card";
  className?: string;
}) {
  const card = variant === "card";
  const linkClassName = card
    ? "inline-flex min-h-6 items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    : undefined;
  return (
    <p
      data-slot="map-attribution"
      className={cn(
        "text-muted-foreground",
        card
          ? "relative mt-2 rounded-ui border-t bg-card px-2 py-1 text-xs leading-relaxed"
          : "text-3xs leading-tight",
        className,
      )}
    >
      <span className="max-lg:hidden">{messages.regionBoundaries}: </span>
      <BoundariesCredit className={linkClassName} newWindow={messages.newWindow} />{" "}
      <span className="max-lg:hidden">{messages.reliefSource}: </span>
      <a
        href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
        className={cn("underline underline-offset-2 hover:text-foreground", linkClassName)}
        target="_blank"
        rel="noreferrer"
      >
        Terrain Tiles
        <span className="sr-only"> {messages.newWindow}</span>
      </a>
      <span className="max-lg:hidden"> (AWS Open Data)</span>, SRTM / NASA.
    </p>
  );
}
