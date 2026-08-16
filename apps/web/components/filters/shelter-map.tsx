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

// Two targets, nested, each honest about how precise it can be. A marker is one
// town's shelters; the region around it is every shelter in the region. Markers
// were briefly not clickable at all, which was a rule inherited from the 209px
// sidebar, where a dot could not be made big enough to hit. The map only draws
// at dialog width now, so the dots can carry their own clicks again, and the
// list underneath is still the way to reach exactly one shelter in a town that
// holds several.
export function ShelterMap({
  pins,
  busiest,
  selected,
  onPick,
  origin,
}: {
  pins: ShelterPin[];
  busiest: number;
  selected: string[];
  onPick: (values: string[]) => void;
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
          onPick={onPick}
        />
      ))}

      {origin && onMap(origin) && <Origin at={origin} />}

      {/* Markers paint after the regions, so a dot takes its own click and the
          region only gets the ones that miss every dot. */}
      {towns.map((town) => (
        <Marker
          key={town.key}
          town={town}
          selected={selected}
          onPick={onPick}
        />
      ))}

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

// One target per town, not per wedge. A wedge of an already small dot cannot be
// hit at any width this map is given, which is what the list is for; the whole
// marker takes the click and selects everything that town holds.
function Marker({
  town,
  selected,
  onPick,
}: {
  town: Town;
  selected: string[];
  onPick: (values: string[]) => void;
}) {
  const shared = town.shelters.length > 1;
  const values = town.shelters.map((shelter) => shelter.value);
  const chosen = values.filter((value) => selected.includes(value));
  const live = townCount(town) > 0 || chosen.length > 0;
  const state =
    chosen.length === 0
      ? false
      : chosen.length === values.length
        ? true
        : "mixed";

  const names = shared
    ? `${plural(values.length, SHELTER_FORMS)} v kraju ${town.city}`
    : town.shelters[0].label;

  return (
    <g
      role="button"
      tabIndex={live ? 0 : -1}
      aria-disabled={live ? undefined : true}
      aria-pressed={state}
      aria-label={`${names}, ${town.city} — ${plural(townCount(town), ANIMAL_FORMS)}`}
      onClick={() => live && onPick(values)}
      onKeyDown={(event) => {
        if (!live) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(values);
        }
      }}
      className={cn(
        "group/pin outline-none",
        live ? "cursor-pointer" : "pointer-events-none",
      )}
    >
      <title>{`${names} · ${town.city} · ${plural(townCount(town), ANIMAL_FORMS)}`}</title>

      {/* The dot is what the eye aims at; this is what the pointer actually
          hits. It grows into the space around the marker but never reaches
          inside a neighbour's dot. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.hitR}
        className="fill-transparent"
      />

      {/* A ring on hover and focus, so a dot reads as something you can press
          before you press it. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.r + 2.5}
        className={cn(
          "fill-none stroke-foreground opacity-0 [stroke-width:1]",
          "group-hover/pin:opacity-40 group-focus-visible/pin:opacity-100",
        )}
      />

      {town.shelters.map((wedge) => {
        const checked = selected.includes(wedge.value);
        const dead = wedge.count === 0 && !checked;
        const fill = checked
          ? "fill-foreground"
          : dead
            ? "fill-foreground/20"
            : "fill-foreground/45 group-hover/pin:fill-foreground/70";
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
