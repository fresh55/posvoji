"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { memo, useMemo, type CSSProperties } from "react";
import type { Celebration } from "@/components/filters/use-filter-motion";
import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import {
  DENSITY_STEPS,
  layoutTowns,
  groupTownsByRegion,
  mapStateName,
  mergeTownDots,
  regionStatsByRegion,
  type ShelterPin,
} from "@/lib/map-layout";
import { MINI_OUTLINE_PATH, MINI_REGION_PATHS } from "@/lib/map-regions";
import { cn } from "@/lib/utils";

// A live preview of the real map, drawn at trigger-icon size (roughly 20-28px
// wide) by the toolbar and the picker's own trigger, and as a full-width strip
// (roughly 56-80px tall) by the Kje row. Nothing survives icon size except the
// silhouette and the density tint, so this draws only the twelve region shapes
// and the country outline: no markers, no relief, no sea, no neighbours, no
// furniture. Every one of those reads as texture on the big plate and as dirt
// on an icon; the strip is the same drawing, just given more room to read in.
//
// The strip does earn two things the glyph cannot carry, and asks for them by
// name with detail="plate": a hairline seam between abutting regions, and a
// dot per shelter town. Both are drawn from the same layout the dialog's map
// uses. Everything else on that map (markers, relief, sea, neighbours,
// furniture) stays off at every size.
//
// Same viewBox as ShelterMap (320 x 210, lib/geo.ts), so a region shape drawn
// here and drawn there needs no cropping or rescaling to keep in sync. The
// paths themselves are the thinned set (MINI_REGION_PATHS): the same shapes at
// the only resolution that survives 24px.

// The outline's own stroke, heavy enough to survive shrinking to icon size the
// same way the old trigger glyph's did. It scales with the same transform as
// the region shapes, so a caller drawing this big must hand in a thinner one:
// nine units is a hairline at 20px and a marker pen at 96px.
const OUTLINE_STROKE_WIDTH = 9;

// How long the freshest pick's region flashes before settling into its normal
// selected fill. Kept short: it is a brief tint, not a scene.
const CELEBRATION_PULSE_SECONDS = 0.6;

// Everything below here is drawn at plate detail only. At icon size a seam is
// a fifth of a pixel and a town dot is smaller than that, so both would land
// as dirt on the glyph rather than as anything readable. The plate draws the
// same paths at roughly five times the size and has the room.

// The knockout between two abutting regions, in viewBox units. Two neighbours
// on the same density step used to merge into one blob, and two selected
// neighbours were split by whatever crack antialiasing happened to leave; both
// are the same missing line. Each region strokes its own boundary, so a shared
// edge is painted twice over the same line and still measures one width
// across: 1.25 units is 0.57px at the 96px plate, a hairline that holds on a
// retina panel and never thickens into a drawn border.
const SEAM_STROKE_WIDTH = 1.25;

// A shelter town, in viewBox units. 2.8 draws 2.6px across at the plate's
// scale of 0.46 px per unit, which is a dot the eye finds without it becoming
// a marker the finger wants to press. There is nothing to press: the whole
// plate is one button into the map.
const TOWN_DOT_RADIUS = 2.8;

// How close two dots may sit before they are one dot. Three radii, so a pair
// keeps half a dot of clear ground between them or stops pretending to be two.
// At the plate's scale that is 3.8px between centres against a 2.6px dot. The
// live roster's tightest pair (Celje and Dramlje) lays out 14.5 units apart
// and is never touched; see mergeTownDots for what this is really guarding.
const TOWN_DOT_MERGE_DISTANCE = TOWN_DOT_RADIUS * 3;

