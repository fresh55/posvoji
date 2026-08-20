"use client";

import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  KM_PER_MAP_UNIT,
  MAP_HEIGHT,
  MAP_WIDTH,
  onMap,
  project,
  type LatLon,
} from "@/lib/geo";
import { useI18n } from "@/components/i18n-provider";
import {
  DENSITY_STEPS,
  densityScale,
  layoutTowns,
  selectionState,
  townCount,
  townLabel,
  townSelectableValues,
  type ShelterPin,
  type Town,
} from "@/lib/map-layout";
import {
  REGION_SHAPES,
  outlinePath,
  regionAt,
  regionPath,
  ringsPath,
  type RegionShape,
} from "@/lib/map-regions";
import {
  COASTLINE,
  NEIGHBOR_SHAPES,
  RIVERS,
  SLOVENIA_UNDERLAY,
} from "@/lib/neighbor-shapes";
import { animalCount, shelterCount } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { MapCallout, Origin } from "./map-callout";
import { Marker } from "./map-marker";

export type { ShelterPin } from "@/lib/map-layout";

type RegionStats = {
  values: string[];
  animals: number;
  live: boolean;
  state: boolean | "mixed";
  /** Index into DENSITY_STEPS, by rank among the live regions. */
  density: number;
};

function getRegionStats(
  towns: Town[],
  selected: string[],
): Omit<RegionStats, "density"> {
  // Only what a click may toggle. Off-site shelters are on the map but not in
  // the region's values, so a region pick never selects a shelter with
  // nothing to show, and a region holding only those stays inert.
  const values = towns.flatMap(townSelectableValues);
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

/** Towns bucketed into the region each one really sits in, plus the reverse
 *  lookup. Real coordinates and not the laid-out marker position, because
 *  collision layout may nudge a marker across a region border. */
function groupTownsByRegion(towns: Town[]): {
  byRegion: Map<number, Town[]>;
  regionIdByTownKey: Map<string, number>;
} {
  const byRegion = new Map<number, Town[]>();
  const regionIdByTownKey = new Map<string, number>();
  for (const town of towns) {
    const region = regionAt(project(town.shelters[0].at));
    if (!region) continue;
    byRegion.set(region.id, [...(byRegion.get(region.id) ?? []), town]);
    regionIdByTownKey.set(town.key, region.id);
  }
  return { byRegion, regionIdByTownKey };
}

/** Whether any region is partly picked right now. The legend's hatch row is
 *  drawn only while this is true, so the hatch explains itself the moment it
 *  first appears instead of standing in the legend unprovoked. Shares the
 *  grouping and the stats the map itself draws from, so the row cannot claim a
 *  state the country is not in. */
export function anyRegionMixed(pins: ShelterPin[], selected: string[]): boolean {
  const { byRegion } = groupTownsByRegion(layoutTowns(pins));
  return REGION_SHAPES.some((region) => {
    const stats = getRegionStats(byRegion.get(region.id) ?? [], selected);
    return stats.live && stats.state === "mixed";
  });
}

// Regions are the keyboard and narrow-screen controls; town markers add
// pointer precision when the map is large enough.
export function ShelterMap({
  pins,
  selected,
  onPick,
  origin,
  className,
  highlightedValue,
  matchedValues,
  onHoverShelters,
  spotlightValues,
  spotlightNote,
  spotlightFrom,
  highlightedDensity,
}: {
  pins: ShelterPin[];
  selected: string[];
  onPick: (values: string[]) => void;
  origin?: LatLon;
  className?: string;
  /** A shelter hovered elsewhere (the list row), so its marker and region light
   *  up here too. */
  highlightedValue?: string | null;
  /** Shelters the list search currently matches. Null means no search, so
   *  nothing dims. The map never hides a marker: a search narrows attention,
   *  it does not redraw the country. */
  matchedValues?: string[] | null;
  /** Fired when a marker or region gains or loses pointer hover, so the list
   *  can tint the matching row(s). Null means nothing is hovered. */
  onHoverShelters?: (values: string[] | null) => void;
  /** Shelters the map should point at outright: accent ring plus a named
   *  callout, independent of hover. The municipality lookup's answer to "so
   *  where is that?" — a dimmed-versus-darker marker was not readable, and on
   *  phones markers are not drawn at all, so the ring and card are what make
   *  the answer visible there. Null means no spotlight. */
  spotlightValues?: string[] | null;
  /** One-line note under the spotlight callout title, e.g. "responsible
   *  shelter" in the reader's language. */
  spotlightNote?: string;
  /** Where the spotlight was asked from: the municipality's own point. A
   *  dashed line runs from here to every spotlighted marker, so the ring reads
   *  as "this shelter, for that place" instead of as a mark on its own. Null,
   *  undefined or a point off the map draws nothing, because a line from
   *  roughly the right place is worse than no line. */
  spotlightFrom?: LatLon | null;
  /** A density step hovered in the legend, as an index into DENSITY_STEPS.
   *  Unpicked regions on that step light up and the rest of the ramp fades, so
   *  the legend answers "which regions are this busy?". Null or undefined
   *  means no legend hover. Picked and partly picked regions are left alone:
   *  they carry a selection, which outranks a preview. */
  highlightedDensity?: number | null;
}) {
  const { locale, messages } = useI18n();
  // The dev gallery mounts several maps on one page, and every one of them
  // defines this pattern, so the id cannot be a constant. useId is stripped to
  // alphanumerics because the value it returns carries colons.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hatchId = `map-hatch-${uid}`;
  const contextFadeId = `map-context-fade-${uid}`;
  const towns = useMemo(() => layoutTowns(pins), [pins]);
  const [hoveredTownKey, setHoveredTownKey] = useState<string | null>(null);
  /** The single shelter under the pointer inside a cluster marker. A cluster
   *  answers per disc, so the callout and the list row follow the wedge rather
   *  than the town. Null for single and overflow markers, which still answer as
   *  a whole. */
  const [hoveredShelterValue, setHoveredShelterValue] = useState<string | null>(
    null,
  );
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null);
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
  /** Region wearing keyboard focus right now, so it earns the same callout a
   *  pointer hover gets. Cleared on blur, unlike focusedRegionId, which the
   *  roving tabindex keeps as the remembered tab stop. */
  const [calloutRegionId, setCalloutRegionId] = useState<number | null>(null);
  const regionRefs = useRef(new Map<number, SVGPathElement>());
  const activeTown = towns.find((town) => town.key === hoveredTownKey);
  const hoveredShelter = hoveredShelterValue
    ? activeTown?.shelters.find(
        (shelter) => shelter.value === hoveredShelterValue,
      )
    : undefined;

  // Memoized so the highlighted town's region is a lookup rather than a second
  // point-in-polygon pass over every render.
  const { byRegion, regionIdByTownKey } = useMemo(
    () => groupTownsByRegion(towns),
    [towns],
  );

  const highlightedTown = highlightedValue
    ? towns.find((town) =>
        town.shelters.some((shelter) => shelter.value === highlightedValue),
      )
    : undefined;

  const spotlightTowns = spotlightValues?.length
    ? towns.filter((town) =>
        town.shelters.some((shelter) =>
          spotlightValues.includes(shelter.value),
        ),
      )
    : [];
  const highlightedRegionId = highlightedTown
    ? regionIdByTownKey.get(highlightedTown.key)
    : undefined;

  const counted = REGION_SHAPES.map((region) => ({
    region,
    stats: getRegionStats(byRegion.get(region.id) ?? [], selected),
  }));
  const step = densityScale(
    counted.filter(({ stats }) => stats.live).map(({ stats }) => stats.animals),
  );
  const regions = counted.map(({ region, stats }) => ({
    region,
    stats: { ...stats, density: step(stats.animals) },
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

  // A marker sits on top of its region, so both would report a hover. The
  // marker is the more precise answer and wins. Keyboard focus fills in when
  // no pointer is on the map, so tabbing narrates the same card hovering does.
  const hoveredRegion = activeTown
    ? undefined
    : regions.find(
        ({ region, stats }) =>
          stats.live && region.id === (hoveredRegionId ?? calloutRegionId),
      );

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label={messages.shelterMapLabel}
      className={cn("h-auto w-full shrink-0", className)}
    >
      <defs>
        <MixedHatch id={hatchId} />
        <ContextFade id={contextFadeId} />
      </defs>

      <GeographicContext maskId={contextFadeId} />

      {/* Every region strokes its own outline, so an internal border is
          painted twice and the coast once, leaving the seams darker than the
          country's edge. One silhouette under the regions puts the weight
          back on the outside. It goes under and not over because a coastal
          region's selected and focused strokes run along the same line, and
          they have to win there. */}
      <path
        d={COUNTRY_OUTLINE}
        aria-hidden
        // The shapes are polygonal, so a mitred corner spikes on the coast.
        strokeLinejoin="round"
        strokeLinecap="round"
        className="pointer-events-none fill-none stroke-foreground/45 [stroke-width:1.1]"
      />

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
          onFocus={() => {
            setFocusedRegionId(region.id);
            setCalloutRegionId(region.id);
          }}
          onBlur={() =>
            setCalloutRegionId((current) =>
              current === region.id ? null : current,
            )
          }
          onMoveFocus={(key) => moveRegionFocus(region.id, key)}
          onPointerEnter={() => {
            setHoveredRegionId(region.id);
            // Hovering a region previews the rows a click would change, which
            // matters most here: one region click can toggle several shelters.
            if (stats.live) onHoverShelters?.(stats.values);
          }}
          onPointerLeave={() => {
            setHoveredRegionId((current) =>
              current === region.id ? null : current,
            );
            if (stats.live) onHoverShelters?.(null);
          }}
          highlighted={region.id === highlightedRegionId}
          densityFocus={regionDensityFocus(stats, highlightedDensity)}
          hatchId={hatchId}
        />
      ))}

      {/* Under the callouts on purpose: a card is the answer someone just
          asked for, and the bar is furniture that can wait behind it. */}
      <ScaleBar />

      {origin && onMap(origin) && <Origin at={origin} />}

      <g className="hidden md:block">
        {towns.map((town) => (
          <Marker
            key={town.key}
            town={town}
            selected={selected}
            onPick={onPick}
            highlighted={town.key === highlightedTown?.key}
            dimmed={
              matchedValues != null &&
              !town.shelters.some((shelter) =>
                matchedValues.includes(shelter.value),
              )
            }
            hoveredShelterValue={hoveredShelterValue}
            onPointerEnter={() => {
              setHoveredTownKey(town.key);
              setHoveredShelterValue(null);
              onHoverShelters?.(town.shelters.map((shelter) => shelter.value));
            }}
            onPointerLeave={() => {
              setHoveredTownKey((current) =>
                current === town.key ? null : current,
              );
              onHoverShelters?.(null);
            }}
            onHoverShelter={(value) => {
              if (value === null) {
                setHoveredTownKey((current) =>
                  current === town.key ? null : current,
                );
                setHoveredShelterValue(null);
                onHoverShelters?.(null);
                return;
              }
              setHoveredTownKey(town.key);
              setHoveredShelterValue(value);
              onHoverShelters?.([value]);
            }}
          />
        ))}

        {/* Keep the active tooltip above every marker. A spotlighted town
            already wears a persistent card saying the same thing, so hover
            must not stack a second card on top of it. */}
        {activeTown && !spotlightTowns.some((t) => t.key === activeTown.key) && (
          <MapCallout
            x={activeTown.x}
            y={activeTown.y}
            reach={activeTown.r}
            // A wedge under the pointer names its own shelter. Without that a
            // cluster answered "Celje, 2 zavetišči" whichever coin you aimed
            // at, which is the one question the cluster cannot answer.
            title={hoveredShelter ? hoveredShelter.label : townLabel(activeTown)}
            metadata={
              hoveredShelter
                ? hoveredShelter.selectable === false
                  ? messages.noAnimalsListed
                  : animalCount(hoveredShelter.count, locale)
                : // A town with nothing to pick says so, rather than counting
                  // out the nought it has.
                  townSelectableValues(activeTown).length === 0
                  ? messages.noAnimalsListed
                  : activeTown.shelters.length > 1
                    ? `${shelterCount(activeTown.shelters.length, locale)} · ${animalCount(townCount(activeTown), locale)}`
                    : animalCount(townCount(activeTown), locale)
            }
          />
        )}
      </g>

      {hoveredRegion && (
        <MapCallout
          x={hoveredRegion.region.label[0]}
          y={hoveredRegion.region.label[1]}
          reach={4}
          title={hoveredRegion.region.name}
          metadata={`${shelterCount(hoveredRegion.stats.values.length, locale)} · ${animalCount(hoveredRegion.stats.animals, locale)}`}
        />
      )}

      {/* Under the rings and over everything else: the line explains them, so
          it must not be drawn across the thing it points at. */}
      {spotlightFrom && onMap(spotlightFrom) && spotlightTowns.length > 0 && (
        <g aria-hidden className="pointer-events-none">
          {spotlightTowns.map((town) => (
            <Connector
              key={`link-${town.key}`}
              from={spotlightFrom}
              town={town}
            />
          ))}
          {/* The municipality's end of the line. A dot and not a second
              dashed ring: the ring is what the origin wears, and this is not
              where the visitor is, only what they asked about. */}
          <circle
            data-map-connector-from
            cx={project(spotlightFrom).x}
            cy={project(spotlightFrom).y}
            r={1.2}
            className="fill-foreground opacity-60"
          />
        </g>
      )}

      {/* Painted last: the spotlight is the whole point of the map while it
          is on. Drawn outside the md-only marker group on purpose — phones
          get no markers, so the ring and the named card are all they see. */}
      {spotlightTowns.map((town) => (
        <g key={`spot-${town.key}`} aria-hidden className="pointer-events-none">
          <circle
            cx={town.x}
            cy={town.y}
            r={town.r + SPOTLIGHT_RING}
            strokeWidth={1.5}
            className="fill-none stroke-[var(--filter-accent-strong)]"
          />
          {/* The ring that travels, over the static one that always marks the
              spot. The ping keyframes hold the last quarter of the cycle
              invisible, so a slow duration leaves a pause between rings
              rather than a sonar sweep. The duration is inline because
              animate-ping sets the animation shorthand, which would win over
              a utility. transform-box and transform-origin are set because
              an SVG shape otherwise scales from the viewBox origin instead
              of its own centre. */}
          <circle
            cx={town.x}
            cy={town.y}
            r={town.r + SPOTLIGHT_RING}
            strokeWidth={1.5}
            style={{ animationDuration: "2.2s" }}
            className="origin-center fill-none stroke-[var(--filter-accent-strong)] [transform-box:fill-box] animate-ping motion-reduce:animate-none"
          />
          <circle
            cx={town.x}
            cy={town.y}
            r={2.2}
            className="fill-[var(--filter-accent-strong)] md:hidden"
          />
        </g>
      ))}
      {spotlightTowns.map((town) => (
        <MapCallout
          key={`spot-callout-${town.key}`}
          x={town.x}
          y={town.y}
          reach={town.r + 6}
          // The spotlighted shelter by name, not its town: in a shared town
          // the answer is one of the discs, and the card must say which.
          title={
            town.shelters
              .filter((shelter) => spotlightValues?.includes(shelter.value))
              .map((shelter) => shelter.label)
              .join(" · ") || townLabel(town)
          }
          metadata={spotlightNote ?? ""}
        />
      ))}
    </svg>
  );
}

