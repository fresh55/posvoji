"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  cityAt,
  distanceKm,
  formatKm,
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
  groupTownsByRegion,
  layoutTowns,
  mapStateName,
  type MapStateName,
  MAX_CLUSTER_DISCS,
  regionStatsByRegion,
  townCount,
  townIsLive,
  townLabel,
  townSelectableValues,
  type RegionStats,
  type ShelterPin,
  type Town,
} from "@/lib/map-layout";
import {
  linesPath,
  OUTLINE_PATH,
  REGION_PATHS,
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
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";
import {
  type CalloutRect,
  calloutType,
  DEFAULT_PLATE_SCALE,
  MapCallout,
  Origin,
  ORIGIN_DASH,
  ORIGIN_REACH,
} from "./map-callout";
import {
  MAP_MORPH,
  Marker,
  PLATE_MIN_SCALE,
  PLATE_TOO_SMALL,
} from "./map-marker";

export type { ShelterPin } from "@/lib/map-layout";

/** What was clicked, alongside the values the click toggles. The toggle needs
 *  only the values; the panel needs to know what the visitor aimed at, so it
 *  can answer with a card about that shelter or about that group.
 *
 *  A cluster disc and a lone marker both answer for one shelter. A region, and
 *  an overflow marker that gave up on one disc per shelter, both answer for a
 *  named set of them. */
export type MapPick =
  | { kind: "shelter"; value: string }
  | { kind: "group"; label: string; values: string[] };

// Whether this town draws the hollow "nothing listed" circle anywhere on it.
// Read off townIsLive, which is what the marker itself decides from, so the
// legend row appears exactly when the circles do.
function townDrawsEmptyMark(town: Town, selected: string[]): boolean {
  // Past MAX_CLUSTER_DISCS the marker gives up on one disc per shelter and
  // says the number instead, and a count disc is never hollow.
  if (town.shelters.length > MAX_CLUSTER_DISCS) return false;
  const live = townIsLive(town, selected);
  // A single marker carries the town's own answer. It cannot be selected
  // while it is not live, so liveness settles it alone.
  if (town.shelters.length === 1) return !live;
  // In a cluster each disc answers for its own shelter, and an off-site one
  // stays hollow even in a town that has animals.
  return town.shelters.some(
    (shelter) =>
      !selected.includes(shelter.value) &&
      !(live && shelter.selectable !== false),
  );
}

/** The three states the legend grows a row for, answered in one pass.
 *
 *  Each row waits for the thing it explains to exist: the solid selection
 *  green the moment a region is picked whole, the hatch the moment one is
 *  partly picked, the hollow circle the moment a shelter with nothing listed
 *  is drawn. So all three questions are about the same country at the same
 *  moment, and one layout, one grouping and one stats pass answer them
 *  together rather than three times over.
 *
 *  Shares that layout and those stats with the map itself, so a row cannot
 *  claim a state the country is not in.
 *
 *  hasEmpty is about markers, which are md+ only; the legend decides for
 *  itself at which widths its own rendering acts on it. */
export function legendFlags(
  pins: ShelterPin[],
  selected: string[],
): { hasSelected: boolean; hasMixed: boolean; hasEmpty: boolean } {
  const towns = layoutTowns(pins);
  const { byRegion } = groupTownsByRegion(towns);
  const regions = regionStatsByRegion(byRegion, selected);
  return {
    hasSelected: regions.some(
      ({ stats }) => stats.live && stats.state === true,
    ),
    hasMixed: regions.some(
      ({ stats }) => stats.live && stats.state === "mixed",
    ),
    hasEmpty: towns.some((town) => townDrawsEmptyMark(town, selected)),
  };
}

/** What an empty region says under "no shelters here": who answers for the
 *  municipalities inside it. Undefined when the coverage table holds nothing
 *  for that region, which leaves the annotation exactly as it was.
 *
 *  Named once because two places have to say it and must not drift: the
 *  annotation a pointer raises, and the region's own aria-label, which is the
 *  only way a screen reader ever gets at a hover. */
function coveredByLine(
  names: string[] | undefined,
  t: ReturnType<typeof useI18n>["t"],
): string | undefined {
  if (!names?.length) return undefined;
  // The verb agrees with how many shelters are named, and Slovenian counts a
  // dual, so the sentence is picked here rather than interpolated into one
  // form that would be wrong for two thirds of the cases.
  const key =
    names.length === 1
      ? "regionCoveredBy"
      : names.length === 2
        ? "regionCoveredByTwo"
        : "regionCoveredByMany";
  // The same middot the map's other metadata pairs are joined by.
  return t(key, { shelters: names.join(" · ") });
}

/** How long a pointer has to rest on an empty region before the plate names
 *  it.
 *
 *  The regions are the whole floor of this map: there is no gap between them,
 *  so every trip to a marker, to the legend or out to the panel grazes two or
 *  three on the way. A live region no longer answers a pointer at all, because
 *  everything its name carried is on screen elsewhere already; an empty one
 *  still does, because who answers for it is a fact with nowhere else to live.
 *  The dwell is what keeps that one exception from becoming the same noise:
 *  a pointer crossing an empty region has not asked it anything.
 *
 *  A marker is a small target somebody aimed at, so it answers on contact, and
 *  so does keyboard focus, which is deliberate by definition.
 *
 *  Exported so a test advances by exactly this rather than by a number that
 *  could drift from it. */
export const REGION_DWELL_MS = 200;

// Regions carry the narrow-screen controls; town markers add pointer precision
// and their own keyboard roving from md up, where they are drawn at all.
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
  summaries,
  regionShelterNames,
}: {
  pins: ShelterPin[];
  selected: string[];
  /** Toggles the values, and says what was aimed at so the panel can answer
   *  the click with a card. See MapPick. */
  onPick: (values: string[], from: MapPick) => void;
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
  /** Per-shelter species breakdown, keyed by shelter id, the same map the
   *  panel's pick card reads. The annotation over a single hovered shelter
   *  grows a line of species glyphs from it. Towns and regions never get one:
   *  they answer for more than one house, and a summed breakdown is a fact
   *  about no shelter in particular. */
  summaries?: Map<string, ShelterSummary>;
  /** Shelters answering for the municipalities inside each region, by region
   *  id, built in the picker from the same coverage table the found-animal
   *  mode reads. A region with no shelters of its own still has somebody
   *  responsible for a stray found there, so its annotation and its label name
   *  them instead of ending at "none here". Regions the table says nothing
   *  about are simply absent from the map, and say nothing extra. */
  regionShelterNames?: Map<number, string[]>;
}) {
  const { locale, messages, t } = useI18n();
  // The dev gallery mounts several maps on one page, and every one of them
  // defines this pattern, so the id cannot be a constant. useId is stripped to
  // alphanumerics because the value it returns carries colons.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hatchId = `map-hatch-${uid}`;
  const contextFadeId = `map-context-fade-${uid}`;
  const hillshadeClipId = `map-hillshade-clip-${uid}`;
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
  /** The pending dwell, so a pointer only passing over a region never gets to
   *  name it. A ref and not state: nothing on screen depends on a timer that
   *  has not fired yet, and re-rendering the plate to say "still waiting"
   *  would be the opposite of the point. */
  const regionDwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (regionDwellRef.current !== null) clearTimeout(regionDwellRef.current);
    },
    [],
  );
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
  /** Region wearing keyboard focus right now, so it earns the same callout a
   *  pointer hover gets. Cleared on blur, unlike focusedRegionId, which the
   *  roving tabindex keeps as the remembered tab stop. */
  const [calloutRegionId, setCalloutRegionId] = useState<number | null>(null);
  const regionRefs = useRef(new Map<number, SVGPathElement>());
  /** The same pair the regions keep, for the coins: the town the roving tab
   *  stop remembers, and the town wearing focus right now, which earns the
   *  annotation a pointer hover earns and gives it back on blur.
   *
   *  The whole mechanism is md+ only, because the marker group is: below md
   *  display:none takes the coins out of the accessibility tree and out of the
   *  tab order alike, and the regions and the list are the controls there. */
  const [focusedTownKey, setFocusedTownKey] = useState<string | null>(null);
  const [calloutTownKey, setCalloutTownKey] = useState<string | null>(null);
  const townRefs = useRef(new Map<string, SVGGElement>());

  const plateRef = useRef<SVGSVGElement>(null);
  /** How many pixels the plate draws one user unit at. The annotations set
   *  their type in the pixels it is read at and divide by this, so a name is
   *  the same size on a tablet plate and on a wide desktop one; see
   *  calloutType in map-callout.tsx. */
  const [plateScale, setPlateScale] = useState(DEFAULT_PLATE_SCALE);

  /** Whether the plate is drawn wide enough for the marker layer to be worth
   *  mounting. The layer is hidden below that width either way, by the same
   *  container query the paws use, but hidden is not free: some three dozen
   *  Marker components with their collision geometry behind them are built,
   *  committed and re-rendered on every hover for a plate nobody can see them
   *  on. This is what actually takes them off a phone.
   *
   *  True until something measures otherwise, which is what keeps the server's
   *  markup and the first client paint identical. Where nothing ever measures
   *  (no ResizeObserver, i.e. the test environment) it simply stays true and
   *  the CSS is left holding the question on its own, exactly as before. */
  const [plateWide, setPlateWide] = useState(true);

  /** Where each annotation on the plate has put its block of type, keyed by
   *  the site that drew it. A table and not a single rectangle because more
   *  than one can stand at once: a spotlight card is persistent, and a hover
   *  raises a second annotation over another town while it is up.
   *
   *  It is kept for the plate's own type. The annotation has no card under it,
   *  so a name drawn across a town anchor interleaves with it letter for
   *  letter, and the halo keeps our name legible without doing a thing for the
   *  other one. The older convention settles which gives way: the name
   *  answering a question outranks the name that was only ever furniture. */
  const [calloutRects, setCalloutRects] = useState<Record<string, CalloutRect>>(
    {},
  );

  /** One identity for every annotation and every render. MapCallout reports
   *  from an effect that has this callback among its dependencies, so a
   *  function rebuilt each render would report each render.
   *
   *  The state only moves when the rectangle actually moved, which is what
   *  keeps the report from ping-ponging with the annotation's own measuring
   *  effect. A report re-renders this component, the annotation re-renders
   *  with the same props, its block lands in the same place, and its effect's
   *  dependencies are therefore unchanged, so it does not fire again. Nothing
   *  the rectangle causes here (an anchor coming off the plate) feeds back
   *  into where the block sits. */
  const handleCalloutRect = useCallback(
    (key: string, rect: CalloutRect | null) => {
      setCalloutRects((current) => {
        const previous = current[key];
        if (!rect) {
          if (!previous) return current;
          const next = { ...current };
          delete next[key];
          return next;
        }
        if (
          previous &&
          previous.x === rect.x &&
          previous.y === rect.y &&
          previous.width === rect.width &&
          previous.height === rect.height
        ) {
          return current;
        }
        return { ...current, [key]: rect };
      });
    },
    [],
  );

  // The SVG's own box is not the plate. It is handed the whole stage and lets
  // preserveAspectRatio letterbox 320 x 210 inside it, so what a unit is drawn
  // at is whichever axis runs out first, never the width alone.
  //
  // Measured and not derived from the viewport, for the reason the paw layer
  // gave up on breakpoints too: the panel folds to a rail and the stage nearly
  // doubles while the viewport never moves. ResizeObserver is absent in the
  // test environment, where nothing is laid out and no annotation is measured
  // anyway, so its absence leaves the default standing rather than throwing.
  useEffect(() => {
    const node = plateRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      const scale = Math.min(box.width / MAP_WIDTH, box.height / MAP_HEIGHT);
      if (scale > 0) {
        setPlateScale(scale);
        // The same threshold the container query gates the paws on, read off
        // the scale that was just measured rather than off a width the stage's
        // own padding would have to be subtracted from.
        setPlateWide(scale >= PLATE_MIN_SCALE);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keyboard focus raises the same annotation the pointer does, so tabbing the
  // coins narrates exactly what hovering them says.
  const activeTown = towns.find(
    (town) => town.key === (hoveredTownKey ?? calloutTownKey),
  );
  const hoveredShelter = hoveredShelterValue
    ? activeTown?.shelters.find(
        (shelter) => shelter.value === hoveredShelterValue,
      )
    : undefined;
  /** The one shelter the annotation is about, when it is about one: the mark
   *  under the pointer inside a shared town, or the only shelter a lone town
   *  holds. Undefined for a cluster answering as a whole, which is what
   *  decides whether the species line is drawn at all. */
  const calloutShelter =
    hoveredShelter ??
    (activeTown?.shelters.length === 1 ? activeTown.shelters[0] : undefined);

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

  // Memoized alongside the grouping above it: ranking twelve regions is a pass
  // over every town, and this component re-renders on every hover anywhere on
  // the map.
  const regions = useMemo(
    () => regionStatsByRegion(byRegion, selected),
    [byRegion, selected],
  );

  // Memoized like `regions` above it: liveRegionIds only has to change when
  // `regions` itself does, so the handlers below that close over it (and are
  // themselves memoized, see the next comment) do not pick up a fresh
  // dependency, and therefore a fresh identity, on every hover-only
  // re-render.
  const liveRegionIds = useMemo(
    () =>
      regions.filter(({ stats }) => stats.live).map(({ region }) => region.id),
    [regions],
  );
  const tabStopRegionId =
    focusedRegionId !== null && liveRegionIds.includes(focusedRegionId)
      ? focusedRegionId
      : liveRegionIds[0];

  // Region and Marker are memoized (see their own definitions), which only
  // pays off if what this component hands them as props is the same object
  // across a re-render that has nothing to do with them. Every handler below
  // is hoisted out of the .map() calls that build the region and marker
  // lists and wrapped in useCallback, and takes the region's or town's own
  // identity as an argument instead of closing over it from inside the map:
  // one function shared by every region (or every marker), not one freshly
  // allocated closure per region or town on every render.
  const handleRegionMoveFocus = useCallback(
    (currentId: number, key: RegionMoveKey) => {
      const currentIndex = liveRegionIds.indexOf(currentId);
      if (currentIndex < 0) return;
      const nextIndex =
        key === "Home"
          ? 0
          : key === "End"
            ? liveRegionIds.length - 1
            : key === "ArrowLeft" || key === "ArrowUp"
              ? (currentIndex - 1 + liveRegionIds.length) %
                liveRegionIds.length
              : (currentIndex + 1) % liveRegionIds.length;
      const nextId = liveRegionIds[nextIndex];
      setFocusedRegionId(nextId);
      requestAnimationFrame(() => regionRefs.current.get(nextId)?.focus());
    },
    [liveRegionIds],
  );

  const setRegionRef = useCallback(
    (regionId: number, element: SVGPathElement | null) => {
      if (element) regionRefs.current.set(regionId, element);
      else regionRefs.current.delete(regionId);
    },
    [],
  );

  const handleRegionFocus = useCallback((regionId: number) => {
    setFocusedRegionId(regionId);
    setCalloutRegionId(regionId);
  }, []);

  const handleRegionBlur = useCallback((regionId: number) => {
    setCalloutRegionId((current) => (current === regionId ? null : current));
  }, []);

  const handleRegionPointerEnter = useCallback(
    (regionId: number, stats: RegionStats) => {
      // Whatever the pointer just left, it is not being named now.
      if (regionDwellRef.current !== null) {
        clearTimeout(regionDwellRef.current);
        regionDwellRef.current = null;
      }
      if (stats.live) {
        // Hovering a live region previews the rows a click would change, which
        // matters most here: one region click can toggle several shelters.
        // This is the whole of what a live region says to a pointer: a quiet
        // tint on a list somebody is already reading.
        onHoverShelters?.(stats.values);
        // And no name. Everything a live region's callout carried is already
        // on screen twice over: the counts are in the list beside the map, the
        // ramp is in the legend under it, and every marker on it answers for
        // itself. Naming the floor as well meant a label under the pointer on
        // the way to any of them, which is the noise the dwell was trying to
        // ration rather than remove.
        return;
      }
      // An empty region is the exception, and the reason the dwell survives.
      // Nothing else on the plate can say who answers for a region with no
      // shelters in it, so this callout is the only way that fact is ever
      // seen; the dwell is what keeps a pointer crossing it from being asked.
      regionDwellRef.current = setTimeout(() => {
        regionDwellRef.current = null;
        setHoveredRegionId(regionId);
      }, REGION_DWELL_MS);
    },
    [onHoverShelters],
  );

  const handleRegionPointerLeave = useCallback(
    (regionId: number, stats: RegionStats) => {
      // A pointer that left before the dwell was up was passing through, so
      // the name it never earned is cancelled rather than delivered late. A
      // re-entry starts the wait over, which is what makes this dwell and not
      // a debounce across the whole plate.
      if (regionDwellRef.current !== null) {
        clearTimeout(regionDwellRef.current);
        regionDwellRef.current = null;
      }
      setHoveredRegionId((current) => (current === regionId ? null : current));
      if (stats.live) onHoverShelters?.(null);
    },
    [onHoverShelters],
  );

  const handleTownPointerEnter = useCallback(
    (town: Town) => {
      setHoveredTownKey(town.key);
      setHoveredShelterValue(null);
      onHoverShelters?.(town.shelters.map((shelter) => shelter.value));
    },
    [onHoverShelters],
  );

  const handleTownPointerLeave = useCallback(
    (town: Town) => {
      setHoveredTownKey((current) => (current === town.key ? null : current));
      onHoverShelters?.(null);
    },
    [onHoverShelters],
  );

  const handleTownHoverShelter = useCallback(
    (town: Town, value: string | null) => {
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
    },
    [onHoverShelters],
  );

  // Every town a click can toggle, which is every town the coins offer the
  // keyboard: townIsLive already answers "is this marker a control or only a
  // place", and a place is not a tab stop. Sorted west to east so Home and End
  // land somewhere a reader of the map can predict, and memoized like
  // liveRegionIds above for the same reason.
  const focusableTowns = useMemo(
    () =>
      towns
        .filter((town) => townIsLive(town, selected))
        .sort((a, b) => a.x - b.x || a.y - b.y),
    [towns, selected],
  );
  // One tab stop for the whole plate of coins, the way the regions share one.
  const tabStopTownKey =
    focusedTownKey !== null &&
    focusableTowns.some((town) => town.key === focusedTownKey)
      ? focusedTownKey
      : focusableTowns[0]?.key;

  const setTownRef = useCallback((town: Town, element: SVGGElement | null) => {
    if (element) townRefs.current.set(town.key, element);
    else townRefs.current.delete(town.key);
  }, []);

  const handleTownFocus = useCallback((town: Town) => {
    setFocusedTownKey(town.key);
    setCalloutTownKey(town.key);
  }, []);

  const handleTownBlur = useCallback((town: Town) => {
    setCalloutTownKey((current) => (current === town.key ? null : current));
  }, []);

  const handleTownMoveFocus = useCallback(
    (town: Town, key: RegionMoveKey) => {
      const next = townInDirection(focusableTowns, town, key);
      if (!next) return;
      setFocusedTownKey(next.key);
      requestAnimationFrame(() => townRefs.current.get(next.key)?.focus());
    },
    [focusableTowns],
  );

  // A marker sits on top of its region, so both would report a hover. The
  // marker is the more precise answer and wins.
  //
  // Two ways in, and they no longer cover the same regions. hoveredRegionId is
  // set by the pointer and only ever for an empty one (see the enter handler);
  // calloutRegionId is set by keyboard focus, which is only ever a live one,
  // because an empty region takes no focus. So the two can never name the same
  // region at once, and a sighted keyboard user still sees where they are on a
  // plate that says nothing to a passing pointer.
  const hoveredRegion = activeTown
    ? undefined
    : regions.find(
        ({ region }) => region.id === (hoveredRegionId ?? calloutRegionId),
      );

  return (
    <svg
      ref={plateRef}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label={messages.shelterMapLabel}
      className={cn("h-auto w-full shrink-0", className)}
    >
      <defs>
        <MixedHatch id={hatchId} />
        <ContextFade id={contextFadeId} />
        {/* The relief stops at the border. Slovenia is the subject and the
            neighbours are a silhouette; terrain running on across them would
            make the ground the subject instead. */}
        <clipPath id={hillshadeClipId}>
          <path d={COUNTRY_OUTLINE} />
        </clipPath>
      </defs>

      <GeographicContext maskId={contextFadeId} clipId={hillshadeClipId} />

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
          // The raw toggle-and-say-what-was-clicked callback, unadapted:
          // Region already has region and stats as its own props, so it
          // builds the MapPick itself. Handed straight through rather than
          // wrapped here, which is what keeps this prop's identity the same
          // for every region on every render; see the note above
          // handleRegionMoveFocus for why that is the point.
          onPick={onPick}
          tabIndex={region.id === tabStopRegionId ? 0 : -1}
          elementRef={setRegionRef}
          onFocus={handleRegionFocus}
          onBlur={handleRegionBlur}
          onMoveFocus={handleRegionMoveFocus}
          onPointerEnter={handleRegionPointerEnter}
          onPointerLeave={handleRegionPointerLeave}
          highlighted={region.id === highlightedRegionId}
          densityFocus={regionDensityFocus(stats, highlightedDensity)}
          // Read straight off the map the picker memoizes, so every region is
          // handed the same array across a render that has nothing to do with
          // it: Region is memoized, and a fresh array per render would undo
          // that for all twelve of them. A live region ignores it.
          coveredBy={regionShelterNames?.get(region.id)}
          hatchId={hatchId}
        />
      ))}

      {/* Over the choropleth, so a town name is never read through a region
          fill, and under everything a click or a hover produces. */}
      <PlateFurniture
        towns={towns}
        calloutRects={Object.values(calloutRects)}
        wide={plateWide}
      />

      {/* Under the callouts on purpose: a card is the answer someone just
          asked for, and the bar is furniture that can wait behind it. */}
      <ScaleBar />

      {origin && onMap(origin) && <Origin at={origin} />}

      {/* The class is still what hides the layer, so the server and the first
          paint agree; plateWide is what stops building it once the plate has
          measured itself too small to show it. See the state's own note. */}
      {plateWide && (
      <g className="hidden md:block">
        {towns.map((town) => (
          <Marker
            key={town.key}
            town={town}
            selected={selected}
            // Handed straight through, unadapted: Marker already has town as
            // its own prop, and builds the MapPick itself. Same reasoning as
            // Region's own onPick above.
            onPick={onPick}
            highlighted={town.key === highlightedTown?.key}
            dimmed={
              matchedValues != null &&
              !town.shelters.some((shelter) =>
                matchedValues.includes(shelter.value),
              )
            }
            // Scoped to the town it names rather than handed to every
            // marker: this state is which single shelter inside one town's
            // cluster holds the pointer, and every other town's marker would
            // otherwise see that value change on a render that has nothing
            // to do with it.
            hoveredShelterValue={
              town.key === hoveredTownKey ? hoveredShelterValue : null
            }
            onPointerEnter={handleTownPointerEnter}
            onPointerLeave={handleTownPointerLeave}
            onHoverShelter={handleTownHoverShelter}
            // One tab stop for the whole plate of coins; the arrows move
            // between them from there. A town that is not a control never
            // takes the stop, and the marker refuses it as well.
            tabIndex={town.key === tabStopTownKey ? 0 : -1}
            elementRef={setTownRef}
            onFocus={handleTownFocus}
            onBlur={handleTownBlur}
            onMoveFocus={handleTownMoveFocus}
          />
        ))}

        {/* Under the annotation and over the coins: how far the visitor is
            from the town they are pointing at, in the dashes the origin ring
            already wears, because both marks are about the same person.
            A town only. A region hover asks about a dozen shelters spread
            over a province, and a line from one point to a polygon measures
            nothing anybody asked for. */}
        {origin && onMap(origin) && activeTown && (
          <OriginDistance
            origin={origin}
            town={activeTown}
            scale={plateScale}
            // The same number the list rows carry, from the same two
            // functions, so the map and the row cannot disagree about how far
            // away a town is.
            label={formatKm(
              distanceKm(origin, activeTown.shelters[0].at),
              messages.lessThanOneKm,
            )}
          />
        )}

        {/* Keep the active tooltip above every marker. A spotlighted town
            already wears a persistent card saying the same thing, so hover
            must not stack a second card on top of it. */}
        {activeTown && !spotlightTowns.some((t) => t.key === activeTown.key) && (
          <MapCallout
            x={activeTown.x}
            y={activeTown.y}
            reach={activeTown.r}
            scale={plateScale}
            // One town annotation at a time, whichever town it is about, so
            // one name covers the site rather than one per town.
            rectKey="town"
            onRect={handleCalloutRect}
            // Who lives there, when the annotation is about one house. A
            // cluster's own card answers for its town, and the breakdown of a
            // town is a fact about no shelter in it.
            species={
              calloutShelter
                ? summaries?.get(calloutShelter.value)?.species
                : undefined
            }
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
      )}

      {hoveredRegion && (
        <MapCallout
          x={hoveredRegion.region.label[0]}
          y={hoveredRegion.region.label[1]}
          reach={4}
          scale={plateScale}
          // Its own site, because a region annotation and a spotlight card can
          // be up together. Only one region answers at a time, so the site
          // needs no region id in its name.
          rectKey="region"
          onRect={handleCalloutRect}
          title={hoveredRegion.region.name}
          metadata={
            hoveredRegion.stats.live
              ? `${shelterCount(hoveredRegion.stats.values.length, locale)} · ${animalCount(hoveredRegion.stats.animals, locale)}`
              : messages.noSheltersInRegion
          }
          // Only where the map has run out of shelters of its own. A live
          // region's own counts are the answer, and naming somebody else's
          // coverage under them would be a second answer to a question nobody
          // asked here.
          note={
            hoveredRegion.stats.live
              ? undefined
              : coveredByLine(
                  regionShelterNames?.get(hoveredRegion.region.id),
                  t,
                )
          }
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
        <g
          key={`spot-${town.key}`}
          data-map-spotlight={town.key}
          aria-hidden
          className="pointer-events-none"
        >
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
          scale={plateScale}
          // One site per spotlighted town, unlike the two above: a lookup can
          // name several shelters at once and every card it raises stands at
          // the same time, so a shared name would have them overwriting each
          // other's rectangle.
          rectKey={`spotlight-${town.key}`}
          onRect={handleCalloutRect}
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

// How much a town off the axis is punished against one straight ahead, when an
// arrow key asks for the next coin. Two, so a town twice as far along the
// direction pressed still wins over one that is barely to the side.
const TOWN_AXIS_DRIFT = 2;

/** Where an arrow key takes focus from one coin.
 *
 *  The regions rove by list order, which is all twelve areas can do: they have
 *  no single point to be east or west of. Towns are points on a plate, three
 *  dozen of them and in no order at all, so an arrow here means the direction
 *  it draws: the nearest town on that side, weighted so one straight ahead
 *  beats a nearer one well off the axis.
 *
 *  Nothing wraps. Pressing east at the eastern-most town leaves focus where it
 *  is, because the country has an edge and pretending it does not would throw
 *  the visitor across the map. Home and End take the ends of the west-to-east
 *  order the list arrives in, which is the one order reading a map has. */
function townInDirection(
  towns: Town[],
  from: Town,
  key: RegionMoveKey,
): Town | undefined {
  if (key === "Home") return towns[0];
  if (key === "End") return towns[towns.length - 1];
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const forward = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  let best: Town | undefined;
  let bestCost = Infinity;
  for (const town of towns) {
    if (town.key === from.key) continue;
    const along = (horizontal ? town.x - from.x : town.y - from.y) * forward;
    if (along <= 0) continue;
    const across = Math.abs(horizontal ? town.y - from.y : town.x - from.x);
    const cost = along + across * TOWN_AXIS_DRIFT;
    if (cost < bestCost) {
      bestCost = cost;
      best = town;
    }
  }
  return best;
}

// How far outside a marker the spotlight ring sits, in user units. Shared with
// the connector, which stops at the ring rather than crossing it.
const SPOTLIGHT_RING = 3.5;

// Where the distance line stops short of the coin it measures to. The other
// end stops at ORIGIN_REACH, which is the ring's own outer edge: both marks
// give way to the line rather than being drawn through by it, the same deal
// the municipality connector keeps.
const DISTANCE_END_GAP = 1.2;
// Under this much line there is nowhere to set a label that does not touch the
// ring at one end or the coin at the other, so the line runs bare and the row
// in the list carries the number. In kilometres this is about nineteen, which
// is a distance nobody is surprised by.
const DISTANCE_LABEL_MIN = 24;
const DISTANCE_WIDTH = 0.5;

/** How far the visitor is from the town under the pointer, drawn from the
 *  origin mark's edge to the coin's in the dashes the origin ring wears. The
 *  two marks answer for the same person, so they speak the same line.
 *
 *  Half the connector's width and a step quieter than it: the municipality
 *  line answers a question that was asked out loud, and this one only fills in
 *  a hover. */
function OriginDistance({
  origin,
  town,
  label,
  scale,
}: {
  origin: LatLon;
  town: Town;
  label: string;
  scale: number;
}) {
  const at = project(origin);
  const dx = town.x - at.x;
  const dy = town.y - at.y;
  const length = Math.hypot(dx, dy);
  const end = town.r + DISTANCE_END_GAP;
  // A shelter in the visitor's own town leaves nothing between the ring and
  // the coin, and a stub drawn through both would say less than nothing.
  if (length <= ORIGIN_REACH + end) return null;
  const x1 = at.x + (dx / length) * ORIGIN_REACH;
  const y1 = at.y + (dy / length) * ORIGIN_REACH;
  const x2 = town.x - (dx / length) * end;
  const y2 = town.y - (dy / length) * end;
  const type = calloutType(scale);
  return (
    <g aria-hidden className="pointer-events-none">
      <line
        data-map-distance
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={DISTANCE_WIDTH}
        strokeDasharray={ORIGIN_DASH}
        strokeLinecap="round"
        className="stroke-foreground opacity-55"
      />
      {length - ORIGIN_REACH - end >= DISTANCE_LABEL_MIN && (
        <text
          data-map-distance-label
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={type.metadata}
          // A stroke under the fill, not the blurred halo the annotation
          // carries. The line runs straight through this label, and a stroke
          // knocks the dashes out from behind the letterforms where a shadow
          // would only veil them. text-shadow is the tool for HTML in a
          // foreignObject; paint-order is the tool for SVG text.
          stroke="var(--background)"
          strokeWidth={type.halo * 2}
          strokeLinejoin="round"
          className="fill-foreground/70 [paint-order:stroke]"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// The plate's own type, the part a printed atlas carries and a chart does not:
// the neighbours named, the water named, and three anchor towns so the outline
// reads as Slovenia to somebody who does not already know the shape. None of it
// is a control and none of it is content: aria-hidden, no pointer events, and
// foreground alpha well under the callouts, which are the type that answers
// questions.
//
// Every number below is in viewBox units and was tuned against the live plate.
// Two rules set them. Nothing
// sits within 4 units of a viewBox edge, because the SVG letterboxes into
// containers of every aspect ratio and a label on the frame is a label waiting
// to be clipped. And nothing comes within a marker's reach of a marker the real
// roster draws: markers top out at radius 7.2 (MARKER_RADIUS_STEPS in
// lib/map-layout.ts) and may drift a further few units under collision layout,
// so an anchor keeps about ten units from its own town's centre.
const FURNITURE_INK = "fill-foreground/35";

// Sized to fit the land it names. Italy, Hungary and Croatia each show only a
// wedge of themselves in this viewBox, so the type is small and letterspaced
// rather than large: spaced capitals read as a region name at any size, which
// is exactly why atlases set country names that way.
const NEIGHBOR_TYPE = 4.6;

// Slovenian names in both locales, deliberately. This is a Slovenian plate:
// an Austrian sheet writes Wien whatever language you read it in, and the
// exonyms are close enough cognates that no English reader is lost. Localizing
// them would also put the one label the map owns into the message catalogue,
// where copy edits could drift it off the cartography it belongs to.
const NEIGHBOR_LABELS: {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  /** Degrees around (x, y). Only for a country the frame holds as a sliver
   *  too narrow for level type; the name then runs along the sliver, which is
   *  how printed atlases set a neighbour that barely enters the sheet. */
  rotate?: number;
}[] = [
  // The Friuli plain south-west of Gorizia, which is the widest Italian ground
  // the frame holds. It ends about three units short of the frontier, measured
  // off the rendered plate, and ten short of Vitovlje's marker at (41, 137).
  { text: "ITALIJA", x: 4, y: 136, anchor: "start" },
  // Carinthia, north of the Karavanke and clear of the top edge by more than
  // the cap height.
  { text: "AVSTRIJA", x: 150, y: 14, anchor: "middle" },
  // Hungary inside this frame is a diagonal wedge east of the Goričko border,
  // which runs x 286 to 299 down y 10 to 40: about 30 units of room, but only
  // along the slant. Level type this long crossed the border into Slovenia
  // however it was anchored, so the name runs with the wedge instead.
  { text: "MADŽARSKA", x: 291, y: 17, anchor: "start", rotate: 38 },
  // Gorski kotar, well south of the Kolpa.
  { text: "HRVAŠKA", x: 215, y: 200, anchor: "middle" },
];

// Italic is the water's register on every map ever printed, so the gulf gets it
// and nothing else does. Set in the one corner the context fade deliberately
// spares (see SEA_KEEP_* above), which is the only open water in the frame.
// Two stacked lines, because the water is a column about twenty units wide and
// the name set level is thirty: one line had nowhere to stand but the Italian
// coast, which is dry land and the wrong country besides.
const SEA_LABEL = {
  lines: ["Jadransko", "morje"],
  x: 12,
  y: 191,
  leading: 5,
  size: 3.4,
};

// Three towns, no dots. A dot would be a fourth kind of mark on a plate that
// already has markers, region fills and an origin ring, and would read as a
// shelter that is not there. The name alone is enough: these are anchors for
// the eye, not entries in the roster.
//
// Ljubljana and Maribor carry real markers, and collision layout may nudge a
// marker off its projected point, so a name offset from the raw coordinate
// could drift away from the disc it appears to caption. Each name therefore
// follows its town's laid-out position when one exists, sitting just off the
// disc's own edge. Kranj has no shelter and no marker, so its name stays on
// the projected point, pushed north-west away from Škofja Loka's marker.
const CITY_ANCHOR_TYPE = 3.8;
const CITY_ANCHOR_GAP = 1.8;

// What one character of an anchor's name is worth in width, as a share of the
// type size. The box is estimated from the character count rather than
// measured: getBBox does not exist in the test environment at all, and where
// it does exist it answers for whichever font actually loaded, so a layout
// decision resting on it would differ between two machines drawing the same
// plate.
//
// The plate's sans averages near 0.52 em a glyph across mixed-case names of
// this kind, and the anchors add 0.04 em of tracking on top of that. 0.62 is
// deliberately over the sum: this estimate only decides whether a name is
// about to be read through an annotation, and being wrong one way costs an
// anchor nobody misses for as long as the hover lasts, while being wrong the
// other way is the two names interleaved that this exists to prevent.
const ANCHOR_WIDTH_PER_CHAR = 0.62;
// How far the type reaches above and below the baseline it is set on, again as
// a share of the size and again rounded outward: ascenders run near 0.72 in
// this family and descenders near 0.21.
const ANCHOR_ASCENT = 0.8;
const ANCHOR_DESCENT = 0.25;

// Whether two rectangles in user units touch at all.
function boxesOverlap(a: CalloutRect, b: CalloutRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/** The box an anchor's name takes up, estimated from its character count. `x`
 *  is where the text is anchored and `y` the baseline it sits on, so a name
 *  set ragged-left grows to the right of x and one set ragged-right grows to
 *  the left of it. */
function anchorBox(
  text: string,
  x: number,
  y: number,
  anchor: "start" | "end",
): CalloutRect {
  const width = text.length * CITY_ANCHOR_TYPE * ANCHOR_WIDTH_PER_CHAR;
  return {
    x: anchor === "start" ? x : x - width,
    y: y - CITY_ANCHOR_TYPE * ANCHOR_ASCENT,
    width,
    height: CITY_ANCHOR_TYPE * (ANCHOR_ASCENT + ANCHOR_DESCENT),
  };
}
const CITY_ANCHORS: {
  city: string;
  anchor: "start" | "end";
}[] = [
  { city: "Ljubljana", anchor: "start" },
  { city: "Maribor", anchor: "start" },
  { city: "Kranj", anchor: "end" },
];

function PlateFurniture({
  towns,
  calloutRects,
  wide,
}: {
  towns: Town[];
  /** Every annotation standing on the plate right now. A town anchor drawn
   *  across one of them comes off for as long as it is up; see the anchor
   *  branch below. */
  calloutRects: CalloutRect[];
  /** Whether the plate has measured itself wide enough to draw the anchors at
   *  all. The class below still hides them; this is what stops the layout work
   *  behind them. See plateWide in ShelterMap. */
  wide: boolean;
}) {
  return (
    // Every name on this layer is set in the map's own units, so a plate drawn
    // a third the size sets them a third the size with it: on a phone the
    // country names and the water came out four or five pixels, which is not
    // quiet type, it is dirt on the paper. They leave at the same width the
    // paws and the markers leave at, which is the width below which nothing
    // this small can be read.
    <g
      aria-hidden
      data-map-furniture
      className={cn("pointer-events-none", PLATE_TOO_SMALL)}
    >
      {NEIGHBOR_LABELS.map((label) => (
        <text
          key={label.text}
          data-map-neighbor={label.text}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          fontSize={NEIGHBOR_TYPE}
          transform={
            label.rotate != null
              ? `rotate(${label.rotate} ${label.x} ${label.y})`
              : undefined
          }
          className={cn("uppercase tracking-[0.16em]", FURNITURE_INK)}
        >
          {label.text}
        </text>
      ))}

      <text
        data-map-sea-label
        x={SEA_LABEL.x}
        y={SEA_LABEL.y}
        textAnchor="middle"
        fontSize={SEA_LABEL.size}
        fontStyle="italic"
        className={FURNITURE_INK}
      >
        {SEA_LABEL.lines.map((line, index) => (
          <tspan
            key={line}
            x={SEA_LABEL.x}
            y={SEA_LABEL.y + index * SEA_LABEL.leading}
          >
            {line}
          </tspan>
        ))}
      </text>

      {/* md+ only, exactly like the markers these are placed around. Below md
          the plate draws no markers at all and the whole map is about a third
          the size, where 3.8-unit type renders under five pixels: unreadable
          type is not quiet, it is dirt. */}
      {wide && (
      <g className="hidden md:block">
        {CITY_ANCHORS.map((anchor) => {
          // The town's laid-out disc when the city has one, so the name stays
          // welded to the mark it captions however far collision layout nudged
          // it; the raw projection when it does not.
          const town = towns.find((candidate) => candidate.city === anchor.city);
          const at = town ?? (() => {
            const raw = cityAt(anchor.city);
            return raw ? { ...project(raw), r: 0 } : null;
          })();
          if (!at) return null;
          const dx =
            anchor.anchor === "start"
              ? at.r + CITY_ANCHOR_GAP
              : -(at.r + CITY_ANCHOR_GAP + 0.7);
          const textX = at.x + dx;
          const textY = at.y + (town ? 1.4 : -3.5);
          // The cartographic convention, and the whole reason the annotations
          // report where they landed. An annotation carries no card, so a name
          // drawn under one interleaves with it letter for letter: the halo
          // keeps the annotation readable and does nothing at all for the
          // anchor. The anchor is the one that gives way, because it answers
          // no question. It is simply not on the plate while the annotation
          // is, with no transition of its own: this is not a state the name is
          // in, it is a name that is not being drawn.
          //
          // Anchor text only. The coins never move for an annotation, being
          // the subject it is about, and the neighbour and sea names are set
          // out over ground that draws no markers and raises no annotations.
          const covered = calloutRects.some((rect) =>
            boxesOverlap(
              anchorBox(anchor.city, textX, textY, anchor.anchor),
              rect,
            ),
          );
          if (covered) return null;
          return (
            <text
              key={anchor.city}
              data-map-city={anchor.city}
              x={textX}
              y={textY}
              textAnchor={anchor.anchor}
              fontSize={CITY_ANCHOR_TYPE}
              className={cn("tracking-[0.04em]", FURNITURE_INK)}
            >
              {anchor.city}
            </text>
          );
        })}
      </g>
      )}
    </g>
  );
}

// A round number that stays a caption. 50 km would be 62.9 units, a fifth of
// the map's width, and would read as a graphic rather than as a measure; 25 km
// is 31.4 units, about the width of the legend row it stands over.
const SCALE_BAR_KM = 25;
// The bottom-right corner, with the rest of the map's furniture. Right end six
// units off the edge, matching the margin the plate's other type keeps.
//
// y 194 and no longer 176: the bar used to be held that far up because the
// legend was an HTML overlay on this canvas whose height moved with the aspect
// ratio, so the only safe thing was to clear the tallest it could get. The
// legend is a caption under the plate now (see location-picker.tsx), nothing
// is drawn over this corner any more, and the bar can sit where a printed
// sheet would put it: near the frame, with the four units of margin the rest
// of the furniture keeps. Everything in this corner is Croatia at this
// projection (lon 15.9 east, lat 45.6 south), so the bar crosses no shape of
// Slovenia's.
const SCALE_BAR_RIGHT = 314;
const SCALE_BAR_Y = 194;
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
    // Off the plate below the width the rest of the small type leaves at: the
    // bar's own label is 4.2 units, which is about five pixels on a phone.
    <g aria-hidden className={cn("pointer-events-none", PLATE_TOO_SMALL)}>
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
const FADE_STRIPS = [
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
const FADE_KEEPS = [
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

function ContextFade({ id }: { id: string }) {
  return (
    <>
      {FADE_STRIPS.map((strip) => (
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
      {FADE_KEEPS.map((keep) => (
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
      {FADE_KEEPS.map((keep) => (
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
        {FADE_STRIPS.map((strip) => (
          <rect
            key={strip.key}
            x={strip.x}
            y={strip.y}
            width={strip.w}
            height={strip.h}
            fill={`url(#${id}-${strip.key})`}
            mask={
              FADE_KEEPS.some((keep) => keep.key === strip.key)
                ? `url(#${id}-${strip.key}-keep-mask)`
                : undefined
            }
          />
        ))}
      </mask>
    </>
  );
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

// Slovenia is an alpine country and this plate was drawing it flat. The raster
// is a real hillshade: AWS Open Data terrain tiles (Mapzen terrarium encoding,
// SRTM and friends underneath) at zoom 9, reprojected pixel by pixel through
// the inverse of project() in lib/geo.ts so a ridge lands where the border that
// follows it lands, then shaded with Horn's slope and aspect under the
// cartographic sun: azimuth 315, altitude 45. 640 x 420, twice the viewBox.
// scripts/build-map-hillshade.mjs is the whole pipeline and reruns in a minute.
//
// The raster is shadow only. Flat ground is pure white, and multiply cannot
// lighten, so nothing above the flat value could ever have shown; leaving it in
// would only have laid a grey wash over the plate. That is why the sea and the
// Pannonian plain cost nothing here and the Alps cost everything.
//
// Which leaves the two things this must not do. It must not read as a subject:
// the choropleth keeps the floor, so the opacity is set from a token the theme
// owns and is small enough that a region's density step still wins any
// comparison. And it must not read as terrain across the frontier, which is
// what the country clip is for.
//
// Dark carries its own token values. Multiply on a near-black land base has no
// headroom, so dark inverts the raster and screens it: the same slopes, drawn
// as light on dark instead of dark on light, at a lower opacity again because
// a light mark on a dark ground carries further. See --map-relief-* in
// globals.css.
function Hillshade({ clipId }: { clipId: string }) {
  return (
    <image
      data-map-hillshade
      href="/map-hillshade.png"
      x={0}
      y={0}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      // The raster is 640 x 420 and the viewBox is 320 x 210, the same ratio,
      // so this changes no pixel. It is here so that a future viewBox cannot
      // silently letterbox the relief off its own coordinates.
      preserveAspectRatio="none"
      clipPath={`url(#${clipId})`}
      className={cn(
        "[mix-blend-mode:var(--map-relief-blend)]",
        "[filter:invert(var(--map-relief-invert))]",
        "opacity-[var(--map-relief-opacity)]",
      )}
    />
  );
}

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
function GeographicContext({
  maskId,
  clipId,
}: {
  maskId: string;
  clipId: string;
}) {
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

      <Hillshade clipId={clipId} />

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

// Named locally because the JSX below reads it four times; the walk behind it
// happens once, in lib/map-regions.ts.
const COUNTRY_OUTLINE = OUTLINE_PATH;

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

// --map-density and --map-density-hover are alphas, not colours. The colour is
// --map-density-fill, which the theme owns and every step shares; only the
// alpha moves with the ranking.
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

// The three a live region can wear. An inert one leaves before this table is
// reached, and has no look to pick: it draws the one branch below.
type LiveRegionState = Exclude<MapStateName, "inert">;

// Selection and density share one hue and differ in commitment: density is
// --map-density-fill, a muted green laid on at the ramp's alpha, and a
// selected region is the saturated selection green with its own stroke. They
// were both foreground alpha once, which made a busy region and a chosen one
// the same picture, and a grey ramp under a green selection made the map read
// as a statistics plate. A region highlighted from the list wears its own
// hover look at rest, rather than fighting a real hover for the same
// declaration. Keyed by region state so the JSX picks a class string instead
// of nesting a nine-way ternary.
const REGION_LOOK: Record<
  LiveRegionState,
  { rest: string; highlighted: string }
> = {
  selected: {
    // fill is --map-selected-fill, not --filter-accent-border: the accent
    // token sits in the same luminance band as the density ramp's darkest
    // step (1.09:1 on light, 1.15:1 on dark, both under the ramp's own
    // smallest step), so on dark the chosen region could composite darker
    // than the busiest one and colour alone told nobody which region was
    // picked. The dedicated token is tuned to keep the family's hue while
    // clearing 1.35:1 against that step in both themes; see its definition in
    // globals.css for the composite math.
    //
    // Stroke weight carries the rest of the answer, because it is the one
    // channel every vision deficiency and every phone still reads: 1.5 at
    // rest is already heavier than any other region ever draws (idle tops out
    // at 1 on hover), and 1.8 on hover/highlighted keeps it the heaviest line
    // on the plate even against an idle region's own hover step.
    rest: "fill-[var(--map-selected-fill)] stroke-[var(--filter-accent-strong)] [fill-opacity:0.9] [stroke-width:1.5] hover:[fill-opacity:1] hover:[stroke-width:1.8]",
    highlighted:
      "fill-[var(--map-selected-fill)] stroke-[var(--filter-accent-strong)] [fill-opacity:1] [stroke-width:1.8]",
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
      "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density)] [stroke-width:0.6] hover:[fill-opacity:var(--map-density-hover)] hover:[stroke-width:1]",
      REGION_STROKE,
      "hover:stroke-foreground/45",
    ),
    highlighted:
      "fill-[var(--map-density-fill)] [fill-opacity:var(--map-density-hover)] [stroke-width:1] stroke-foreground/45",
  },
};

// The keys a roving-tabindex walk answers, regions and coins alike. Named once
// so ShelterMap's move handlers, Region's and Marker's own prop types and both
// onKeyDown branches read off the same union instead of four hand-typed copies
// that could drift apart. Exported for map-marker.tsx, type-only, which is why
// the two files can import from each other without becoming circular.
export type RegionMoveKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

// Empty regions remain visible and answer a hover with their name and "no
// shelters", but nothing more: no click, no tab stop. Every other mark on this
// map says something when asked, and a region that said nothing read as a
// broken map rather than as an empty one.
//
// Memoized: every hover anywhere on the map sets state in ShelterMap, which
// re-renders its whole tree, and there are up to twelve of these on screen at
// once. Only the region actually under the pointer (or newly wearing a
// highlight, or a density-legend match) has anything to redraw; memo is what
// stops the other eleven from doing the same work for nothing. It only pays
// off because ShelterMap hoists every handler below to one identity shared by
// every region, instead of building a fresh closure per region on every
// render — see the handleRegion* callbacks and the comment above them.
// Exported so a render-count test can spy on Region.type (the function
// React.memo wraps) without instrumenting the component itself: nothing else
// in the app needs this outside shelter-map.tsx.
export const Region = memo(function Region({
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
  coveredBy,
  hatchId,
}: {
  region: RegionShape;
  stats: RegionStats;
  /** The map's own click callback, unadapted: this component already has
   *  region and stats as its own props, so it builds the MapPick itself
   *  rather than being handed a wrapper that would need a fresh identity on
   *  every render. */
  onPick: (values: string[], from: MapPick) => void;
  tabIndex: 0 | -1;
  /** Takes the region's id rather than closing over it, so one function
   *  covers every region: see the note on Region above for why that matters. */
  elementRef: (regionId: number, element: SVGPathElement | null) => void;
  onFocus: (regionId: number) => void;
  onBlur: (regionId: number) => void;
  onMoveFocus: (regionId: number, key: RegionMoveKey) => void;
  onPointerEnter: (regionId: number, stats: RegionStats) => void;
  onPointerLeave: (regionId: number, stats: RegionStats) => void;
  /** A shelter in this region is hovered in the list, so it wears the same
   *  look pointer hover would give it. */
  highlighted: boolean;
  /** The legend is pointing at a density step: "match" means this region is on
   *  it, "dim" means it is not. Undefined when no step is hovered. */
  densityFocus?: DensityFocus;
  /** Shelters answering for the municipalities inside this region. Only an
   *  inert region has anything to do with them: they are what its label says
   *  after "no shelters here", so a screen reader hears what the annotation
   *  shows. */
  coveredBy?: string[];
  /** The map's hatch pattern, which the mixed state fills with. */
  hatchId: string;
}) {
  const { locale, messages, t } = useI18n();
  const d = REGION_PATHS.get(region.id) ?? "";
  // Computed before the branch so the branch is the state, rather than the
  // state being read twice from two different tests of the same fact.
  const stateName = mapStateName(stats.state, stats.live);

  if (stateName === "inert") {
    // The same sentence the annotation carries, from the same function: a
    // hover and a screen reader must not learn different things about the
    // same region.
    const covered = coveredByLine(coveredBy, t);
    return (
      <path
        d={d}
        // Named rather than hidden. It answers a hover now, and the message is
        // a fact about the country and not about the pointer: without it a
        // screen reader walks the map group and finds holes exactly where the
        // empty regions are. role="img" and not a button, because there is
        // nothing here to press; no tabIndex, so it never joins the tab order
        // the live regions share.
        role="img"
        aria-label={
          covered
            ? `${region.name}: ${messages.noSheltersInRegion}. ${covered}`
            : `${region.name}: ${messages.noSheltersInRegion}`
        }
        data-region-state="inert"
        // Pointer events are back on so the region can name itself, but only
        // hover is wired: no onClick, no keyboard. On touch a tap fires
        // pointerenter and the card appears, the same way it already does for
        // a live region, and the next tap elsewhere fires pointerleave and
        // takes it away. Nothing here is bespoke to touch.
        onPointerEnter={() => onPointerEnter(region.id, stats)}
        onPointerLeave={() => onPointerLeave(region.id, stats)}
        strokeLinejoin="round"
        className={cn(
          // cursor-help, matching the legend's density swatches: this answers
          // with information and does nothing else. cursor-pointer would
          // promise a click that never lands.
          "cursor-help transition-[fill] motion-reduce:transition-none",
          // The faintest acknowledgment there is: 4% to 7% neutral. The ramp's
          // own smallest step is 8 points (0.20 to 0.28), which is what a live
          // region moves by on hover, so this is under half of that and lands
          // 13 points below DENSITY_STEPS[0]. The surface confirms it heard the
          // pointer without ever reading as "a few animals here".
          "hover:fill-foreground/7",
          // Neutral foreground and not the ramp's green, on purpose: "no
          // shelters here" is a different statement from "few animals here",
          // and a faint tint would have said the second. A full step of the
          // ramp below DENSITY_STEPS[0] in weight, so an empty region cannot
          // be mistaken for the quietest live one either. It stays above
          // --map-abroad by more than it is worth arguing about: the land
          // across the border is untinted, this is not, and the country
          // outline settles the rest.
          "fill-foreground/4 [stroke-width:0.6]",
          // The stroke never moves. A live region thickens its border on
          // hover; an empty one must not, or the two would answer alike.
          REGION_STROKE,
        )}
      />
    );
  }

  // A list hover already asked for this region by name, so the legend never
  // fades it back.
  const dimmed = densityFocus === "dim" && !highlighted;
  const lit = highlighted || densityFocus === "match";

  return (
    <path
      ref={(element) => elementRef(region.id, element)}
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
      onClick={() =>
        onPick(stats.values, {
          kind: "group",
          label: region.name,
          values: stats.values,
        })
      }
      onFocus={() => onFocus(region.id)}
      onBlur={() => onBlur(region.id)}
      onPointerEnter={() => onPointerEnter(region.id, stats)}
      onPointerLeave={() => onPointerLeave(region.id, stats)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick(stats.values, {
            kind: "group",
            label: region.name,
            values: stats.values,
          });
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
          onMoveFocus(region.id, event.key);
        }
      }}
      style={
        stats.state === false
          ? densityStyle(stats.density, dimmed)
          : undefined
      }
      className={cn(
        // fill-opacity was already in the list and already animated a species
        // switch: --map-density changes on the same element that is already
        // mounted, so the browser has a value to interpolate from. What it did
        // not have was a timing of its own, and the 150ms default read as a
        // flicker rather than as the country rethinking itself. MAP_MORPH is
        // the same 300ms ease-out the marker radii spend, so the fills and the
        // coins settle together instead of in two waves.
        //
        // The hover step (fill-opacity to --map-density-hover, and the stroke
        // width) now runs at that timing too. It is the same declaration on the
        // same element, and a region answering a pointer in the same beat it
        // answers a species tab is one region, not two.
        "cursor-pointer outline-none transition-[fill,stroke,fill-opacity,stroke-width] motion-reduce:transition-none",
        MAP_MORPH,
        REGION_LOOK[stateName][lit ? "highlighted" : "rest"],
        // 2.1: the selected region's own hover/highlighted stroke now runs at
        // 1.8, so the old 1.75 focus ring would have tied it rather than
        // outranked it. Keyboard focus has to stay the single heaviest line
        // on the plate whatever state the region under it is in.
        "focus-visible:stroke-foreground focus-visible:[stroke-width:2.1]",
      )}
    />
  );
});
