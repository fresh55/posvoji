"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { MAP_HEIGHT, MAP_WIDTH, onMap, project, type LatLon } from "@/lib/geo";
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
  regionAt,
  regionPath,
  type RegionShape,
} from "@/lib/map-regions";
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
}) {
  const { locale, messages } = useI18n();
  const towns = useMemo(() => layoutTowns(pins), [pins]);
  const [hoveredTownKey, setHoveredTownKey] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null);
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
  /** Region wearing keyboard focus right now, so it earns the same callout a
   *  pointer hover gets. Cleared on blur, unlike focusedRegionId, which the
   *  roving tabindex keeps as the remembered tab stop. */
  const [calloutRegionId, setCalloutRegionId] = useState<number | null>(null);
  const regionRefs = useRef(new Map<number, SVGPathElement>());
  const activeTown = towns.find((town) => town.key === hoveredTownKey);

  // Use real coordinates because collision layout may nudge a marker across a
  // region border. Computed once per town, alongside the region grouping, so
  // the highlighted town's region is a lookup rather than a second
  // point-in-polygon pass over every render.
  const { byRegion, regionIdByTownKey } = useMemo(() => {
    const grouped = new Map<number, Town[]>();
    const townRegion = new Map<string, number>();
    for (const town of towns) {
      const region = regionAt(project(town.shelters[0].at));
      if (!region) continue;
      grouped.set(region.id, [...(grouped.get(region.id) ?? []), town]);
      townRegion.set(town.key, region.id);
    }
    return { byRegion: grouped, regionIdByTownKey: townRegion };
  }, [towns]);

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
            highlighted={town.key === highlightedTown?.key}
            dimmed={
              matchedValues != null &&
              !town.shelters.some((shelter) =>
                matchedValues.includes(shelter.value),
              )
            }
            onPointerEnter={() => {
              setHoveredTownKey(town.key);
              onHoverShelters?.(town.shelters.map((shelter) => shelter.value));
            }}
            onPointerLeave={() => {
              setHoveredTownKey((current) =>
                current === town.key ? null : current,
              );
              onHoverShelters?.(null);
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
            title={townLabel(activeTown)}
            metadata={
              activeTown.shelters.length > 1
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

      {/* Painted last: the spotlight is the whole point of the map while it
          is on. Drawn outside the md-only marker group on purpose — phones
          get no markers, so the ring and the named card are all they see. */}
      {spotlightTowns.map((town) => (
        <g key={`spot-${town.key}`} aria-hidden className="pointer-events-none">
          <circle
            cx={town.x}
            cy={town.y}
            r={town.r + 3.5}
            strokeWidth={1.5}
            className="fill-none stroke-[var(--filter-accent-strong)] animate-pulse motion-reduce:animate-none"
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

// The stroke is what draws the country. It runs on inert regions too, so an
// empty region still reads as part of the silhouette rather than as a hole.
const REGION_STROKE = "stroke-foreground/30";

function densityStyle(density: number): CSSProperties {
  const next = Math.min(density + 1, DENSITY_STEPS.length - 1);
  return {
    "--map-density": DENSITY_STEPS[density],
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
  mixed: {
    rest: "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.5] [stroke-width:0.8] hover:[fill-opacity:0.65] hover:[stroke-width:1.1]",
    highlighted:
      "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.65] [stroke-width:1.1]",
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
}) {
  const { locale } = useI18n();
  const d = regionPath(region);

  if (!stats.live) {
    return (
      <path
        d={d}
        aria-hidden
        data-region-state="inert"
        className={cn(
          "pointer-events-none fill-foreground/5 [stroke-width:0.6]",
          REGION_STROKE,
        )}
      />
    );
  }

  const stateName = regionStateName(stats.state);

  return (
    <path
      ref={elementRef}
      d={d}
      role="button"
      tabIndex={tabIndex}
      aria-pressed={stats.state}
      aria-label={`${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}`}
      data-region-state={stateName}
      data-region-density={stats.density}
      data-region-highlighted={highlighted || undefined}
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
      style={stats.state === false ? densityStyle(stats.density) : undefined}
      className={cn(
        "cursor-pointer outline-none transition-[fill,stroke,fill-opacity,stroke-width] motion-reduce:transition-none",
        REGION_LOOK[stateName][highlighted ? "highlighted" : "rest"],
        "focus-visible:stroke-foreground focus-visible:[stroke-width:1.75]",
      )}
    />
  );
}
