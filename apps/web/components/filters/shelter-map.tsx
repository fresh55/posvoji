"use client";

import { useMemo, useRef, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH, onMap, project, type LatLon } from "@/lib/geo";
import { PawPrint } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  layoutTowns,
  MARKER_STROKE_WIDTH,
  markerGeometry,
  townCount,
  townLabel,
  type ShelterPin,
  type Town,
} from "@/lib/map-layout";
import {
  REGION_SHAPES,
  regionAt,
  regionPath,
  type RegionShape,
} from "@/lib/map-regions";
import { animalCount, shelterCount } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type { ShelterPin } from "@/lib/map-layout";

type RegionStats = {
  values: string[];
  animals: number;
  live: boolean;
  state: boolean | "mixed";
};

function selectionState(
  values: string[],
  selected: string[],
): boolean | "mixed" {
  const selectedCount = values.filter((value) =>
    selected.includes(value),
  ).length;
  if (selectedCount === 0) return false;
  return selectedCount === values.length ? true : "mixed";
}

function getRegionStats(towns: Town[], selected: string[]): RegionStats {
  const values = towns.flatMap((town) =>
    town.shelters.map((shelter) => shelter.value),
  );
  const animals = towns.reduce((sum, town) => sum + townCount(town), 0);
  return {
    values,
    animals,
    live:
      values.length > 0 &&
      (animals > 0 || values.some((value) => selected.includes(value))),
    state: selectionState(values, selected),
  };
}

function regionDensityClass(animals: number, live: boolean): string {
  if (!live) return "fill-foreground/4";
  if (animals < 10) return "fill-foreground/14 hover:fill-foreground/18";
  if (animals < 25) return "fill-foreground/18 hover:fill-foreground/22";
  if (animals < 50) return "fill-foreground/22 hover:fill-foreground/26";
  if (animals < 100) return "fill-foreground/26 hover:fill-foreground/30";
  return "fill-foreground/30 hover:fill-foreground/34";
}

// Regions are the keyboard and narrow-screen controls; town markers add
// pointer precision when the map is large enough.
export function ShelterMap({
  pins,
  selected,
  onPick,
  origin,
}: {
  pins: ShelterPin[];
  selected: string[];
  onPick: (values: string[]) => void;
  origin?: LatLon;
}) {
  const { messages } = useI18n();
  const towns = useMemo(() => layoutTowns(pins), [pins]);
  const [hoveredTownKey, setHoveredTownKey] = useState<string | null>(null);
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
  const regionRefs = useRef(new Map<number, SVGPathElement>());
  const activeTown = towns.find((town) => town.key === hoveredTownKey);

  // Use real coordinates because collision layout may nudge a marker across a
  // region border.
  const byRegion = useMemo(() => {
    const grouped = new Map<number, Town[]>();
    for (const town of towns) {
      const region = regionAt(project(town.shelters[0].at));
      if (!region) continue;
      grouped.set(region.id, [...(grouped.get(region.id) ?? []), town]);
    }
    return grouped;
  }, [towns]);

  const regions = REGION_SHAPES.map((region) => ({
    region,
    stats: getRegionStats(byRegion.get(region.id) ?? [], selected),
  }));
  const liveRegionIds = regions
    .filter(({ stats }) => stats.live)
    .map(({ region }) => region.id);
  const tabStopRegionId =
    focusedRegionId !== null && liveRegionIds.includes(focusedRegionId)
      ? focusedRegionId
      : liveRegionIds[0];

  const moveRegionFocus = (
    currentId: number,
    key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End",
  ) => {
    const currentIndex = liveRegionIds.indexOf(currentId);
    if (currentIndex < 0) return;
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? liveRegionIds.length - 1
          : key === "ArrowLeft" || key === "ArrowUp"
            ? (currentIndex - 1 + liveRegionIds.length) % liveRegionIds.length
            : (currentIndex + 1) % liveRegionIds.length;
    const nextId = liveRegionIds[nextIndex];
    setFocusedRegionId(nextId);
    requestAnimationFrame(() => regionRefs.current.get(nextId)?.focus());
  };

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label={messages.shelterMapLabel}
      className="h-auto w-full shrink-0"
    >
      {/* Markers paint last and receive pointer clicks before regions. */}
      {regions.map(({ region, stats }) => (
        <Region
          key={region.id}
          region={region}
          stats={stats}
          onPick={onPick}
          tabIndex={region.id === tabStopRegionId ? 0 : -1}
          elementRef={(element) => {
            if (element) regionRefs.current.set(region.id, element);
            else regionRefs.current.delete(region.id);
          }}
          onFocus={() => setFocusedRegionId(region.id)}
          onMoveFocus={(key) => moveRegionFocus(region.id, key)}
        />
      ))}

      {origin && onMap(origin) && <Origin at={origin} />}

      <g className="hidden md:block">
        {towns.map((town) => (
          <Marker
            key={town.key}
            town={town}
            selected={selected}
            onPick={onPick}
            onPointerEnter={() => setHoveredTownKey(town.key)}
            onPointerLeave={() =>
              setHoveredTownKey((current) =>
                current === town.key ? null : current,
              )
            }
          />
        ))}

        {/* Keep the active tooltip above every marker. */}
        {activeTown && <MarkerTooltip town={activeTown} />}
      </g>
    </svg>
  );
}