// How far outside a marker the spotlight ring sits, in user units. Shared with
// the connector, which stops at the ring rather than crossing it.
const SPOTLIGHT_RING = 3.5;

// A round number that stays a caption. 50 km would be 62.9 units, a fifth of
// the map's width, and would read as a graphic rather than as a measure; 25 km
// is 31.4 units, about the width of the legend row it stands over.
const SCALE_BAR_KM = 25;
// The bottom-right corner, with the rest of the map's furniture. Right end six
// units off the edge, matching the padding the legend keeps. y 176 rather than
// lower because the legend overlay is HTML on the canvas and its height in
// user units depends on the aspect ratio and on how many rows it is carrying:
// three rows plus the canvas padding come to about 25 units at the tightest
// sizes the dialog draws at, so the bar clears it from here. Everything in this
// corner is Croatia at this projection (lon 15.9 east, lat 45.6 south), so the
// bar crosses no shape of Slovenia's.
const SCALE_BAR_RIGHT = 314;
const SCALE_BAR_Y = 176;
const SCALE_BAR_TICK = 1.5;

// The map's second piece of type, after the callouts, and it has to stay the
// quieter one. Upright: italic is the water's register on a map. Both the line
// and the label run at the silhouette's alpha and under half its width, so the
// bar sits below the country rather than beside it.
const SCALE_BAR_TEXT = 4.2;

