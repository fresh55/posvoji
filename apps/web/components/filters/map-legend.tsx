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

/** One square of the map's density fill, at one step of the ramp.
 *
 *  Two layers, not one. A region's fill composites over the land it sits on,
 *  not over whatever happens to be behind the legend; painting the ramp's alpha
 *  straight onto this panel used its own near-black dark background as the
 *  ground instead, which is darker than the land the map actually uses and
 *  compressed all five steps into the same corner of the scale. The underlay is
 *  LEGEND_SWATCH_GROUND, the opaque stand-in for that land; the map's own ink
 *  and alpha ride on top of it unchanged, --map-density-fill at the given
 *  opacity.
 *
 *  `className` is what each caller adds on its own account: the ramp's ring
 *  while the legend is being pointed at, the mixed region's dashed boundary. */
function DensitySwatch({
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
 * The key under the shelter map: the density ramp always, and one row for each
 * state the plate is currently in and only while it is in it, so the legend
 * explains what is drawn rather than everything that could be.
 *
 * Its own file rather than a private function of the picker dialog, because
 * the map is drawn in two places now: the homepage dialog and the found-animal
 * page. The page must not import the dialog to get at a legend, since that
 * would carry the dialog, its sheet and its motion into a route that opens no
 * dialog at all.
 */
export function MapLegend({
  showDensity = true,
  highlightedDensity,
  onHoverDensity,
  onLeaveDensity,
  hasSelectedRegion,
  hasMixedRegion,
  hasEmptyMarker,
  hasFilteredMarker = false,
  origin,
  messages,
}: {
  showDensity?: boolean;
  highlightedDensity: number | null;
  onHoverDensity: (index: number) => void;
  onLeaveDensity: () => void;
  /** At least one region is fully picked right now, so the solid selection
   *  green is on the map and needs telling apart from the density ramp. */
  hasSelectedRegion: boolean;
  /** At least one region is partly picked right now, so the dashed boundary
   *  is a state worth naming. */
  hasMixedRegion: boolean;
  /** At least one shelter with nothing listed is drawn as a hollow circle right
   *  now. The row itself decides at which widths that is worth saying: see it
   *  below. */
  hasEmptyMarker: boolean;
  hasFilteredMarker?: boolean;
  origin: LatLon | undefined;
  messages: Pick<
    Messages,
    | "fewerAnimals"
    | "moreAnimals"
    | "selectedRegionLegend"
    | "mixedRegionLegend"
    | "emptyShelterLegend"
    | "originLegend"
  >;
}) {
  const { locale } = useI18n();
  return (
    <div
      data-map-legend
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs leading-4 text-muted-foreground"
    >
      {showDensity && (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span>{messages.fewerAnimals}</span>
          <span
            className="flex items-center gap-0.5"
            aria-hidden
            onPointerLeave={onLeaveDensity}
          >
            {DENSITY_STEPS.map((opacity, index) => (
              <span
                key={opacity}
                className="lg:cursor-help lg:p-0.5"
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  onHoverDensity(index);
                }}
              >
                <DensitySwatch
                  opacity={opacity}
                  className={cn(
                    "transition-shadow",
                    highlightedDensity === index && "ring-1 ring-foreground/30",
                  )}
                />
              </span>
            ))}
          </span>
          <span>{messages.moreAnimals}</span>
        </span>
      )}
      {/* The solid selection green, the moment a region first wears it. The
          ramp and the selected state share one hue on purpose, so the legend
          has to say which green is the answer the visitor gave: without this
          row a first-timer can read the darkest density step as "already
          picked" and nothing on the map corrects them. Both variants, because
          regions are selectable on phones too. */}
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
          ramp, because that is what a partly picked region is still drawn on:
          it keeps its rank until the last shelter in it is chosen. At a middle
          step, since the swatch stands for whichever region happens to be half
          picked. */}
      {hasMixedRegion && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <DensitySwatch
            opacity={DENSITY_STEPS[2]}
            className="shrink-0 border border-dashed border-brand-strong"
          />
          {messages.mixedRegionLegend}
        </span>
      )}
      {/* Match each hollow marker's stroke, including when both states occur. */}
      {hasEmptyMarker && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <EmptyMarkerGlyph className="size-3.5 shrink-0" />
          {mapAvailabilityText[locale].noListingsLegend}
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