// A hundredth of a viewBox unit is a two-hundredth of a pixel at plate size,
// so a dot's full float buys nothing and costs the prerendered page a dozen
// characters per town.
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function MiniMapImpl({
  pins,
  selected,
  celebration,
  outlineWidth = OUTLINE_STROKE_WIDTH,
  detail = "icon",
  className,
}: {
  pins: ShelterPin[];
  selected: string[];
  /** The shelter that just landed a new pick, if any. Its region gets a
   *  one-shot tint pulse; every other consumer of this component leaves it
   *  out and never sees the flash. Comes from the same
   *  useOneShotCelebration a card section would use, so a repeated pick
   *  still restarts the gesture even when the value repeats. */
  celebration?: Celebration<string> | null;
  /** In viewBox units. The default suits icon size; the Kje strip draws the
   *  same paths five times larger and hands in a thinner one. */
  outlineWidth?: number;
  /** How much drawing the size this is rendered at can carry. "icon" is the
   *  silhouette and the tint and nothing else, which is all that survives at
   *  20 to 28px. "plate" adds the seams between regions and a dot per shelter
   *  town: detail that reads at 96px and would be dirt below it. */
  detail?: "icon" | "plate";
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Kept apart from the stats fold below because the celebration lookup needs
  // the towns and the region lookup on their own, not folded into stats.
  const towns = useMemo(() => layoutTowns(pins), [pins]);
  const { byRegion, regionIdByTownKey } = useMemo(
    () => groupTownsByRegion(towns),
    [towns],
  );
  // Same density computation the big map draws from (lib/map-layout.ts), so
  // this preview can never disagree with the map it is a preview of.
  const regions = useMemo(
    () => regionStatsByRegion(byRegion, selected),
    [byRegion, selected],
  );

  // Which region the freshest pick sits in. A shelter with no town on the map
  // (nothing resolves off its city) or a stale celebration value from a
  // roster that has since changed both come back null, and null draws no
  // flash rather than guessing at one.
  const celebratingRegionId = useMemo(() => {
    if (!celebration) return null;
    const town = towns.find((candidate) =>
      candidate.shelters.some((shelter) => shelter.value === celebration.value),
    );
    return town ? (regionIdByTownKey.get(town.key) ?? null) : null;
  }, [celebration, towns, regionIdByTownKey]);

  // With no pins every region comes back inert, which is twelve paths and
  // 2200 vertices painting one flat tint whose union is exactly the outline
  // drawn on top of them. The homepage prerenders one of these as a place
  // mark beside the found-animal button, where those paths measured 25KB of
  // the 35KB that instance put in the HTML. Collapsing them onto the outline
  // is the same picture: the boundary is derived from these shapes by parity
  // (map-regions.ts), so what it encloses is their union, and it loses the
  // antialias seams the twelve abutting fills leave behind.
  const bare = pins.length === 0;
  const plate = detail === "plate";

  // One dot per shelter town, at the position the dialog's own marker takes,
  // so the plate and the map it previews put the same town in the same place.
  // Off-site towns are in here too: nothing about them is selectable, so they
  // can never be picked and always draw the quiet dot, which is the truth
  // about them. Only computed at plate detail, where they are drawn.
  const dots = useMemo(() => {
    if (!plate || bare) return [];
    return mergeTownDots(
      towns.map((town) => ({
        key: town.key,
        x: town.x,
        y: town.y,
        selected: town.shelters.some((shelter) =>
          selected.includes(shelter.value),
        ),
      })),
      TOWN_DOT_MERGE_DISTANCE,
    );
  }, [plate, bare, towns, selected]);

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
              d={MINI_REGION_PATHS.get(region.id) ?? ""}
              // The seam. Drawn in the ground's own colour rather than in ink,
              // because what is wanted is the joint between two tiles, not a
              // border drawn around each one: the big map has internal borders
              // and at a fifth of its size they close the country up. Round
              // joins so a sharp vertex in the thinned outline cannot throw a
              // spike out past the country's edge.
              {...(plate
                ? {
                    strokeWidth: SEAM_STROKE_WIDTH,
                    strokeLinejoin: "round" as const,
                  }
                : {})}
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
                plate && "stroke-background",
              )}
            />
          );
        })}
      {/* The towns, over the fills and under the outline. Over the fills
          because a dot standing on the region it belongs to is the whole
          point of it; under the outline because a coastal town must not eat
          the country's edge. The pulse still paints last, so a fresh pick's
          flash washes over the dots in its region and they come back out of
          it: a dot punched through the flash would say "look at this town"
          when what just happened is a region being chosen. */}
      {dots.map((dot) => (
        <circle
          key={dot.key}
          cx={round(dot.x)}
          cy={round(dot.y)}
          r={TOWN_DOT_RADIUS}
          data-minimap-town-dot={dot.selected ? "selected" : "idle"}
          className={
            dot.selected
              ? // Not --filter-accent-strong: a picked town always stands on a
                // region wearing exactly that fill, so the dot would vanish
                // into it. --filter-accent-foreground is the same family's
                // ink, a step deeper on light and a step lighter on dark,
                // which clears about 1.6:1 against the selected fill in both
                // themes and stays plainly green over any density step.
                "fill-[var(--filter-accent-foreground)]"
              : // Quiet, and the same quiet for an off-site town: present,
                // findable against every step of the ramp, and never
                // competing with a pick.
                "fill-foreground/50"
          }
        />
      ))}
      <path
        d={MINI_OUTLINE_PATH}
        strokeWidth={outlineWidth}
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
      {/* The pulse: a brighter tint over the region that just landed a pick,
          fading down to nothing so what is left is the region's ordinary
          selected fill underneath. Not drawn under reduced motion, the same
          guard every other card section's celebration uses; a flash is
          exactly the kind of motion that guard exists for. LazyMotion is
          scoped this tight (one path, not the whole svg) because most renders
          of this component carry no celebration at all and have no reason to
          touch motion's runtime. */}
      {!bare && celebratingRegionId !== null && !shouldReduceMotion ? (
        <LazyMotion features={domAnimation}>
          <m.path
            key={celebration?.id}
            d={MINI_REGION_PATHS.get(celebratingRegionId) ?? ""}
            data-minimap-celebration-region={celebratingRegionId}
            aria-hidden
            className="pointer-events-none fill-[var(--filter-accent-strong)]"
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{
              duration: CELEBRATION_PULSE_SECONDS,
              ease: "easeOut",
            }}
          />
        </LazyMotion>
      ) : null}
    </svg>
  );
}

// Twelve static paths recomputed from pins, selected and celebration alone,
// so a toolbar re-render that changes none of the three leaves this out of
// the work entirely.
export const MiniMap = memo(MiniMapImpl);
