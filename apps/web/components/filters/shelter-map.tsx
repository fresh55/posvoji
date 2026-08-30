"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  distanceKm,
  formatKm,
  MAP_HEIGHT,
  MAP_WIDTH,
  onMap,
  project,
  type LatLon,
} from "@/lib/geo";
import {
  groupTownsByRegion,
  layoutTowns,
  regionStatsByRegion,
  townCount,
  townIsLive,
  townLabel,
  townSelectableValues,
  type RegionStats,
  type ShelterPin,
  type Town,
} from "@/lib/map-layout";
import { animalCount, regionCommitNote, shelterCount } from "@/lib/labels";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";
import {
  type CalloutRect,
  DEFAULT_PLATE_SCALE,
  MapCallout,
  Origin,
} from "./map-callout";
import {
  COUNTRY_OUTLINE,
  ContextFade,
  GeographicContext,
  MixedHatch,
} from "./shelter-map-geography";
import { PlateFurniture } from "./shelter-map-furniture";
import {
  Connector,
  OriginDistance,
  SPOTLIGHT_RING,
} from "./shelter-map-links";
import {
  coveredByLine,
  Region,
  regionDensityFocus,
} from "./shelter-map-region";
import type { MapPick, RegionMoveKey } from "./shelter-map-contracts";
import { commitKey, Marker, PLATE_MIN_SCALE } from "./map-marker";
import { mapFacts, type MapFacts } from "./shelter-map-facts";

export type { ShelterPin } from "@/lib/map-layout";
export type { MapPick, RegionMoveKey } from "./shelter-map-contracts";
export { mapFacts };
export type { MapFacts };
export { Region };

/** How long a pointer has to rest on a region before the plate names it.
 *
 *  The regions are the whole floor of this map: there is no gap between them,
 *  so every trip to a marker, to the legend or out to the panel grazes two or
 *  three on the way. Naming each one it touched turned the plate into a
 *  flicker of labels, and that is the noise the dwell exists to stop. It stops
 *  it by asking one question of the pointer: did you come here, or were you
 *  only on your way somewhere? A pointer crossing a region has asked it
 *  nothing.
 *
 *  Every region answers once that question is settled, live or empty. A live
 *  one was silent for a while, on the grounds that its counts are in the list
 *  and its density is in the legend, and that was wrong for the same reason
 *  the touch path was: the one fact neither of those carries is which shape
 *  under the cursor is Savinjska. The plate names four countries and a sea and
 *  not one of the twelve things it asks you to choose between, so a mouse user
 *  clicked a nameless shape and took three shelters with it. The dwell is what
 *  lets the fix cost nothing in transit.
 *
 *  A marker is a small target somebody aimed at, so it answers on contact, and
 *  so does keyboard focus, which is deliberate by definition.
 *
 *  Exported so a test advances by exactly this rather than by a number that
 *  could drift from it. */
export const REGION_DWELL_MS = 200;

/** How long a mark a coarse tap has named stays armed before the arming is
 *  withdrawn.
 *
 *  A tap on a pointer with no hover stands in for a hover, and a hover ends
 *  when the pointer leaves. A finger has no leave to give, so without this the
 *  arming outlives the question: a region named, the phone put down, the list
 *  read, and a stray tap on the same shape much later commits a dozen shelters
 *  the visitor had stopped thinking about.
 *
 *  Six seconds is long enough to read what the tap put on the plate, which is
 *  a name, a shelter count and an animal count, and short enough that the next
 *  tap is a fresh question rather than the second half of a forgotten one. The
 *  annotation goes with the arming, so nothing is left on screen implying a
 *  press is still half made.
 *
 *  Exported so a test advances by exactly this rather than by a number that
 *  could drift from it. */
export const ARMED_TTL_MS = 6000;

