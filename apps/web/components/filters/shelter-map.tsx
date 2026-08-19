"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { MAP_HEIGHT, MAP_WIDTH, onMap, project, type LatLon } from "@/lib/geo";
import { PawPrint } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  clusterDiscPositions,
  clusterHitWedges,
  DENSITY_STEPS,
  densityScale,
  discFitsGlyph,
  layoutTowns,
  MARKER_STROKE_WIDTH,
  MAX_CLUSTER_DISCS,
  markerGeometry,
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

export type { ShelterPin } from "@/lib/map-layout";

type RegionStats = {
  values: string[];
  animals: number;
  live: boolean;
  state: boolean | "mixed";
  /** Index into DENSITY_STEPS, by rank among the live regions. */
  density: number;
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
   *  callout, independent of hover. The municipality mode's answer to "so
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

  const highlightedTown = highlightedValue
    ? towns.find((town) =>
        town.shelters.some((shelter) => shelter.value === highlightedValue),
      )
    : undefined;

  const spotlightTowns = spotlightValues?.length
    ? towns.filter((town) =>
        town.shelters.some((shelter) => spotlightValues.includes(shelter.value)),
      )
    : [];
  const highlightedRegionId = highlightedTown
    ? regionAt(project(highlightedTown.shelters[0].at))?.id
    : undefined;

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
                : townSelectableValues(activeTown).length === 0
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

  return (
    <path
      ref={elementRef}
      d={d}
      role="button"
      tabIndex={tabIndex}
      aria-pressed={stats.state}
      aria-label={`${region.name}: ${shelterCount(stats.values.length, locale)}, ${animalCount(stats.animals, locale)}`}
      data-region-state={
        stats.state === true
          ? "selected"
          : stats.state === "mixed"
            ? "mixed"
            : "idle"
      }
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
        // Selection is green, density is grey. They were both foreground alpha
        // before, which made a busy region and a chosen one the same picture.
        // A region highlighted from the list wears its own hover look at rest,
        // rather than fighting a real hover for the same declaration.
        stats.state === true
          ? highlighted
            ? "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.2]"
            : "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.9] [stroke-width:0.9] hover:[fill-opacity:1] hover:[stroke-width:1.2]"
          : stats.state === "mixed"
            ? highlighted
              ? "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.65] [stroke-width:1.1]"
              : "fill-[var(--filter-accent-border)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.5] [stroke-width:0.8] hover:[fill-opacity:0.65] hover:[stroke-width:1.1]"
            : highlighted
              ? cn(
                  "fill-foreground [fill-opacity:var(--map-density-hover)] [stroke-width:1] stroke-foreground/45",
                )
              : cn(
                  "fill-foreground [fill-opacity:var(--map-density)] [stroke-width:0.6] hover:[fill-opacity:var(--map-density-hover)] hover:[stroke-width:1]",
                  REGION_STROKE,
                  "hover:stroke-foreground/45",
                ),
        "focus-visible:stroke-foreground focus-visible:[stroke-width:1.75]",
      )}
    />
  );
}

