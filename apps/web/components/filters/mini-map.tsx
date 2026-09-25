"use client";

import { domAnimation, m, useReducedMotion } from "motion/react";
import { LazyMotion } from "@/components/motion-scope";
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
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
} from "@/lib/map-layout-core";
import miniMapData from "@/lib/mini-map-data.json";
import { cn } from "@/lib/utils";

const MINI_OUTLINE_PATH = miniMapData.outline;
const CITY_REGIONS: Record<string, number | undefined> = miniMapData.cityRegions;

// Shares the full map viewBox and density calculations. Icon detail shows
// regions only; plate detail adds boundaries and shelter-town dots.
// Callers rendering a larger plate can reduce the outline width.
const OUTLINE_STROKE_WIDTH = 9;

// Brief selection feedback, disabled for reduced motion.
const CELEBRATION_PULSE_SECONDS = 0.6;

// Plate-only dimensions, in viewBox units.
const SEAM_STROKE_WIDTH = 1.25;

const TOWN_DOT_RADIUS = 2.8;

// Merge dots whose edges would nearly touch.
const TOWN_DOT_MERGE_DISTANCE = TOWN_DOT_RADIUS * 3;

// Extra precision is invisible at this size and increases prerendered HTML.
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
  /** The most recent selection; its region flashes once. */
  celebration?: Celebration<string> | null;
  /** In viewBox units. The default suits icon size. */
  outlineWidth?: number;
  /** Plate detail adds region seams and shelter-town dots. */
  detail?: "icon" | "plate";
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Flips once, a frame after mount, well behind the hydration correction
  // useAnimalFilters can still owe this plate's `selected` prop (the static
  // export's own server snapshot is empty, so a shared filtered link gains
  // its real selection a beat after the first paint -- see
  // active-filters-do-not-reorder.md). The region transition below must not
  // exist yet on the render that first shows this plate's real state, only
  // on whatever a visitor picks afterwards, and a plain mount effect cannot
  // tell those two renders apart. Same rAF-deferred gate ResultCount uses for
  // the same reason (result-count.tsx).
  const [transitionReady, setTransitionReady] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTransitionReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const towns = useMemo(() => layoutTowns(pins), [pins]);
  const { byRegion, regionIdByTownKey } = useMemo(
    () => groupTownsByRegion(towns, (at) => CITY_REGIONS[`${at.lat},${at.lon}`]),
    [towns],
  );
  // The same region statistics the big map is built from (lib/map-layout.ts),
  // so the two agree on which regions are live and picked. The thumbnail keeps
  // the density ramp the picker gave up: it has no markers to carry counts,
  // and at this size the shading is the only way it says where animals are.
  const regions = useMemo(
    () => regionStatsByRegion(byRegion, selected, miniMapData.regions),
    [byRegion, selected],
  );

  // Missing towns and stale selections produce no flash.
  const celebratingRegionId = useMemo(() => {
    if (!celebration) return null;
    const town = towns.find((candidate) =>
      candidate.shelters.some((shelter) => shelter.value === celebration.value),
    );
    return town ? (regionIdByTownKey.get(town.key) ?? null) : null;
  }, [celebration, towns, regionIdByTownKey]);

  // Empty maps need only the outline, avoiding twelve identical region fills.
  const bare = pins.length === 0;
  const plate = detail === "plate";

  // Only plate detail draws town dots, including unselectable off-site shelters.
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
              d={region.path}
              // Background-colored seams stay legible at plate size.
              strokeWidth={plate ? SEAM_STROKE_WIDTH : undefined}
              strokeLinejoin={plate ? "round" : undefined}
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
                // At icon size, both selection states use a solid fill.
                (stateName === "selected" || stateName === "mixed") &&
                  "fill-brand-strong",
                plate && "stroke-background",
                // The plate is the one instance a visitor watches settle after
                // a pick; the dock's icon and the sheet's own small glyph are
                // gone again before anyone could look this closely. Fill and
                // fill-opacity get a 200ms transition there and nowhere else,
                // so a pick that changes several regions' density at once
                // (Psi moved six of twelve) reads as a wash settling rather
                // than a repaint in one frame (D16). transitionReady keeps it
                // off for the render that first shows the plate's real state
                // and for the hydration correction right behind it; only a
                // pick after that may animate.
                plate &&
                  transitionReady &&
                  "transition-[fill,fill-opacity] duration-200 motion-reduce:transition-none",
              )}
            />
          );
        })}
      {/* Draw towns above region fills and below the outline and selection pulse. */}
      {dots.map((dot) => (
        <circle
          key={dot.key}
          cx={round(dot.x)}
          cy={round(dot.y)}
          r={TOWN_DOT_RADIUS}
          data-minimap-town-dot={dot.selected ? "selected" : "idle"}
          className={
            dot.selected ? "fill-brand-foreground" : "fill-foreground/50"
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
          bare ? "fill-foreground/5" : "fill-none",
        )}
      />
      {/* Scope motion to the selection pulse; ordinary maps need no animation. */}
      {!bare && celebratingRegionId !== null && !shouldReduceMotion ? (
        <LazyMotion features={domAnimation}>
          <m.path
            key={celebration?.id}
            d={
              miniMapData.regions.find((region) => region.id === celebratingRegionId)?.path
            }
            data-minimap-celebration-region={celebratingRegionId}
            aria-hidden
            className="pointer-events-none fill-brand-strong"
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

export const MiniMap = memo(MiniMapImpl);
