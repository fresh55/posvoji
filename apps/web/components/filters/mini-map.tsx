import { memo, useMemo, type CSSProperties } from "react";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import {
  DENSITY_STEPS,
  layoutTowns,
  groupTownsByRegion,
  mapStateName,
  regionStatsByRegion,
  type ShelterPin,
} from "@/lib/map-layout";
import { OUTLINE_PATH, REGION_PATHS } from "@/lib/map-regions";
import { cn } from "@/lib/utils";

// A live preview of the real map, drawn at trigger-icon size (roughly 20-28px
// wide). Nothing survives that size except the silhouette and the density
// tint, so this draws only the twelve region shapes and the country outline:
// no markers, no relief, no sea, no neighbours, no furniture. Every one of
// those reads as texture on the big plate and as dirt on an icon.
//
// Same viewBox as ShelterMap (320 x 210, lib/geo.ts), so a region shape drawn
// here and drawn there is the same path with no cropping or rescaling to keep
// in sync.
const COUNTRY_OUTLINE = OUTLINE_PATH;

// The outline's own stroke, heavy enough to survive shrinking to icon size the
// same way the old trigger glyph's did.
const OUTLINE_STROKE_WIDTH = 9;

function MiniMapImpl({
  pins,
  selected,
  className,
}: {
  pins: ShelterPin[];
  selected: string[];
  className?: string;
}) {
  // Same density computation the big map draws from (lib/map-layout.ts), so
  // this preview can never disagree with the map it is a preview of.
  const regions = useMemo(() => {
    const { byRegion } = groupTownsByRegion(layoutTowns(pins));
    return regionStatsByRegion(byRegion, selected);
  }, [pins, selected]);

  // With no pins every region comes back inert, which is twelve paths and
  // 2200 vertices painting one flat tint whose union is exactly the outline
  // drawn on top of them. The homepage prerenders one of these as a place
  // mark beside the found-animal button, where those paths measured 25KB of
  // the 35KB that instance put in the HTML. Collapsing them onto the outline
  // is the same picture: the boundary is derived from these shapes by parity
  // (map-regions.ts), so what it encloses is their union, and it loses the
  // antialias seams the twelve abutting fills leave behind.
  const bare = pins.length === 0;

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      {!bare &&
        regions.map(({ region, stats }) => {
          const stateName = mapStateName(stats.state, stats.live);
          return (
            <path
              key={region.id}
              d={REGION_PATHS.get(region.id) ?? ""}
              data-minimap-region-state={stateName}
              data-minimap-region-density={
                stateName === "idle" ? stats.density : undefined
              }
              style={
                stateName === "idle"
                  ? ({
                      "--map-density": DENSITY_STEPS[stats.density],
                    } as CSSProperties)
                  : undefined
              }
              className={cn(
                stateName === "inert" && "fill-foreground/5",
                stateName === "idle" &&
                  "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density)]",
                // A region wears the selection green whether it is fully or
                // partly picked. A mixed region hatches on the real map, but a
                // diagonal hatch at a few pixels across is not a pattern, it
                // is noise; the same accent fill both states wear on the big
                // map's hover look is the honest answer at this size.
                (stateName === "selected" || stateName === "mixed") &&
                  "fill-[var(--filter-accent-strong)]",
              )}
            />
          );
        })}
      <path
        d={COUNTRY_OUTLINE}
        strokeWidth={OUTLINE_STROKE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={cn(
          "stroke-current",
          // Carries the inert tint itself when the regions are not drawn, so
          // a pinless map is the same flat silhouette with one path instead
          // of thirteen.
          bare ? "fill-foreground/5" : "fill-none",
        )}
      />
    </svg>
  );
}

// Twelve static paths recomputed from pins and selected alone, so a toolbar
// re-render that changes neither leaves this out of the work entirely.
export const MiniMap = memo(MiniMapImpl);