// Digits and "km" read in every language the site has, so the one label on the
// map needs no message key.
function ScaleBar() {
  const length = SCALE_BAR_KM / KM_PER_MAP_UNIT;
  const left = SCALE_BAR_RIGHT - length;
  const top = SCALE_BAR_Y - SCALE_BAR_TICK;
  const bottom = SCALE_BAR_Y + SCALE_BAR_TICK;
  return (
    <g aria-hidden className="pointer-events-none">
      <path
        data-map-scale={SCALE_BAR_KM}
        d={`M${left} ${top}V${bottom}M${left} ${SCALE_BAR_Y}H${SCALE_BAR_RIGHT}M${SCALE_BAR_RIGHT} ${top}V${bottom}`}
        strokeWidth={0.5}
        strokeLinecap="round"
        className="fill-none stroke-foreground/45"
      />
      <text
        x={SCALE_BAR_RIGHT}
        y={SCALE_BAR_Y - 2.5}
        textAnchor="end"
        fontSize={SCALE_BAR_TEXT}
        className="fill-foreground/45 stroke-none"
      >
        {`${SCALE_BAR_KM} km`}
      </text>
    </g>
  );
}

// Both ends of the connector give way to what they join: it leaves its own dot
// and stops at the ring, so neither mark is drawn through.
const CONNECTOR_START_GAP = 2.4;
const CONNECTOR_END_GAP = 1.5;