/** Whether this pointer can look at a mark without pressing it.
 *
 *  Everything the plate says about a region before it is picked, it says to a
 *  hover: the callout under the cursor, the rows tinting in the list beside
 *  the map. A finger has none of that. Tap is the pointing and the pressing at
 *  once, and the plate carries no region names of its own (twelve of them at
 *  339 x 222 collide into a smudge, which is worse than none), so on a phone
 *  the first thing that ever happened was a dozen shelters selected out of a
 *  shape nothing on screen had named.
 *
 *  Asked of the pointer and never of the viewport. A desktop window dragged
 *  narrow still hovers, and a tablet held in two hands still does not, so a
 *  breakpoint would answer for the wrong half of both. (hover: none) and not
 *  (pointer: coarse), because the absence of hover is precisely the gap: a
 *  coarse pointer that can hover has already been told what it is on.
 *
 *  Exported so a test asks the same question the plate asks. */
export const NO_HOVER = "(hover: none)";

// Regions carry the controls on every plate; town markers add pointer precision
// and their own keyboard roving once the measured plate can draw them clearly.
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
  describedElsewhere,
  onMarkersVisible,
  onFacts,
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
  /** A shelter something off the map already describes in full, if there is
   *  one. Its hover annotation drops to the bare name: whatever is carrying
   *  the count and the species breakdown elsewhere would otherwise have those
   *  same facts on screen twice at once, a few hundred pixels apart. The name
   *  stays, because a mark under the pointer still has to say what it is. */
  describedElsewhere?: string | null;
  /** Fired with whether the plate is currently drawing its markers, so
   *  anything outside the map that talks about them can follow the same
   *  answer. The panel's instruction line and its legend both used to decide
   *  from a viewport breakpoint while this decided from the measured plate,
   *  and the two disagreed wherever the stage was not the width its breakpoint
   *  assumed: a landscape phone was told to click a marker it had none of, and
   *  a plate squeezed by an open sheet lost its coins while the legend went on
   *  explaining the hollow one. See markersVisible below for what decides it. */
  onMarkersVisible?: (visible: boolean) => void;
  /** Reports legend states from the layout and region stats this map already
   *  computed, so its parent never repeats that work. */
  onFacts?: (facts: MapFacts) => void;
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
  /** The region the plate is naming right now, whoever asked for it: a pointer
   *  that has rested on it for the dwell, or keyboard focus landing on it.
   *
   *  One value and not one per act, which is what it used to be. That worked
   *  only for as long as the two could not overlap: a pointer named empty
   *  regions, focus named live ones, and reading them as `hovered ?? focused`
   *  was safe because they were never both set. Now that every region answers
   *  a pointer as well, that chain would be a rule about which act matters,
   *  and it would have got it wrong in both directions: a stale hover would
   *  outrank the keyboard, and clicking a region (which focuses it) would have
   *  pinned its name up while the pointer moved on to another one.
   *
   *  So there is no precedence to get wrong. Whichever act named a region last
   *  is the one being answered, and each act takes its name back only if it is
   *  still the one standing: see the pointer-leave and blur handlers, which
   *  both clear on a match rather than unconditionally. A pointer leaving a
   *  region the keyboard also happens to be on does take the name down, and
   *  that is the right way round. The focus ring still says where the keyboard
   *  is, and the pointer withdrawing its question is an answer to it. */
  const [namedRegionId, setNamedRegionId] = useState<number | null>(null);
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
  /** The mark a pointer that cannot hover has named and not yet picked, as the
   *  data-map-commit string that mark carries. Null on every other pointer,
   *  where the first click is still the pick: see handlePlateClickCapture. */
  const [armed, setArmed] = useState<string | null>(null);
  /** The region the roving tabindex remembers as the plate's one tab stop.
   *  Kept past a blur, unlike namedRegionId above, which is about what the
   *  plate is saying rather than about where the tab order resumes. */
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
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

  /** Whether the plate is drawn large enough to carry markers at all, and the
   *  whole of that question.
   *
   *  It used to be half of it. The layer was hidden below md by a class and
   *  taken off the tree here by the measured scale, which is two answers to
   *  one question and they disagreed in both directions: a 700px window is
   *  under md with a plate at twice the threshold, and a phone held sideways
   *  is well over md with a plate at a tenth of it. The measurement is the
   *  honest half, because what a marker needs is pixels to the user unit and
   *  only the stage knows how many it is drawing. So the class is gone and
   *  this decides, here and everywhere outside the map that speaks about
   *  markers (see onMarkersVisible).
   *
   *  True until something measures otherwise, which is what keeps the server's
   *  markup and the first client paint identical. Where nothing ever measures
   *  (no ResizeObserver, i.e. the test environment) it simply stays true. */
  const [markersVisible, setMarkersVisible] = useState(true);

  // What withdraws an arming, whoever withdraws it: the mark stops being half
  // pressed, and the annotation the arming raised comes down with it. Both
  // halves, because a name left standing over a mark that is no longer armed
  // says a press is still half made when it is not.
  //
  // Two things withdraw one. The clock, because an arming is a hover a finger
  // cannot end by leaving and a question nobody came back to is not a question
  // any more (ARMED_TTL_MS says how long that is). And the plate moving out
  // from under the finger, because the arming is about a mark at a place: the
  // sheet folding, the panel being dragged, the page scrolling behind the
  // dialog all leave the next tap landing on a different shape than the one
  // that was named.
  //
  // Moving is measured and not inferred from the scroll itself, which is the
  // whole of why this is written the long way. The plate is inside a dialog
  // full of scrollers, and one of them scrolls because of the arming: naming a
  // region tints its rows in the list and brings the first of them into view
  // (see hoverScrollTo in location-picker.tsx). A listener that disarmed on
  // any scroll therefore withdrew the arming the tap had just made, every
  // time, and the second tap always found nothing to commit. Asking whether
  // the plate's own corner moved separates the scroll that matters from the
  // scroll this very act caused. Rounded to the pixel, because a scroller
  // settling can report fractions of one.
  //
  // Only ever reached while something is armed, which only happens on a
  // pointer that cannot hover, so a mouse hover is never what this clears.
  const withdrawArmed = useCallback(() => {
    setArmed(null);
    setHoveredTownKey(null);
    setHoveredShelterValue(null);
    onHoverShelters?.(null);
  }, [onHoverShelters]);

  useEffect(() => {
    if (!armed) return;
    const corner = () => {
      const box = plateRef.current?.getBoundingClientRect();
      return box ? `${Math.round(box.x)},${Math.round(box.y)}` : "";
    };
    const armedAt = corner();
    const withdrawIfMoved = () => {
      if (corner() !== armedAt) withdrawArmed();
    };
    const timer = setTimeout(withdrawArmed, ARMED_TTL_MS);
    // Capture on the window, because a scroll event on an inner scroller does
    // not bubble but does pass through the capture phase above it.
    window.addEventListener("scroll", withdrawIfMoved, {
      capture: true,
      passive: true,
    });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", withdrawIfMoved, { capture: true });
    };
  }, [armed, withdrawArmed]);

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
        setMarkersVisible(scale >= PLATE_MIN_SCALE);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Said outward in its own effect rather than from inside the measurement, so
  // it is reported once per answer and not once per resize: the observer fires
  // on every pixel of a panel folding, and the answer changes at one of them.
  useEffect(() => {
    onMarkersVisible?.(markersVisible);
  }, [markersVisible, onMarkersVisible]);

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
  /** This annotation is about the shelter something else already describes,
   *  so everything that other thing says is dropped from it and only the name
   *  is left. Both the count and the species line go, which is what makes
   *  MapCallout draw its dense one-line label instead of a card: see `dense`
   *  there. The other shelter in a shared town is untouched, because
   *  calloutShelter is the wedge under the pointer. */
  const saidElsewhere =
    Boolean(describedElsewhere) && calloutShelter?.value === describedElsewhere;

  /** The line under the annotation's title, when the annotation carries one.
   *  A wedge under the pointer answers for its own shelter; a town answers for
   *  itself, and one with nothing to pick says so rather than counting out the
   *  nought it has. */
  const townMetadata = !activeTown
    ? undefined
    : hoveredShelter
      ? hoveredShelter.selectable === false
        ? messages.noAnimalsListed
        : animalCount(hoveredShelter.count, locale)
      : townSelectableValues(activeTown).length === 0
        ? messages.noAnimalsListed
        : activeTown.shelters.length > 1
          ? `${shelterCount(activeTown.shelters.length, locale)} · ${animalCount(townCount(activeTown), locale)}`
          : animalCount(townCount(activeTown), locale);

  /** Who lives there, when the annotation is about one house. A cluster's own
   *  card answers for its town, and the breakdown of a town is a fact about no
   *  shelter in it. */
  const calloutSpecies = calloutShelter
    ? summaries?.get(calloutShelter.value)?.species
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

  // Memoized alongside the grouping above it: ranking twelve regions is a pass
  // over every town, and this component re-renders on every hover anywhere on
  // the map.
  const regions = useMemo(
    () => regionStatsByRegion(byRegion, selected),
    [byRegion, selected],
  );
  const facts = useMemo(
    () => mapFacts(towns, regions, selected),
    [regions, selected, towns],
  );

  useEffect(() => {
    onFacts?.(facts);
  }, [facts, onFacts]);

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
              ? (currentIndex - 1 + liveRegionIds.length) % liveRegionIds.length
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

  // Focus names its region on contact and waits out no dwell. Nobody tabs
  // across a country by accident, so there is nothing here to ration.
  const handleRegionFocus = useCallback((regionId: number) => {
    setFocusedRegionId(regionId);
    setNamedRegionId(regionId);
  }, []);

  const handleRegionBlur = useCallback((regionId: number) => {
    // Only if this region is still the one being named. A pointer that has
    // since named another one is the more recent act, and a blur arriving
    // after it must not take that answer down. Same shape as the pointer's own
    // leave below, for the same reason.
    setNamedRegionId((current) => (current === regionId ? null : current));
  }, []);

  const handleRegionPointerEnter = useCallback(
    (regionId: number, stats: RegionStats) => {
      // Whatever the pointer just left, it is not being named now.
      if (regionDwellRef.current !== null) {
        clearTimeout(regionDwellRef.current);
        regionDwellRef.current = null;
      }
      // Hovering a live region previews the rows a click would change, which
      // matters most here: one region click can toggle several shelters. The
      // tint is instant because it was never the noisy part: it lands on a
      // list somebody is already reading, off to the side of the pointer, and
      // it says nothing over the map itself.
      if (stats.live) onHoverShelters?.(stats.values);
      // The name waits, and every region has one to give. An empty region says
      // who answers for it, which is a fact with nowhere else on the plate to
      // live. A live one says which shape this is, which is the fact the plate
      // draws no label for and neither the list nor the legend can supply:
      // without it a click here picks a province by shape alone. Both are only
      // owed to a pointer that stopped to ask.
      regionDwellRef.current = setTimeout(() => {
        regionDwellRef.current = null;
        setNamedRegionId(regionId);
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
      setNamedRegionId((current) => (current === regionId ? null : current));
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
        setHoveredTownKey((current) => (current === town.key ? null : current));
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

  /** The whole of the coarse-pointer path: identify, then commit.
   *
   *  On a pointer that cannot hover (see NO_HOVER), the first tap on a mark is
   *  the hover the device does not have. It raises exactly the callout a
   *  keyboard focus raises: the name, the shelters and the animals, which are
   *  the three facts the mark's own aria-label already composes, in the same
   *  words. It picks nothing. A second tap on the same mark picks it, and a
   *  tap on another one moves the naming there instead, which is what moving
   *  a pointer does.
   *
   *  A capture listener on the plate, and not a wrapper around onPick, for one
   *  reason worth writing down: a keyboard activation never produces a click.
   *  Enter and Space go straight to the region's or the coin's own onKeyDown
   *  and pick on the first press exactly as they always have, because nothing
   *  here ever sees them. A wrapper around onPick could not have told the two
   *  apart, and would have made the keyboard press twice for everything.
   *
   *  It reads data-map-commit, which is written on the element that carries
   *  the click and on no other; see commitKey in map-marker.tsx. So an empty
   *  region, an off-site mark and a coin whose own marks answer for themselves
   *  are all invisible here, and go on doing what they did. */
  const handlePlateClickCapture = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (!window.matchMedia?.(NO_HOVER).matches) return;
    // A click no pointer made. detail counts the presses one made, and a
    // keyboard activation or a screen reader's own makes none: both knew what
    // they were standing on before they pressed, because the label said so,
    // and this gate exists only for the eye that has no label to read.
    if (event.detail === 0) return;
    const key = (event.target as Element)
      .closest("[data-map-commit]")
      ?.getAttribute("data-map-commit");
    // Nothing under the finger picks anything. It answers as it always has.
    if (!key) return;
    if (key === armed) {
      // The tap that commits, which is this handler's only job here: stand
      // aside and let the mark's own onClick run. Disarmed first, so picking
      // the same region again is named again rather than toggled straight
      // back off by a stray double tap.
      setArmed(null);
      return;
    }

    // Which mark the key names, found by writing the keys again rather than by
    // taking this one apart. One function spells every one of them, so a
    // lookup that spells them the same way cannot read a key nothing wrote.
    const region = regions.find(
      (candidate) => commitKey("region", candidate.region.id) === key,
    );
    const town = towns.find(
      (candidate) => commitKey("town", candidate.key) === key,
    );
    const mark = towns
      .flatMap((candidate) =>
        candidate.shelters.map((shelter) => ({ town: candidate, shelter })),
      )
      .find(({ shelter }) => commitKey("shelter", shelter.value) === key);
    // A key naming nothing on this plate arms nothing. Nothing writes one, and
    // if something ever did, the tap it belongs to is better spent as the pick
    // it already was than as a preview of a mark that is not here.
    if (!region && !town && !mark) return;

    // From here the tap is spent on naming, so it never reaches the onClick
    // that would have picked. React dispatches capture and bubble out of one
    // queue, so stopping it here stops the handler on the mark below.
    event.stopPropagation();
    setArmed(key);

    if (region) {
      // The region names itself through `armed` alone; see armedRegion below.
      // A town annotation left standing comes down with it, because the plate
      // names one thing at a time and a town's callout outranks a region's.
      setHoveredTownKey(null);
      setHoveredShelterValue(null);
      onHoverShelters?.(region.stats.values);
      return;
    }
    // The coin's and the mark's own hover paths, unadapted: the same
    // annotation, over the same anchor, tinting the same rows in the list.
    if (town) {
      handleTownPointerEnter(town);
      return;
    }
    if (mark) handleTownHoverShelter(mark.town, mark.shelter.value);
  };

  /** The region a coarse tap has named and not yet picked, when the armed mark
   *  is a region at all.
   *
   *  It outranks both ways in below rather than joining their chain. A live
   *  region says nothing to a pointer hover by design, and keyboard focus
   *  cannot be wearing a tap, so there is no case where one of those is the
   *  better answer than the region the visitor just put a finger on. */
  const armedRegion = armed
    ? regions.find(({ region }) => commitKey("region", region.id) === armed)
    : undefined;

  /** What the tap after this one will do to the filter, in words, or undefined
   *  when no region is armed.
   *
   *  The arming was already telling the visitor which shape they had put a
   *  finger on. It was not telling them what pressing it again would cost:
   *  "Osrednjeslovenska · 4 zavetišča · 11 živali" describes the region, and a
   *  region description is not a warning that the next tap takes all four. The
   *  two-tap gesture exists so nothing is picked out of a shape nothing has
   *  named, and this is the other half of that promise, so the second tap does
   *  precisely what the first one announced.
   *
   *  Both verbs, because the commit is a toggle and stays one: a region whose
   *  shelters are all picked is dropped by that second tap. stats.state is the
   *  same fact isDrop works out in the picker, computed from the same values
   *  against the same selection, so the sentence and the toggle cannot
   *  disagree about which way the press goes.
   *
   *  Live regions only. An inert one carries no commit key at all, so it can
   *  never be armed, and a note counting its zero pickable shelters would be a
   *  promise about a press that does not exist. */
  const armedNote =
    armedRegion && armedRegion.stats.live
      ? regionCommitNote(
          armedRegion.stats.values.length,
          armedRegion.stats.state === true,
          locale,
        )
      : undefined;

  // A marker sits on top of its region, so both would report a hover. The
  // marker is the more precise answer and wins.
  //
  // One region is named at a time and namedRegionId is the whole of who says
  // so, whether a rested pointer or keyboard focus put it there; the state's
  // own note says why that is one value and not two. A tap that armed a region
  // outranks it, because on a pointer with no hover the tap is the only way to
  // ask and its answer has to stand until the next one.
  const hoveredRegion =
    armedRegion ??
    (activeTown
      ? undefined
      : regions.find(({ region }) => region.id === namedRegionId));

  return (
    <svg
      ref={plateRef}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label={messages.shelterMapLabel}
      // One listener for the whole plate, above every mark on it, so a tap is
      // read before the mark it landed on can act on it. See the handler.
      onClickCapture={handlePlateClickCapture}
      // A finger that moved is not a tap. The plate does not pan, so a drag
      // across it is the page or the sheet under it moving, and the mark the
      // finger started on is no longer the mark it is over.
      onTouchMove={() => {
        if (armed) withdrawArmed();
      }}
      // touch-action: manipulation. The plate is a field of controls a finger
      // has to hit exactly, and the delay the browser holds every tap back by
      // to see whether a double tap is coming is delay a two-tap gesture pays
      // twice. It also takes double-tap zoom off the map, which on a plate
      // this dense zooms in on whatever was under the second tap rather than
      // picking it.
      className={cn("h-auto w-full shrink-0 touch-manipulation", className)}
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
          // The armed region's own consequence, and nobody else's. A string
          // and not the arming itself, so eleven memoized regions are handed
          // the same undefined they were handed last render and only the one
          // that changed redraws. The callout above is aria-hidden, as every
          // annotation on this plate is, so the label is the only channel this
          // sentence has to a screen reader.
          armedNote={
            armedRegion?.region.id === region.id ? armedNote : undefined
          }
          hatchId={hatchId}
        />
      ))}

      {/* Over the choropleth, so a town name is never read through a region
          fill, and under everything a click or a hover produces. */}
      <PlateFurniture
        towns={towns}
        calloutRects={Object.values(calloutRects)}
        wide={markersVisible}
      />

      {origin && onMap(origin) && <Origin at={origin} />}

      {/* One gate and no class beside it: the measured plate is what decides
          whether there are markers, here and in everything outside the map
          that mentions them. See markersVisible for what the class was getting
          wrong. */}
      {markersVisible && (
        <g>
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
          {activeTown &&
            !spotlightTowns.some((t) => t.key === activeTown.key) && (
              <MapCallout
                x={activeTown.x}
                y={activeTown.y}
                reach={activeTown.r}
                scale={plateScale}
                // One town annotation at a time, whichever town it is about, so
                // one name covers the site rather than one per town.
                rectKey="town"
                onRect={handleCalloutRect}
                // A wedge under the pointer names its own shelter. Without that a
                // cluster answered "Celje, 2 zavetišči" whichever coin you aimed
                // at, which is the one question the cluster cannot answer.
                title={
                  hoveredShelter ? hoveredShelter.label : townLabel(activeTown)
                }
                // The name always; the rest only when nothing else is already
                // saying it. Both lines go together, which is what leaves
                // MapCallout drawing its dense one-line label.
                metadata={saidElsewhere ? undefined : townMetadata}
                species={saidElsewhere ? undefined : calloutSpecies}
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
          // Two different second lines, and never both, because a region is
          // either live or it is not.
          //
          // An empty one names who answers for the municipalities inside it,
          // which is the only thing left to say about ground with no shelters
          // on it.
          //
          // A live one says what the next tap will do, but only while it is
          // armed. A pointer that can hover has not committed to anything by
          // arriving, so the callout it raises is a description and stays one;
          // an arming is a press half made, and the half that has not happened
          // yet is what has to be spelled out. Naming somebody else's coverage
          // under a live region's own counts would be a second answer to a
          // question nobody asked here.
          note={
            hoveredRegion.stats.live
              ? hoveredRegion === armedRegion
                ? armedNote
                : undefined
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
          {/* No second, travelling ring over this one. A pulse repeating for
              as long as the spotlight stands is motion with nothing left to
              say after the first cycle: the spotlight is already the only
              accented mark on the map, it is painted last, and the callout
              beside it names the shelter outright. The static ring marks the
              spot and then holds still. */}
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
