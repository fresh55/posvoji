import { memo, useMemo, type CSSProperties } from "react";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import {
  DENSITY_STEPS,
  layoutTowns,
  groupTownsByRegion,
  regionStatsByRegion,
  type ShelterPin,
} from "@/lib/map-layout";
import { outlinePath, regionPath } from "@/lib/map-regions";
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
const COUNTRY_OUTLINE = outlinePath();

// The outline's own stroke, heavy enough to survive shrinking to icon size the
// same way the old trigger glyph's did.
const OUTLINE_STROKE_WIDTH = 9;

// A region wears the selection green whether it is fully or partly picked. A
// mixed region hatches on the real map, but a diagonal hatch at a few pixels
// across is not a pattern, it is noise; the same accent fill both states wear
// on the big map's hover look is the honest answer at this size.
function regionFill(state: boolean | "mixed", density: number): CSSProperties {
  if (state !== false) {
    return {};
  }
  return {
    "--map-density": DENSITY_STEPS[density],
  } as CSSProperties;
}

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

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      className={cn("shrink-0", className)}
      aria-hidden
      focusable="false"
    >
      {regions.map(({ region, stats }) => {
        const stateName = stats.live
          ? stats.state === true
            ? "selected"
            : stats.state === "mixed"
              ? "mixed"
              : "idle"
          : "inert";
        return (
          <path
            key={region.id}
            d={regionPath(region)}
            data-minimap-region-state={stateName}
            data-minimap-region-density={
              stateName === "idle" ? stats.density : undefined
            }
            style={
              stateName === "idle"
                ? regionFill(stats.state, stats.density)
                : undefined
            }
            className={cn(
              stateName === "inert" && "fill-foreground/5",
              stateName === "idle" &&
                "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density)]",
              // Selected and mixed share one look: the selection green. See
              // the comment on regionFill above.
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
        className="fill-none stroke-current"
      />
    </svg>
  );
}

// Twelve static paths recomputed from pins and selected alone, so a toolbar
// re-render that changes neither leaves this out of the work entirely.
export const MiniMap = memo(MiniMapImpl);