// Exact keyboard selection stays in the list, so markers remain pointer-only.
function Marker({
  town,
  selected,
  onPick,
  onPointerEnter,
  onPointerLeave,
  onHoverShelter,
  hoveredShelterValue,
  highlighted,
  dimmed,
}: {
  town: Town;
  selected: string[];
  onPick: (values: string[]) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** A cluster wedge gained or lost the pointer. Null on leave. */
  onHoverShelter: (value: string | null) => void;
  /** The shelter whose wedge holds the pointer, so only its disc leans in. */
  hoveredShelterValue: string | null;
  /** The shelter is hovered in the list, so its marker reveals the hit halo
   *  and strengthens its stroke, same as pointer hover would. */
  highlighted: boolean;
  /** The list search matches none of this town's shelters, so the marker
   *  fades back while the matches keep full strength. */
  dimmed: boolean;
}) {
  const shared = town.shelters.length > 1;
  const values = townSelectableValues(town);
  const state = selectionState(values, selected);
  // A town holding only off-site shelters is informational: hover names it,
  // nothing picks it. Unlike a dead marker it keeps its pointer events, so
  // the visitor can find out what the faint dot is.
  const info = values.length === 0;
  const live = townCount(town) > 0 || state !== false;
  const geometry = markerGeometry(town);
  // Two or three discs get one hit wedge each, so a click lands on the shelter
  // it was aimed at instead of toggling the whole town. Empty for single and
  // overflow markers, which keep answering as a whole.
  const wedges = clusterHitWedges(town);
  const wedged = wedges.length > 0;

  return (
    <g
      aria-hidden
      data-marker-kind={shared ? "cluster" : "single"}
      data-marker-key={town.key}
      data-marker-live={live}
      data-marker-shelters={town.shelters.length}
      data-marker-state={
        state === true ? "selected" : state === "mixed" ? "mixed" : "idle"
      }
      data-marker-info={info || undefined}
      data-marker-highlighted={highlighted || undefined}
      data-marker-dimmed={dimmed || undefined}
      onClick={wedged ? undefined : () => live && onPick(values)}
      onPointerEnter={wedged ? undefined : onPointerEnter}
      onPointerLeave={wedged ? undefined : onPointerLeave}
      className={cn(
        "group/pin transition-opacity motion-reduce:transition-none",
        live
          ? wedged
            ? "cursor-default"
            : "cursor-pointer"
          : info
            ? "cursor-default"
            : "pointer-events-none",
        dimmed && "opacity-30",
      )}
    >
      {/* The hit area grows into free space without covering another marker.
          It shows itself on hover, so the target you are aiming at is the
          target you can see. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.hitR}
        className={cn(
          "fill-transparent transition-colors group-hover/pin:fill-foreground/8 motion-reduce:transition-none",
          highlighted && "fill-foreground/8",
        )}
      />

      {!shared ? (
        <MarkerDisc
          cx={town.x}
          cy={town.y}
          r={geometry.discRadius}
          glyphScale={1.15}
          selected={state === true}
          live={live}
          highlighted={highlighted}
        />
      ) : town.shelters.length > MAX_CLUSTER_DISCS ? (
        <CountDisc town={town} state={state} live={live} highlighted={highlighted} />
      ) : (
        <ClusterMarker
          town={town}
          selected={selected}
          live={live}
          highlighted={highlighted}
          hoveredShelterValue={hoveredShelterValue}
        />
      )}

      {/* Painted last so the wedges win the pointer over the halo and the
          discs alike. They are transparent: the discs stay the picture, the
          wedges only divide the target. */}
      {wedges.map(({ value, d }) => {
        const shelter = town.shelters.find((entry) => entry.value === value);
        // An off-site shelter's wedge names it and stops there, the same deal
        // its dot has always had.
        const pickable = live && shelter?.selectable !== false;
        return (
          <path
            key={value}
            d={d}
            data-wedge-shelter={value}
            data-wedge-pickable={pickable || undefined}
            onClick={pickable ? () => onPick([value]) : undefined}
            onPointerEnter={() => onHoverShelter(value)}
            onPointerLeave={() => onHoverShelter(null)}
            className={cn(
              "fill-transparent stroke-none",
              pickable ? "cursor-pointer" : "cursor-default",
            )}
          />
        );
      })}
    </g>
  );
}

function MarkerDisc({
  cx,
  cy,
  r,
  glyphScale,
  selected,
  live,
  discAttribute,
  shelterValue,
  highlighted,
  hoverScope = "group",
}: {
  cx: number;
  cy: number;
  r: number;
  glyphScale: number;
  selected: boolean;
  live: boolean;
  discAttribute?: string;
  shelterValue?: string;
  highlighted?: boolean;
  /** "group" leans in whenever the marker is hovered anywhere. "self" waits to
   *  be told, which is what a wedged cluster needs: one disc answers, not all
   *  of them. */
  hoverScope?: "group" | "self";
}) {
  const glyph = r * glyphScale;
  const groupHover = hoverScope === "group";
  // A shelter with nothing to pick is a place, not a control. A paw disc a
  // shade fainter still read as a control, so it draws as a different shape
  // entirely: a small plain dot, the same mark the municipalities map uses.
  if (!selected && !live) {
    return (
      <g
        data-cluster-disc={discAttribute}
        data-cluster-shelter={shelterValue}
        className={cn(
          "origin-center transition-[fill,transform] [transform-box:fill-box] motion-reduce:transition-none",
          groupHover &&
            "group-hover/pin:scale-110 motion-reduce:group-hover/pin:scale-100",
          highlighted && "scale-110 motion-reduce:scale-100",
        )}
      >
        <circle
          data-marker-empty=""
          cx={cx}
          cy={cy}
          r={r * 0.42}
          className={cn(
            "fill-foreground/35 stroke-none transition-colors motion-reduce:transition-none",
            groupHover && "group-hover/pin:fill-foreground/60",
            highlighted && "fill-foreground/60",
          )}
        />
      </g>
    );
  }
  return (
    <g
      data-cluster-disc={discAttribute}
      data-cluster-shelter={shelterValue}
      className={cn(
        // Each disc grows around its own centre, so cluster discs breathe
        // apart instead of shifting as a block.
        "origin-center transition-[color,fill,stroke,transform] [transform-box:fill-box] motion-reduce:transition-none",
        groupHover &&
          "group-hover/pin:scale-110 motion-reduce:group-hover/pin:scale-100",
        highlighted && "scale-110 motion-reduce:scale-100",
        selected
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : cn(
              "fill-background stroke-foreground/75 text-foreground/75",
              groupHover &&
                "group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
              highlighted && "stroke-foreground text-foreground",
            ),
      )}
    >
      <circle cx={cx} cy={cy} r={r} style={{ strokeWidth: MARKER_STROKE_WIDTH }} />
      {discFitsGlyph(r) && (
        <PawPrint
          x={cx - glyph / 2}
          y={cy - glyph / 2}
          width={glyph}
          height={glyph}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
          className="stroke-current"
        />
      )}
    </g>
  );
}