// The same dashes the origin ring wears, at the same width, one step quieter.
// A municipality and its shelter are two places the visitor did not pick off
// the map, and the dashed language is what says so.
function Connector({ from, town }: { from: LatLon; town: Town }) {
  const at = project(from);
  const dx = town.x - at.x;
  const dy = town.y - at.y;
  const length = Math.hypot(dx, dy);
  const end = town.r + SPOTLIGHT_RING + CONNECTOR_END_GAP;
  // A shelter inside its own municipality leaves nothing to draw between the
  // dot and the ring, and a stub through both would say less than nothing.
  if (length <= CONNECTOR_START_GAP + end) return null;
  return (
    <line
      data-map-connector
      x1={at.x + (dx / length) * CONNECTOR_START_GAP}
      y1={at.y + (dy / length) * CONNECTOR_START_GAP}
      x2={town.x - (dx / length) * end}
      y2={town.y - (dy / length) * end}
      strokeWidth={0.9}
      strokeDasharray="2 2"
      strokeLinecap="round"
      className="stroke-foreground opacity-60"
    />
  );
}

// Tile side in user units. The viewBox is 320 x 210 and the picker draws it
// near two pixels per unit, so a 3-unit tile puts the lines about six pixels
// apart and a 0.6-unit line renders about 1.2 pixels wide: thin enough to read
// as hatching, wide enough not to alias away.
const HATCH_TILE = 3;
const HATCH_LINE_WIDTH = 0.6;