// Empty regions remain visible but are not interactive.
function Region({
  region,
  stats,
  onPick,
  tabIndex,
  elementRef,
  onFocus,
  onMoveFocus,
}: {
  region: RegionShape;
  stats: RegionStats;
  onPick: (values: string[]) => void;
  tabIndex: 0 | -1;
  elementRef: (element: SVGPathElement | null) => void;
  onFocus: () => void;
  onMoveFocus: (
    key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End",
  ) => void;
}) {
  const { locale } = useI18n();
  const d = regionPath(region);

  if (!stats.live) {
    return (
      <path
        d={d}
        aria-hidden
        className="pointer-events-none fill-foreground/4 stroke-background [stroke-width:0.8]"
      />
    );
  }

  return (
    <path
      ref={elementRef}
      d={d}
      role="button"
      tabIndex={tabIndex}
      aria-pressed={stats.state}
      aria-label={`${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}`}
      onClick={() => onPick(stats.values)}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(stats.values);
          return;
        }
        if (
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          event.preventDefault();
          onMoveFocus(event.key);
        }
      }}
      className={cn(
        "cursor-pointer outline-none transition-[fill,stroke] motion-reduce:transition-none",
        stats.state === true
          ? "fill-foreground/42 hover:fill-foreground/45"
          : stats.state === "mixed"
            ? "fill-foreground/36 hover:fill-foreground/39"
            : regionDensityClass(stats.animals, stats.live),
        "stroke-background [stroke-width:0.8]",
        "focus-visible:stroke-foreground focus-visible:[stroke-width:1.75]",
      )}
    >
      <title>{`${region.name} · ${shelterCount(stats.values.length, locale)} · ${animalCount(stats.animals, locale)}`}</title>
    </path>
  );
}