// One disc per shelter, each carrying that shelter's own selection. The old
// cluster drew two discs whatever the town held, and lit the first of them on
// "mixed" regardless of which shelter was picked.
function ClusterMarker({
  town,
  selected,
  live,
  highlighted,
  hoveredShelterValue,
}: {
  town: Town;
  selected: string[];
  live: boolean;
  highlighted: boolean;
  hoveredShelterValue: string | null;
}) {
  const { clusterRadius } = markerGeometry(town);
  const positions = clusterDiscPositions(town);

  return town.shelters.map((shelter, index) => (
    <MarkerDisc
      key={shelter.value}
      cx={positions[index].x}
      cy={positions[index].y}
      r={clusterRadius}
      glyphScale={1.3}
      selected={selected.includes(shelter.value)}
      // An off-site shelter keeps its faint disc even when its town has
      // animals: the disc, not the town, is what says "this one you can pick".
      live={live && shelter.selectable !== false}
      discAttribute={selected.includes(shelter.value) ? "selected" : "idle"}
      shelterValue={shelter.value}
      // The hovered wedge picks the disc that leans in. A list hover still
      // names the town, so it lights every disc, as before.
      highlighted={highlighted || hoveredShelterValue === shelter.value}
      hoverScope="self"
    />
  ));
}

// Past three shelters the discs stop being readable and stop being honest, so
// the marker says the number instead.
function CountDisc({
  town,
  state,
  live,
  highlighted,
}: {
  town: Town;
  state: boolean | "mixed";
  live: boolean;
  highlighted: boolean;
}) {
  const { discRadius } = markerGeometry(town);
  return (
    <g
      data-cluster-overflow={town.shelters.length}
      className={cn(
        "origin-center transition-[color,fill,stroke,transform] [transform-box:fill-box] group-hover/pin:scale-110 motion-reduce:transition-none motion-reduce:group-hover/pin:scale-100",
        highlighted && "scale-110 motion-reduce:scale-100",
        state === true
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : state === "mixed"
            ? "fill-[var(--filter-accent)] stroke-[var(--filter-accent-strong)] text-[var(--filter-accent-foreground)]"
            : live
              ? cn(
                  "fill-background stroke-foreground/75 text-foreground/75 group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
                  highlighted && "stroke-foreground text-foreground",
                )
              : "fill-background stroke-foreground/40 text-foreground/40",
      )}
    >
      <circle
        cx={town.x}
        cy={town.y}
        r={discRadius}
        style={{ strokeWidth: MARKER_STROKE_WIDTH }}
      />
      <text
        x={town.x}
        y={town.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current stroke-none"
        style={{ fontSize: discRadius * 1.1, fontWeight: 600 }}
      >
        {town.shelters.length}
      </text>
    </g>
  );
}

// One card for markers and regions alike. A native <title> waited half a second
// and came in the browser's own colours.
function MapCallout({
  x,
  y,
  reach,
  title,
  metadata,
}: {
  x: number;
  y: number;
  reach: number;
  title: string;
  metadata: string;
}) {
  const width = 108;
  const height = 38;
  const onRight = x + reach + 4 + width <= MAP_WIDTH - 2;
  const left = onRight ? x + reach + 4 : x - reach - 4 - width;
  const cardX = Math.min(Math.max(left, 2), MAP_WIDTH - width - 2);
  const cardY = Math.min(
    Math.max(y - height / 2, 2),
    MAP_HEIGHT - height - 2,
  );

  return (
    <foreignObject
      x={cardX}
      y={cardY}
      width={width}
      height={height}
      aria-hidden
      className={cn(
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      <div className="flex h-full flex-col justify-center rounded-ui border border-border bg-popover px-[4px] py-[2px] text-popover-foreground shadow-sm">
        <span className="w-full break-words text-[5.5px] font-medium leading-[1.15]">
          {title}
        </span>
        {metadata && (
          <span className="mt-[1.5px] w-full break-words text-[4.75px] leading-[1.15] text-muted-foreground">
            {metadata}
          </span>
        )}
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