// A partly picked region wore the selected green at half opacity, which sat
// between "picked" and "a dense grey region" and read as neither. Hatching is
// the cartographic answer: the selection colour, unmistakably not solid.
//
// userSpaceOnUse rather than the default objectBoundingBox: the twelve regions
// differ in size several times over, and a tile measured in fractions of each
// bounding box would give every region its own hatch density. The line stands
// upright in the middle of the tile and patternTransform rotates the whole
// tiling, so the line never straddles a tile seam and needs no duplicate to
// close the gap at the edge.
function MixedHatch({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
      width={HATCH_TILE}
      height={HATCH_TILE}
    >
      {/* The ground under the lines. --filter-accent is pale green on light
          and deep green on dark, and --filter-accent-strong inverts with it,
          so the hatch keeps its contrast in both themes. */}
      <rect
        width={HATCH_TILE}
        height={HATCH_TILE}
        fill="var(--filter-accent)"
      />
      <line
        x1={HATCH_TILE / 2}
        y1={0}
        x2={HATCH_TILE / 2}
        y2={HATCH_TILE}
        stroke="var(--filter-accent-strong)"
        strokeWidth={HATCH_LINE_WIDTH}
      />
    </pattern>
  );
}

// How far the context fades in from each viewBox edge, in user units. The
// letterbox around the SVG is wider than the viewBox on some aspect ratios, so
// a context layer that stopped dead at the edge would rule a rectangle across
// the panel. Roughly a twentieth of the map's width: enough to read as an
// unbounded surround, not so much that the sea disappears.
const CONTEXT_FADE = 14;

// Where the open water is, in user units, measured off the projected Natural
// Earth coastline: the Gulf of Trieste reaches the left edge below y 162 and
// the bottom edge left of x 17. The sea is the only blue on the map and the
// fade was eating exactly the corner it lives in, so the two strips that cross
// it stop short of it. The gap between the keep line and the resume line is
// the strip's own falloff along its length, so it ends in a gradient rather
// than at a seam.
const SEA_KEEP_BELOW_Y = 162;
const SEA_FADE_RESUMES_ABOVE_Y = 132;
const SEA_KEEP_LEFT_OF_X = 18;
const SEA_FADE_RESUMES_RIGHT_OF_X = 50;

