import { EmptyMarkerGlyph } from "@/components/filters/map-marker";
import { OriginGlyph } from "@/components/filters/map-callout";
import type { LatLon } from "@/lib/geo";
import type { Messages } from "@/lib/i18n";
import { DENSITY_STEPS } from "@/lib/map-layout";
import { cn } from "@/lib/utils";

const LEGEND_SWATCH_GROUND =
  "color-mix(in oklch, var(--muted) 40%, var(--background))";

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
  highlightedDensity,
  onHoverDensity,
  onLeaveDensity,
  hasSelectedRegion,
  hasMixedRegion,
  hasEmptyMarker,
  origin,
  messages,
}: {
  highlightedDensity: number | null;
  onHoverDensity: (index: number) => void;
  onLeaveDensity: () => void;
  /** At least one region is fully picked right now, so the solid selection
   *  green is on the map and needs telling apart from the density ramp. */
  hasSelectedRegion: boolean;
  /** At least one region is partly picked right now, so the hatch on the map
   *  is a state worth naming. */
  hasMixedRegion: boolean;
  /** At least one shelter with nothing listed is drawn as a hollow circle right
   *  now. The row itself decides at which widths that is worth saying: see it
   *  below. */
  hasEmptyMarker: boolean;
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
  return (
    <div
      data-map-legend
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-3xs leading-none text-muted-foreground lg:gap-x-4 lg:gap-y-1.5 lg:text-2xs"
    >
      <span className="flex items-center gap-2">
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
              {/* Two layers, not one. A region's fill composites over the
                  land it sits on, not over whatever happens to be behind the
                  legend; painting the ramp's alpha straight onto this panel
                  used its own near-black dark background as the ground
                  instead, which is darker than the land the map actually
                  uses and compressed all five steps into the same corner of
                  the scale. The underlay is LEGEND_SWATCH_GROUND, the
                  opaque stand-in for that land; the map's own ink and alpha
                  ride on top of it unchanged, --map-density-fill at the
                  DENSITY_STEPS opacity. */}
              <span
                className={cn(
                  "relative block size-2 overflow-hidden rounded-[2px] transition-shadow",
                  highlightedDensity === index && "ring-1 ring-foreground/30",
                )}
                style={{ backgroundColor: LEGEND_SWATCH_GROUND }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[var(--map-density-fill)]"
                  style={{ opacity }}
                />
              </span>
            </span>
          ))}
        </span>
        <span>{messages.moreAnimals}</span>
      </span>
      {/* The solid selection green, the moment a region first wears it. The
          ramp and the selected state share one hue on purpose, so the legend
          has to say which green is the answer the visitor gave: without this
          row a first-timer can read the darkest density step as "already
          picked" and nothing on the map corrects them. Both variants, because
          regions are selectable on phones too. */}
      {hasSelectedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)] bg-[var(--map-selected-fill)]"
          />
          {messages.selectedRegionLegend}
        </span>
      )}
      {/* The hatch a mixed/partly-selected region gets on the map, at legend
          size. Only while such a region exists, which is the moment the hatch
          first appears: the row teaches the pattern as it is made, rather than
          describing a state the map is not in. Both variants, because regions
          and their partial selection exist on phones too. */}
      {hasMixedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--filter-accent-strong) 0 1px, var(--filter-accent) 1px 4px)",
            }}
          />
          {messages.mixedRegionLegend}
        </span>
      )}
      {/* The hollow circle a shelter with no animals listed gets. Every other
          mark on the map either answers on hover or earns a row here the
          moment it appears; this one is too small to aim a pointer at, so the
          callout never gets asked and the row is the only way to learn it.
          The glyph comes from map-marker.tsx, drawn from the same classes and
          the same radius-to-stroke proportion the real circle uses.

          This row follows the markers and not the docks, and it follows them
          through the map's own answer rather than through a breakpoint that
          guesses at it. max-md:hidden used to be what kept the row off a
          phone; it also kept it off a tablet that draws markers, and left it
          standing on a landscape phone that does not. */}
      {hasEmptyMarker && (
        <span className="flex items-center gap-1.5">
          <EmptyMarkerGlyph className="size-3.5 shrink-0" />
          {messages.emptyShelterLegend}
        </span>
      )}
      {/* Only once there is a point to explain. The ring repeats the dashed
          circle the map draws at the origin, at legend size. */}
      {origin && (
        <span className="flex items-center gap-1.5">
          <OriginGlyph className="size-4 shrink-0" />
          {messages.originLegend}
        </span>
      )}
    </div>
  );
}
