"use client";

import { useMemo } from "react";
import { MAP_HEIGHT, MAP_WIDTH, onMap, project, type LatLon } from "@/lib/geo";
import {
  layoutTowns,
  placeLabels,
  townCount,
  townLabels,
  wedgePath,
  REGION_LABEL_SIZE,
  TOWN_LABEL_SIZE,
  type ShelterPin,
  type Town,
} from "@/lib/map-layout";
import {
  REGION_SHAPES,
  regionAt,
  regionPath,
  type RegionShape,
} from "@/lib/map-regions";
import { ANIMAL_FORMS, plural, SHELTER_FORMS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type { ShelterPin } from "@/lib/map-layout";

// What you click is a region, not a marker: a marker sized to mean something in
// a 209px column is a 6px dot, and no tuning makes a 6px dot a target. Picking
// a region picks every shelter in it, and the list underneath is where you
// narrow that to one. The markers stay as the picture of where and how many.
export function ShelterMap({
  pins,
  busiest,
  selected,
  onPickRegion,
  origin,
  labelled = false,
}: {
  pins: ShelterPin[];
  busiest: number;
  selected: string[];
  onPickRegion: (values: string[]) => void;
  origin?: LatLon;
  labelled?: boolean;
}) {
  const towns = useMemo(() => layoutTowns(pins, busiest), [pins, busiest]);

  // Grouped by where the town really is, not by where its marker ended up: a
  // marker may be nudged a few units to stop it overlapping a neighbour, and
  // near a border that nudge could carry it into the wrong region.
  const byRegion = useMemo(() => {
    const grouped = new Map<number, Town[]>();
    for (const town of towns) {
      const region = regionAt(project(town.shelters[0].at));
      if (!region) continue;
      grouped.set(region.id, [...(grouped.get(region.id) ?? []), town]);
    }
    return grouped;
  }, [towns]);

  // Town names outrank region names for the same space, so a region only gets
  // labelled where no marker needed the room.
  const labels = useMemo(() => {
    if (!labelled) return { towns: [], regions: [] };
    const names = new Set(towns.map((town) => town.key));
    const placed = placeLabels([
      ...townLabels(towns),
      ...REGION_SHAPES.map((region) => ({
        key: `region-${region.id}`,
        text: region.name,
        size: REGION_LABEL_SIZE,
        x: region.label[0],
        ys: [region.label[1]],
      })),
    ]);
    return {
      towns: placed.filter((label) => names.has(label.key)),
      regions: placed.filter((label) => !names.has(label.key)),
    };
  }, [towns, labelled]);

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label="Zemljevid zavetišč po statističnih regijah"
      className="h-auto w-full"
    >
      {/* Regions first and markers after, so a click always reaches the region
          underneath rather than being caught by the marker drawn on top. */}
      {REGION_SHAPES.map((region) => (
        <Region
          key={region.id}
          region={region}
          towns={byRegion.get(region.id) ?? []}
          selected={selected}
          onPick={onPickRegion}
        />
      ))}

      {origin && onMap(origin) && <Origin at={origin} />}

      <g className="pointer-events-none">
        {labels.regions.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            className="fill-muted-foreground/55"
            style={{ fontSize: REGION_LABEL_SIZE }}
          >
            {label.text}
          </text>
        ))}

        {towns.map((town) => (
          <Marker key={town.key} town={town} selected={selected} />
        ))}

        {labels.towns.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            className="fill-foreground stroke-background [paint-order:stroke] [stroke-width:3px]"
            style={{ fontSize: TOWN_LABEL_SIZE, fontWeight: 500 }}
          >
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  );
}

// One target per region. A region with no shelter in it is still drawn, because
// leaving a hole in the country would read as missing rather than as empty, but
// it is not a button.
function Region({
  region,
  towns,
  selected,
  onPick,
}: {
  region: RegionShape;
  towns: Town[];
  selected: string[];
  onPick: (values: string[]) => void;
}) {
  const values = towns.flatMap((town) => town.shelters.map((s) => s.value));
  const chosen = values.filter((value) => selected.includes(value));
  const animals = towns.reduce((sum, town) => sum + townCount(town), 0);
  const live = values.length > 0 && (animals > 0 || chosen.length > 0);
  const state =
    chosen.length === 0
      ? false
      : chosen.length === values.length
        ? true
        : "mixed";

  const d = regionPath(region);

  if (!live) {
    return (
      <path
        d={d}
        aria-hidden
        className="pointer-events-none fill-muted stroke-border/60 [stroke-width:0.4]"
      />
    );
  }

  return (
    <path
      d={d}
      role="button"
      tabIndex={0}
      aria-pressed={state}
      aria-label={`${region.name}: ${plural(values.length, SHELTER_FORMS)}, ${plural(animals, ANIMAL_FORMS)}`}
      onClick={() => onPick(values)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(values);
        }
      }}
      className={cn(
        "cursor-pointer outline-none transition-[fill]",
        state === false
          ? "fill-muted hover:fill-foreground/10"
          : "fill-foreground/15",
        "stroke-border/60 [stroke-width:0.4]",
        "focus-visible:fill-foreground/15 focus-visible:stroke-foreground focus-visible:[stroke-width:1.5]",
      )}
    >
      <title>{`${region.name} · ${plural(values.length, SHELTER_FORMS)} · ${plural(animals, ANIMAL_FORMS)}`}</title>
    </path>
  );
}

// Picture only. Freed from being a target, a shared town can keep showing that
// it holds several shelters, and how many of them are picked, at whatever size
// its counts earn.
function Marker({ town, selected }: { town: Town; selected: string[] }) {
  const shared = town.shelters.length > 1;
  return (
    <g>
      {town.shelters.map((wedge) => {
        const checked = selected.includes(wedge.value);
        const dead = wedge.count === 0 && !checked;
        const fill = checked
          ? "fill-foreground"
          : dead
            ? "fill-foreground/25"
            : "fill-foreground/55";
        return shared ? (
          <path
            key={wedge.value}
            d={wedgePath(town.x, town.y, town.r, wedge.from, wedge.to)}
            className={cn(
              "stroke-background transition-[fill] [stroke-linejoin:round] [stroke-width:1.25]",
              fill,
            )}
          />
        ) : (
          <circle
            key={wedge.value}
            cx={town.x}
            cy={town.y}
            r={town.r}
            className={cn(
              "stroke-background transition-[fill] [stroke-width:1.25]",
              fill,
            )}
          />
        );
      })}
    </g>
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