// A luminance mask that is white in the middle and black at the edges. The
// strips paint translucent black over the white ground rather than a gradient
// each, so where two of them overlap in a corner the alpha compounds and the
// corner goes dark, which is what a corner should do.
//
// The left and bottom strips carry a second mask of their own, which switches
// the strip off along its length before it reaches the southwest corner. Both
// are off there, so the sea and the Italian coast around Trieste run to the
// viewBox edge at full strength. A map that ends at its frame is ordinary
// cartography; a map with its only water washed out is not.
function ContextFade({ id }: { id: string }) {
  const strips = [
    { key: "t", x: 0, y: 0, w: MAP_WIDTH, h: CONTEXT_FADE, from: [0, 0], to: [0, 1] },
    {
      key: "b",
      x: 0,
      y: MAP_HEIGHT - CONTEXT_FADE,
      w: MAP_WIDTH,
      h: CONTEXT_FADE,
      from: [0, 1],
      to: [0, 0],
    },
    { key: "l", x: 0, y: 0, w: CONTEXT_FADE, h: MAP_HEIGHT, from: [0, 0], to: [1, 0] },
    {
      key: "r",
      x: MAP_WIDTH - CONTEXT_FADE,
      y: 0,
      w: CONTEXT_FADE,
      h: MAP_HEIGHT,
      from: [1, 0],
      to: [0, 0],
    },
  ];

  // White lets the strip fade, black holds it off. Both run in user units so
  // the stops sit on the coastline the numbers were read from.
  const keeps = [
    {
      key: "l",
      x1: 0,
      y1: SEA_FADE_RESUMES_ABOVE_Y,
      x2: 0,
      y2: SEA_KEEP_BELOW_Y,
      x: 0,
      y: 0,
      w: CONTEXT_FADE,
      h: MAP_HEIGHT,
    },
    {
      key: "b",
      x1: SEA_FADE_RESUMES_RIGHT_OF_X,
      y1: 0,
      x2: SEA_KEEP_LEFT_OF_X,
      y2: 0,
      x: 0,
      y: MAP_HEIGHT - CONTEXT_FADE,
      w: MAP_WIDTH,
      h: CONTEXT_FADE,
    },
  ];

  return (
    <>
      {strips.map((strip) => (
        <linearGradient
          key={strip.key}
          id={`${id}-${strip.key}`}
          x1={strip.from[0]}
          y1={strip.from[1]}
          x2={strip.to[0]}
          y2={strip.to[1]}
        >
          <stop offset="0" stopColor="black" stopOpacity={1} />
          <stop offset="1" stopColor="black" stopOpacity={0} />
        </linearGradient>
      ))}
      {keeps.map((keep) => (
        <linearGradient
          key={keep.key}
          id={`${id}-${keep.key}-keep`}
          gradientUnits="userSpaceOnUse"
          x1={keep.x1}
          y1={keep.y1}
          x2={keep.x2}
          y2={keep.y2}
        >
          <stop offset="0" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
      ))}
      {keeps.map((keep) => (
        <mask
          key={keep.key}
          id={`${id}-${keep.key}-keep-mask`}
          maskUnits="userSpaceOnUse"
          x={keep.x}
          y={keep.y}
          width={keep.w}
          height={keep.h}
        >
          <rect
            x={keep.x}
            y={keep.y}
            width={keep.w}
            height={keep.h}
            fill={`url(#${id}-${keep.key}-keep)`}
          />
        </mask>
      ))}
      <mask
        id={id}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="white" />
        {strips.map((strip) => (
          <rect
            key={strip.key}
            x={strip.x}
            y={strip.y}
            width={strip.w}
            height={strip.h}
            fill={`url(#${id}-${strip.key})`}
            mask={
              keeps.some((keep) => keep.key === strip.key)
                ? `url(#${id}-${strip.key}-keep-mask)`
                : undefined
            }
          />
        ))}
      </mask>
    </>
  );
}

// An open path per line. ringsPath closes every ring it is given, which is
// right for land and wrong for a coast or a river: closing one would rule a
// chord back across the water it was drawing.
function linesPath(lines: [number, number][][]): string {
  return lines
    .map(
      ([first, ...rest]) =>
        `M${first[0]} ${first[1]}${rest.map(([x, y]) => `L${x} ${y}`).join("")}`,
    )
    .join("");
}

// Same for every render, and the walk behind them is not free.
const NEIGHBOR_PATHS = NEIGHBOR_SHAPES.map((neighbor) => ({
  id: neighbor.id,
  d: ringsPath(neighbor.rings),
}));
const UNDERLAY_PATH = ringsPath(SLOVENIA_UNDERLAY);
const COASTLINE_PATH = linesPath(COASTLINE);
const RIVERS_PATH = linesPath(RIVERS.flatMap((river) => river.lines));