// Exact keyboard selection stays in the list, so markers remain pointer-only.
function Marker({
  town,
  selected,
  onPick,
  onPointerEnter,
  onPointerLeave,
}: {
  town: Town;
  selected: string[];
  onPick: (values: string[]) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const shared = town.shelters.length > 1;
  const values = town.shelters.map((shelter) => shelter.value);
  const state = selectionState(values, selected);
  const live = townCount(town) > 0 || state !== false;

  const geometry = markerGeometry(town);
  const glyph = geometry.discRadius * 1.15;
  const contentColor =
    state === true
      ? "text-background"
      : state === "mixed"
        ? "text-foreground"
        : live
          ? "text-foreground/70 group-hover/pin:text-foreground"
          : "text-foreground/25";

  return (
    <g
      aria-hidden
      data-marker-kind={shared ? "cluster" : "single"}
      data-marker-key={town.key}
      data-marker-live={live}
      data-marker-state={
        state === true ? "selected" : state === "mixed" ? "mixed" : "idle"
      }
      onClick={() => live && onPick(values)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "group/pin",
        live ? "cursor-pointer" : "pointer-events-none",
      )}
    >
      {/* The hit area grows into free space without covering another marker. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.hitR}
        className="fill-transparent"
      />

      {shared ? (
        <ClusterMarker town={town} state={state} live={live} />
      ) : (
        <>
          <circle
            cx={town.x}
            cy={town.y}
            r={geometry.discRadius}
            className={cn(
              "transition-colors motion-reduce:transition-none",
              state === true
                ? "fill-foreground stroke-foreground"
                : live
                  ? "fill-background stroke-foreground/70 group-hover/pin:stroke-foreground"
                  : "fill-background stroke-foreground/25",
            )}
            style={{ strokeWidth: MARKER_STROKE_WIDTH }}
          />
          <PawPrint
            x={town.x - glyph / 2}
            y={town.y - glyph / 2}
            width={glyph}
            height={glyph}
            fill="currentColor"
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "transition-colors motion-reduce:transition-none",
              contentColor,
            )}
          />
        </>
      )}
    </g>
  );
}

function ClusterMarker({
  town,
  state,
  live,
}: {
  town: Town;
  state: boolean | "mixed";
  live: boolean;
}) {
  const { clusterOffset, clusterRadius } = markerGeometry(town);
  const glyph = clusterRadius * 1.35;
  const discs = [
    {
      x: town.x + clusterOffset,
      y: town.y - clusterOffset,
      selected: state === true || state === "mixed",
    },
    {
      x: town.x - clusterOffset,
      y: town.y + clusterOffset,
      selected: state === true,
    },
  ];

  return discs.map((disc, index) => {
    const discColor = disc.selected
      ? "fill-foreground stroke-foreground text-background"
      : live
        ? "fill-background stroke-foreground/70 text-foreground/70 group-hover/pin:stroke-foreground group-hover/pin:text-foreground"
        : "fill-background stroke-foreground/25 text-foreground/25";
    return (
      <g
        key={index}
        data-cluster-disc={disc.selected ? "selected" : "idle"}
        className={cn(
          "transition-colors motion-reduce:transition-none",
          discColor,
        )}
      >
        <circle
          cx={disc.x}
          cy={disc.y}
          r={clusterRadius}
          style={{ strokeWidth: MARKER_STROKE_WIDTH }}
        />
        <PawPrint
          x={disc.x - glyph / 2}
          y={disc.y - glyph / 2}
          width={glyph}
          height={glyph}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "transition-colors motion-reduce:transition-none",
            disc.selected ? "text-background" : "text-foreground/70",
          )}
        />
      </g>
    );
  });
}

function MarkerTooltip({ town }: { town: Town }) {
  const { locale } = useI18n();
  const title = townLabel(town);
  const metadata =
    town.shelters.length > 1
      ? `${shelterCount(town.shelters.length, locale)} · ${animalCount(townCount(town), locale)}`
      : animalCount(townCount(town), locale);
  const width = 108;
  const height = 38;
  const onRight = town.x + town.r + 4 + width <= MAP_WIDTH - 2;
  const x = onRight ? town.x + town.r + 4 : town.x - town.r - 4 - width;
  const y = Math.min(
    Math.max(town.y - height / 2, 2),
    MAP_HEIGHT - height - 2,
  );

  return (
    <foreignObject
      x={x}
      y={y}
      width={width}
      height={height}
      aria-hidden
      className={cn(
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      <div className="flex h-full flex-col justify-center rounded-md border border-border bg-popover px-[4px] py-[2px] text-popover-foreground shadow-sm">
        <span className="w-full break-words text-[5.5px] font-medium leading-[1.15]">
          {title}
        </span>
        <span className="mt-[1.5px] w-full break-words text-[4.75px] leading-[1.15] text-muted-foreground">
          {metadata}
        </span>
      </div>
    </foreignObject>
  );
}

// Dashed, so it reads as "you" rather than as one more shelter.
function Origin({ at }: { at: LatLon }) {
  const { x, y } = project(at);
  return (
    <g aria-hidden className="pointer-events-none">
      <circle
        cx={x}
        cy={y}
        r={5}
        strokeWidth={1}
        strokeDasharray="2 2"
        className="fill-none stroke-foreground opacity-70"
      />
      <circle cx={x} cy={y} r={1.75} className="fill-foreground" />
    </g>
  );
}
