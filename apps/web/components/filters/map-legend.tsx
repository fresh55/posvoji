import { EmptyMarkerGlyph } from "@/components/filters/map-marker";
import { OriginGlyph } from "@/components/filters/map-callout";
import type { LatLon } from "@/lib/geo";
import type { Messages } from "@/lib/i18n";
import { DENSITY_STEPS } from "@/lib/map-layout";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-context";
import { mapAvailabilityText } from "./map-availability";

const LEGEND_SWATCH_GROUND =
  "color-mix(in oklch, var(--muted) 40%, var(--background))";

/** One square of the map's region fill, at the given alpha.
 *
 *  Two layers, not one. A region's fill composites over the land it sits on,
 *  not over whatever happens to be behind the legend; painting the alpha
 *  straight onto this panel used its own near-black dark background as the
 *  ground instead, which is darker than the land the map actually uses. The
 *  underlay is LEGEND_SWATCH_GROUND, the opaque stand-in for that land; the
 *  map's own ink and alpha ride on top of it unchanged, --map-density-fill at
 *  the given opacity.
 *
 *  `className` is what the caller adds on its own account: the mixed region's
 *  dashed boundary. */
function RegionSwatch({
  opacity,
  className,
}: {
  opacity: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block size-2.5 overflow-hidden rounded-[2px]",
        className,
      )}
      style={{ backgroundColor: LEGEND_SWATCH_GROUND }}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[var(--map-density-fill)]"
        style={{ opacity }}
      />
    </span>
  );
}

/**
 * The key under the shelter map: one row for each state the plate is in and
 * only while it is in it, so the legend explains what is drawn rather than
 * everything that could be. At rest it draws nothing: a region with a shelter
 * wears one flat tint and every marker carries its own count, so there is no
 * scale to read.
 */
export function MapLegend({
  hasSelectedRegion,
  hasMixedRegion,
  hasFilteredMarker = false,
  origin,
  messages,
}: {
  /** At least one region is fully picked right now, so the solid selection
   *  green is on the map and needs telling apart from the flat tint. */
  hasSelectedRegion: boolean;
  /** At least one region is partly picked right now, so the dashed boundary
   *  is a state worth naming. */
  hasMixedRegion: boolean;
  hasFilteredMarker?: boolean;
  origin: LatLon | undefined;
  messages: Pick<
    Messages,
    "selectedRegionLegend" | "mixedRegionLegend" | "originLegend"
  >;
}) {
  const { locale } = useI18n();
  return (
    <div
      data-map-legend
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-4 text-muted-foreground empty:hidden"
    >
      {/* The solid selection green, the moment a region first wears it. The
          tint and the selected state share one hue on purpose, so the legend
          says which green is the answer the visitor gave. */}
      {hasSelectedRegion && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-brand-strong bg-[var(--map-selected-fill)]"
          />
          {messages.selectedRegionLegend}
        </span>
      )}
      {/* The dashed boundary distinguishes a partial choice without painting
          a strong pattern across the whole region. The ground under it is the
          flat tint, which is what a partly picked region is still drawn on. */}
      {hasMixedRegion && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <RegionSwatch
            opacity={DENSITY_STEPS[0]}
            className="shrink-0 border border-dashed border-brand-strong"
          />
          {messages.mixedRegionLegend}
        </span>
      )}
      {hasFilteredMarker && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <EmptyMarkerGlyph filtered className="size-3.5 shrink-0" />
          {mapAvailabilityText[locale].noMatchesLegend}
        </span>
      )}
      {/* Only once there is a point to explain. The ring repeats the dashed
          circle the map draws at the origin, at legend size. */}
      {origin && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <OriginGlyph className="size-4 shrink-0" />
          {messages.originLegend}
        </span>
      )}
    </div>
  );
}