// The coast is an edge, not a subject. The country silhouette runs at 1.1 in
// foreground/45; this is a third of that width at just over half the alpha, so
// the two can share the Slovenian shore without the thinner one arguing.
const COASTLINE_WIDTH = 0.4;
// Thinner still, and in a tone rather than in foreground alpha, so a river
// never reads as a border. Region fills lie over these lines inside Slovenia
// and tint them down as a region gets busier, which is the order that keeps
// the choropleth the thing being read.
const RIVER_WIDTH = 0.3;

// Slovenia used to float alone on a flat panel. This is the ground it actually
// sits on, painted before anything else: sea across the whole viewBox, then the
// neighbouring land over it. Blue survives only where no country covers it,
// which is the Adriatic corner and nowhere else, so the coast is drawn by the
// land rather than by a hand-cut sea polygon that would drift from it.
//
// The countries carry no border stroke between them. Natural Earth and GURS
// generalise the frontier about 1.4 units apart, so a stroked neighbour would
// ghost a second border alongside Slovenia's own, and a silhouette that quiet
// has no business drawing lines at all.
function GeographicContext({ maskId }: { maskId: string }) {
  return (
    <g aria-hidden className="pointer-events-none" mask={`url(#${maskId})`}>
      <rect
        data-map-sea
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
        fill="var(--map-sea)"
      />
      {NEIGHBOR_PATHS.map((neighbor) => (
        <path
          key={neighbor.id}
          d={neighbor.d}
          data-map-abroad={neighbor.id}
          fill="var(--map-abroad)"
        />
      ))}
      {/* Natural Earth's Slovenia, in the neighbours' own tone. The real
          country covers it entirely, so it is never seen; it is here so the
          two sources' disagreement about the border cannot open a sliver of
          sea or canvas along it. */}
      <path data-map-abroad="SVN" d={UNDERLAY_PATH} fill="var(--map-abroad)" />

      {/* Over the land fills and under everything Slovenia draws on top of
          them. Drawn straight through the border rather than stopping at it:
          a river that ends at a frontier is a thing no map has ever meant.
          Inside the country the density fills cover them, so a busy region
          quiets its own rivers and the choropleth keeps the floor. */}
      <path
        data-map-rivers
        d={RIVERS_PATH}
        fill="none"
        stroke="var(--map-river)"
        strokeWidth={RIVER_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last, so the shore stays a clean edge over the fill it traces. It
          says where the land stops and nothing else, which is why it is a
          hairline and not a border. */}
      <path
        data-map-coastline
        d={COASTLINE_PATH}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="fill-none stroke-foreground/25"
        strokeWidth={COASTLINE_WIDTH}
      />
    </g>
  );
}

// The stroke is what draws the country. It runs on inert regions too, so an
// empty region still reads as part of the silhouette rather than as a hole.
const REGION_STROKE = "stroke-foreground/30";

// Same for every render, and the walk behind it is not free.
const COUNTRY_OUTLINE = outlinePath();

/** What a legend hover asks of one region: wear the hover look, fade back, or
 *  nothing. */
type DensityFocus = "match" | "dim";

// Only an idle live region answers the legend. A selection is an answer the
// visitor already gave, and dimming or lighting it would overwrite it.
function regionDensityFocus(
  stats: RegionStats,
  highlightedDensity: number | null | undefined,
): DensityFocus | undefined {
  if (highlightedDensity == null || !stats.live || stats.state !== false) {
    return undefined;
  }
  return stats.density === highlightedDensity ? "match" : "dim";
}

// Enough to push the rest of the ramp behind the step being asked about, not
// so much that the country loses its shape.
const DENSITY_DIM = 0.4;

function densityStyle(density: number, dimmed = false): CSSProperties {
  const next = Math.min(density + 1, DENSITY_STEPS.length - 1);
  return {
    // Only the resting value dims. The hover value stays whole, so a pointer
    // still lifts a dimmed region out and beats the legend.
    "--map-density": dimmed
      ? DENSITY_STEPS[density] * DENSITY_DIM
      : DENSITY_STEPS[density],
    "--map-density-hover": DENSITY_STEPS[next],
  } as CSSProperties;
}

type RegionStateName = "selected" | "mixed" | "idle";

function regionStateName(state: boolean | "mixed"): RegionStateName {
  return state === true ? "selected" : state === "mixed" ? "mixed" : "idle";
}

