import type { Messages } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Shared creator, licence and source link for every map using these boundaries. */
export function BoundariesCredit({
  className,
  newWindow,
  title,
}: {
  className?: string;
  newWindow?: string;
  /** What GURS supplied, for a credit too short to say it in its text. */
  title?: string;
} = {}) {
  return (
    <>
      <a
        href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
        className={cn("pointer-events-auto underline underline-offset-2 hover:text-foreground", className)}
        target="_blank"
        rel="noreferrer"
        title={title}
      >
        GURS
        {newWindow && <span className="sr-only"> {newWindow}</span>}
      </a>
      , CC BY 4.0.
    </>
  );
}

/** The elevation model the relief is computed from, which asks to be named. */
function ReliefCredit({
  className,
  newWindow,
  title,
}: {
  className?: string;
  newWindow: string;
  /** What the source supplied, for a credit too short to say it in its text. */
  title?: string;
}) {
  return (
    <a
      href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
      className={cn("pointer-events-auto underline underline-offset-2 hover:text-foreground", className)}
      target="_blank"
      rel="noreferrer"
      title={title}
    >
      Terrain Tiles
      <span className="sr-only"> {newWindow}</span>
    </a>
  );
}

/**
 * Keep source names and licences visible at every width. A quiet footnote
 * line by default; a card with larger text and touch targets where the credit
 * closes a figure of its own.
 *
 * "corner" is the credit set on the plate itself, in its bottom right corner,
 * the way a printed or a web map carries one. That corner is Croatian ground
 * on this plate, with no marker, no region and no label in it; the bottom
 * left, where the credit once sat, holds the coast, the sea's name and the
 * Koper coin. Two short lines, names and licences only, because the corner is
 * a third of the plate wide; what each source supplied rides on its link as a
 * title. The caller positions it.
 */
export function MapAttribution({
  messages,
  variant = "footnote",
  className,
}: {
  messages: Pick<Messages, "regionBoundaries" | "reliefSource" | "newWindow">;
  variant?: "footnote" | "card" | "corner";
  className?: string;
}) {
  if (variant === "corner") {
    return (
      <p
        data-slot="map-attribution"
        className={cn(
          "pointer-events-none text-right text-3xs leading-tight text-muted-foreground",
          className,
        )}
      >
        <BoundariesCredit newWindow={messages.newWindow} title={messages.regionBoundaries} />
        <br />
        <ReliefCredit newWindow={messages.newWindow} title={messages.reliefSource} />, SRTM / NASA.
      </p>
    );
  }
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
      <ReliefCredit className={linkClassName} newWindow={messages.newWindow} />
      <span className="max-lg:hidden"> (AWS Open Data)</span>, SRTM / NASA.
    </p>
  );
}
