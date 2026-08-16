"use client";

import { useMemo } from "react";
import { MAP_HEIGHT, MAP_WIDTH, onMap, project, type LatLon } from "@/lib/geo";
import {
  layoutTowns,
  markerBoxes,
  placeLabels,
  townCount,
  wedgePath,
  REGION_LABEL_SIZE,
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
}: {
  pins: ShelterPin[];
  busiest: number;
  selected: string[];
  onPickRegion: (values: string[]) => void;
  origin?: LatLon;
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

  // Regions are what this picks, so regions are what it names. Naming the towns
  // as well put seventeen pieces of text on one small country and crowded most
  // of the region names out, which reads as broken rather than as restrained.
  // Which shelter is which is the list's job.
  const labels = useMemo(
    () =>
      placeLabels(
        REGION_SHAPES.map((region) => ({
          key: `region-${region.id}`,
          text: region.name,
          size: REGION_LABEL_SIZE,
          x: region.label[0],
          // The pole of inaccessibility first, then a little above or below it,
          // so a name blocked by a marker steps aside instead of vanishing.
          ys: [
            region.label[1],
            region.label[1] - 8,
            region.label[1] + 8,
            region.label[1] - 15,
            region.label[1] + 15,
          ],
        })),
        markerBoxes(towns),
      ),
    [towns],
  );

  // shrink-0 because the dialog is a flex column with a bounded height: as a
  // shrinkable flex item the map gave up a quarter of its height and then
  // letterboxed itself to keep its shape, drawing smaller than the room it
  // had. It keeps its full height and the dialog scrolls instead.
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label="Zemljevid zavetišč po statističnih regijah"
      className="h-auto w-full shrink-0"
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
        {/* Names are sized for the map at its full width. Below sm the dialog
            is barely wider than a phone, where they would be too small to read
            and too many to fit, so they are dropped rather than shrunk. */}
        <g className="hidden sm:inline">
          {labels.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: REGION_LABEL_SIZE }}
            >
              {label.text}
            </text>
          ))}
        </g>

        {towns.map((town) => (
          <Marker key={town.key} town={town} selected={selected} />
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
        className="pointer-events-none fill-foreground/4 stroke-background [stroke-width:0.8]"
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
        // Regions are separated by the page colour, not by a grey rule: the
        // gaps read as a seam and the map keeps one line weight instead of two.
        "cursor-pointer stroke-background outline-none transition-[fill] [stroke-width:0.8]",
        state === false
          ? "fill-foreground/9 hover:fill-foreground/16"
          : "fill-foreground/22 hover:fill-foreground/27",
        "focus-visible:fill-foreground/20 focus-visible:stroke-foreground focus-visible:[stroke-width:1.5]",
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
            ? "fill-foreground/20"
            : "fill-foreground/45";
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