// Selection is green, density is grey. They were both foreground alpha
// before, which made a busy region and a chosen one the same picture. A
// region highlighted from the list wears its own hover look at rest, rather
// than fighting a real hover for the same declaration. Keyed by region state
// so the JSX picks a class string instead of nesting a nine-way ternary.
const REGION_LOOK: Record<
  RegionStateName,
  { rest: string; highlighted: string }
> = {
  selected: {
    rest: "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.9] [stroke-width:0.9] hover:[fill-opacity:1] hover:[stroke-width:1.2]",
    highlighted:
      "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.2]",
  },
  // No fill utility here: the fill is the hatch pattern, set as an attribute,
  // and a Tailwind fill class would win over it. The stroke carries most of the
  // hover answer, because a fill-opacity step across thin lines on a pale
  // ground barely moves; the opacity step is kept as well, since it lifts the
  // ground the lines sit on.
  mixed: {
    rest: "stroke-[var(--filter-accent-strong)] [fill-opacity:0.85] [stroke-width:0.8] hover:[fill-opacity:1] hover:[stroke-width:1.3]",
    highlighted:
      "stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.3]",
  },
  idle: {
    rest: cn(
      "fill-foreground [fill-opacity:var(--map-density)] [stroke-width:0.6] hover:[fill-opacity:var(--map-density-hover)] hover:[stroke-width:1]",
      REGION_STROKE,
      "hover:stroke-foreground/45",
    ),
    highlighted:
      "fill-foreground [fill-opacity:var(--map-density-hover)] [stroke-width:1] stroke-foreground/45",
  },
};

// Empty regions remain visible but are not interactive.
function Region({
  region,
  stats,
  onPick,
  tabIndex,
  elementRef,
  onFocus,
  onBlur,
  onMoveFocus,
  onPointerEnter,
  onPointerLeave,
  highlighted,
  densityFocus,
  hatchId,
}: {
  region: RegionShape;
  stats: RegionStats;
  onPick: (values: string[]) => void;
  tabIndex: 0 | -1;
  elementRef: (element: SVGPathElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onMoveFocus: (
    key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End",
  ) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** A shelter in this region is hovered in the list, so it wears the same
   *  look pointer hover would give it. */
  highlighted: boolean;
  /** The legend is pointing at a density step: "match" means this region is on
   *  it, "dim" means it is not. Undefined when no step is hovered. */
  densityFocus?: DensityFocus;
  /** The map's hatch pattern, which the mixed state fills with. */
  hatchId: string;
}) {
  const { locale } = useI18n();
  const d = regionPath(region);

  if (!stats.live) {
    return (
      <path
        d={d}
        aria-hidden
        data-region-state="inert"
        strokeLinejoin="round"
        className={cn(
          // Below DENSITY_STEPS[0] by a full step of the ramp, so an empty
          // region cannot be mistaken for the quietest live one. It stays
          // above --map-abroad by more than it is worth arguing about: the
          // land across the border is untinted, this is not, and the country
          // outline settles the rest.
          "pointer-events-none fill-foreground/4 [stroke-width:0.6]",
          REGION_STROKE,
        )}
      />
    );
  }

  const stateName = regionStateName(stats.state);
  // A list hover already asked for this region by name, so the legend never
  // fades it back.
  const dimmed = densityFocus === "dim" && !highlighted;
  const lit = highlighted || densityFocus === "match";

  return (
    <path
      ref={elementRef}
      d={d}
      role="button"
      tabIndex={tabIndex}
      aria-pressed={stats.state}
      aria-label={`${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}`}
      // Attribute and not a class, because a pattern reference cannot be
      // written as a Tailwind fill utility.
      fill={stateName === "mixed" ? `url(#${hatchId})` : undefined}
      data-region-state={stateName}
      data-region-density={stats.density}
      data-region-highlighted={highlighted || undefined}
      data-region-density-focus={densityFocus}
      strokeLinejoin="round"
      onClick={() => onPick(stats.values)}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
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
      style={
        stats.state === false
          ? densityStyle(stats.density, dimmed)
          : undefined
      }
      className={cn(
        "cursor-pointer outline-none transition-[fill,stroke,fill-opacity,stroke-width] motion-reduce:transition-none",
        REGION_LOOK[stateName][lit ? "highlighted" : "rest"],
        "focus-visible:stroke-foreground focus-visible:[stroke-width:1.75]",
      )}
    />
  );
}
