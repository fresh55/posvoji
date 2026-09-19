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
 * Keep source names and licences visible at every width. The opaque card
 * background keeps small text readable over terrain in both themes.
 * In overlay mode, only the links intercept taps; the map stays interactive.
 */
export function MapAttribution({
  messages,
  inFlow = false,
}: {
  messages: Pick<Messages, "regionBoundaries" | "reliefSource" | "newWindow">;
  /** Place credits below the map with larger text and touch targets. */
  inFlow?: boolean;
}) {
  const linkClassName = inFlow
    ? "inline-flex min-h-6 items-center pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    : undefined;
  return (
    <p
      data-slot="map-attribution"
      className={cn(
        "rounded-ui bg-card text-muted-foreground",
        inFlow
          ? "relative mt-2 border-t px-2 py-1 text-xs leading-relaxed"
          : "pointer-events-none absolute bottom-0 left-0 max-w-[26rem] px-1.5 py-0.5 text-3xs leading-tight",
      )}
    >
      <span className="max-lg:hidden">{messages.regionBoundaries}: </span>
      <BoundariesCredit className={linkClassName} newWindow={messages.newWindow} />{" "}
      <span className="max-lg:hidden">{messages.reliefSource}: </span>
      <a
        href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
        className={cn("pointer-events-auto underline underline-offset-2 hover:text-foreground", linkClassName)}
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
