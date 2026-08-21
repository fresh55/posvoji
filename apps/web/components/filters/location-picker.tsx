"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  List,
  LoaderCircle,
  MapPin,
  Navigation,
  PawPrint,
  Search,
  X,
} from "lucide-react";
import { MapPickCard } from "@/components/filters/map-pick-card";
import { MiniMap } from "@/components/filters/mini-map";
import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import {
  FOUND_ANIMAL_PARAM,
  OPEN_MUNICIPALITY_LOOKUP_EVENT,
} from "@/lib/found-animal";
import {
  SHELTER_SPOTLIGHT_EVENT,
  type ShelterSpotlightDetail,
} from "@/lib/shelter-spotlight";
import type { LookupEntry } from "@/lib/municipality-coverage";
import { ResultCount } from "@/components/filters/result-count";
import { EmptyMarkerGlyph } from "@/components/filters/map-marker";
import { OriginGlyph } from "@/components/filters/map-callout";
import {
  ShelterMap,
  legendFlags,
  type MapPick,
} from "@/components/filters/shelter-map";
import { ShelterRows, type ShelterRow } from "@/components/filters/shelter-rows";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption, SpeciesFilter } from "@/lib/filters";
import { cityAt, distanceKm, onMap, project, type LatLon } from "@/lib/geo";
import { allShelters, sheltersMissingFromMap } from "@/lib/labels";
import { DENSITY_STEPS, type ShelterPin } from "@/lib/map-layout";
import { regionAt } from "@/lib/map-regions";
import { MUNICIPALITY_CENTROIDS } from "@/lib/postcode-municipalities";
import { readTypedLocation, resolveOrigin } from "@/lib/origin";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { looksLikePostcode } from "@/lib/postal-lookup";
import { cn } from "@/lib/utils";

// The ground a density swatch sits on, so its alpha composites over something
// close to the land a region fill actually composites over rather than over
// whatever happens to be behind the legend. The stage's own paper is
// --muted at 40% opacity over --background, which is the pair named in the
// audit; --map-abroad, the inert land tone under a region before its own
// fill lands, sits within 0.02 lightness of that mix in both themes (0.988
// vs 0.972 on light, 0.195 vs 0.215 on dark), so the paper mix alone stands
// in for both without a second blend to maintain.
const LEGEND_SWATCH_GROUND =
  "color-mix(in oklch, var(--muted) 40%, var(--background))";

// The map legend. Both renderings live in the stage's bottom-left corner over
// the paper, and both come out of this one component so they cannot drift
// apart: a stacked column at lg and up, where the list is a panel beside the
// map, and a wrapping row below it, where the plate is the width of the screen
// and a column in that corner would be a wall.
//
// It explains what nobody can guess and nothing else. The density ramp is the
// one encoding with no other way in, so it is always here. Everything else
// waits for the thing it describes to exist: the hatch appears with the first
// partial selection, the origin ring with the first origin. The marker shapes
// and sizes explain themselves on hover, through the callout, so they say
// nothing here at all.
function MapLegend({
  variant,
  highlightedDensity,
  onHoverDensity,
  onLeaveDensity,
  hasSelectedRegion,
  hasMixedRegion,
  hasEmptyMarker,
  origin,
  messages,
}: {
  variant: "panel" | "inline";
  highlightedDensity: number | null;
  onHoverDensity: (index: number) => void;
  onLeaveDensity: () => void;
  /** At least one region is fully picked right now, so the solid selection
   *  green is on the map and needs telling apart from the density ramp. */
  hasSelectedRegion: boolean;
  /** At least one region is partly picked right now, so the hatch on the map
   *  is a state worth naming. */
  hasMixedRegion: boolean;
  /** At least one shelter with nothing listed is drawn as a hollow circle right
   *  now. Both variants act on it, at different widths: see the row below. */
  hasEmptyMarker: boolean;
  origin: LatLon | undefined;
  messages: ReturnType<typeof useI18n>["messages"];
}) {
  return (
    <div
      data-map-legend={variant}
      className={cn(
        "leading-none text-muted-foreground",
        variant === "panel"
          ? "flex flex-col gap-y-1 text-[10px]"
          : "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] lg:hidden",
      )}
    >
      <span className="flex items-center gap-2">
        <span>{messages.fewerAnimals}</span>
        <span
          className="flex items-center gap-0.5"
          aria-hidden
          onPointerLeave={onLeaveDensity}
        >
          {DENSITY_STEPS.map((opacity, index) => (
            // The padded span, not the square, is the hover target: an 8px
            // square is too small to aim at on its own, so the hit area
            // grows without the visible swatch growing with it. cursor-help
            // rather than -default: this responds to hover with
            // information, closer to a tooltip than to inert decoration.
            //
            // Pointer events gated on a mouse, the idiom use-filter-motion.ts
            // already uses. A tap synthesizes a mouseenter with no mouseleave
            // after it, so the highlight latched and every unpicked region
            // stayed dimmed for the rest of the session.
            <span
              key={opacity}
              className="cursor-help p-0.5"
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                onHoverDensity(index);
              }}
            >
              {/* Two layers, not one. A region's fill composites over the
                  land it sits on, not over whatever happens to be behind the
                  legend; painting the ramp's alpha straight onto this panel
                  used its own near-black dark background as the ground
                  instead, which is darker than the land the map actually
                  uses and compressed all five steps into the same corner of
                  the scale. The underlay is LEGEND_SWATCH_GROUND, the
                  opaque stand-in for that land; the map's own ink and alpha
                  ride on top of it unchanged, --map-density-fill at the
                  DENSITY_STEPS opacity. */}
              <span
                className={cn(
                  "relative block size-2 overflow-hidden rounded-[2px] transition-shadow",
                  highlightedDensity === index && "ring-1 ring-foreground/30",
                )}
                style={{ backgroundColor: LEGEND_SWATCH_GROUND }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[var(--map-density-fill)]"
                  style={{ opacity }}
                />
              </span>
            </span>
          ))}
        </span>
        <span>{messages.moreAnimals}</span>
      </span>

      {/* The solid selection green, the moment a region first wears it. The
          ramp and the selected state share one hue on purpose, so the legend
          has to say which green is the answer the visitor gave: without this
          row a first-timer can read the darkest density step as "already
          picked" and nothing on the map corrects them. Both variants, because
          regions are selectable on phones too. */}
      {hasSelectedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            // --map-selected-fill, not --filter-accent-border: the legend has
            // to show the fill the map actually draws for a chosen region
            // (see shelter-map.tsx REGION_LOOK.selected and the token's own
            // comment in globals.css), or the swatch would teach a colour the
            // country never shows.
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)] bg-[var(--map-selected-fill)]"
          />
          {messages.selectedRegionLegend}
        </span>
      )}

      {/* The hatch a mixed/partly-selected region gets on the map, at legend
          size. Only while such a region exists, which is the moment the hatch
          first appears: the row teaches the pattern as it is made, rather than
          describing a state the map is not in. Both variants, because regions
          and their partial selection exist on phones too. */}
      {hasMixedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--filter-accent-strong) 0 1px, var(--filter-accent) 1px 4px)",
            }}
          />
          {messages.mixedRegionLegend}
        </span>
      )}

      {/* The hollow circle a shelter with no animals listed gets. Every other
          mark on the map either answers on hover or earns a row here the
          moment it appears; this one is too small to aim a pointer at, so the
          callout never gets asked and the row is the only way to learn it.
          The glyph comes from map-marker.tsx, drawn from the same classes and
          the same radius-to-stroke proportion the real circle uses.

          This row follows the markers, not the docks, and the two no longer
          part at the same width. Markers are drawn from md up; the panel
          variant of this legend only exists from lg up, so it can carry the row
          unconditionally. The inline variant now covers everything below lg,
          which spans both sides of the marker breakpoint: from md to lg the
          plate is full width and draws every marker, below md it draws none.
          max-md:hidden is what keeps the row off the phone, where there is no
          hollow circle to explain. */}
      {hasEmptyMarker && (
        <span
          className={cn(
            "flex items-center gap-1.5",
            variant === "inline" && "max-md:hidden",
          )}
        >
          <EmptyMarkerGlyph className="size-3.5 shrink-0" />
          {messages.emptyShelterLegend}
        </span>
      )}

      {/* Only once there is a point to explain. The ring repeats the dashed
          circle the map draws at the origin, at legend size. */}
      {origin && (
        <span className="flex items-center gap-1.5">
          <OriginGlyph className="size-4 shrink-0" />
          {messages.originLegend}
        </span>
      )}
    </div>
  );
}

// Every one of the 212 občine carries a GURS centroid, so a picked
// municipality always has a real point to draw the connector from. Built once,
// outside the component, because the table never changes.
const MUNICIPALITY_AT = new Map<string, LatLon>(
  MUNICIPALITY_CENTROIDS.map((entry) => [
    entry.name,
    { lat: entry.lat, lon: entry.lon },
  ]),
);

// Search matches with or without diacritics, so "sezana" finds Sežano.
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// A row with the point its town projects to, and how far that is from the
// origin. Both lists in this dialog carry it.
type LocatedRow = ShelterRow & { at?: LatLon };

// One list, placed on the map and put in the order the origin asks for. The
// live shelters and the off-site ones are two lists of the same thing, so they
// are located and sorted the same way.
function locateAndSort(
  options: FilterOption[],
  origin: LatLon | undefined,
): LocatedRow[] {
  const located = options.map((option) => {
    const at = option.city ? cityAt(option.city) : undefined;
    return {
      ...option,
      at,
      km: at && origin ? distanceKm(origin, at) : undefined,
    };
  });
  if (!origin) return located;
  // Shelters we cannot place keep their alphabetical order at the end, rather
  // than being dropped from a sort they cannot join.
  return [...located].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

// The rows the map can actually draw, as pins. A row with no point is left
// off rather than placed somewhere plausible; the count under the list says
// how many those are. What differs between the two lists is only what a pin
// carries beyond its place, so that is the argument.
function toPins(
  rows: LocatedRow[],
  extra: (row: LocatedRow) => { count: number; selectable?: boolean },
): ShelterPin[] {
  return rows.flatMap((row) =>
    row.at
      ? [
          {
            value: row.value,
            label: row.label,
            city: row.city ?? "",
            at: row.at,
            ...extra(row),
          },
        ]
      : [],
  );
}

// The map is the dialog: a near-full-viewport plate with the list, the title,
// the credits and the confirm button floating on it. Narrow screens keep the
// same plate and move the list into a bottom sheet.
export function LocationPicker({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  resultCount,
  species,
  municipalities,
  offSite,
  summaries,
  deepLink,
}: {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  /** Animals the whole filter state currently matches, shown live on the
   *  confirm button so picking a shelter has visible consequences. */
  resultCount: number;
  species: SpeciesFilter;
  /** Municipality → responsible-shelter entries. When present, the dialog
   *  grows a second mode behind a quiet button: search by občina instead of
   *  by shelter. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site. Drawn as inert markers
   *  and as rows linking to their shelter page, so the map answers "where are
   *  Slovenia's shelters" and not just "where are ours". */
  offSite?: FilterOption[];
  /** Per-shelter species breakdown and longest wait, keyed by shelter id, for
   *  the card a map click leaves in the panel. Computed once in the grid from
   *  the whole dataset. */
  summaries?: Map<string, ShelterSummary>;
  /** Which rendered instance answers the found-animal strip and the ?najdena
   *  deep link. The picker is mounted twice (desktop toolbar, mobile dock);
   *  only the one visible at the current breakpoint may open, or two dialogs
   *  would fight. Omit to opt out of deep-linking entirely. */
  deepLink?: "desktop" | "mobile";
}) {
  const { locale, messages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The municipality mode: same dialog, same map, different question. Off by
  // default and behind its own button, so the shelter picker stays what it
  // was until someone arrives with a found animal instead of a filter.
  const [muniMode, setMuniMode] = useState(false);
  const [muniShelterIds, setMuniShelterIds] = useState<string[] | null>(null);
  // The občina behind those shelters, by name, so the map can draw the line
  // from where the animal was found to the shelter answering for it.
  const [muniName, setMuniName] = useState<string | null>(null);
  // What the last map click was about, and the card that answers it. Null
  // until something is clicked, and again once the card is dismissed. A new
  // click replaces it: one card at a time, always about the newest click.
  const [pick, setPick] = useState<MapPick | null>(null);
  // The shelter an animal card asked the map to point at. One at a time, like
  // the pick above it, and gone when the dialog closes: it answers "where is
  // this one", not "which ones did I choose".
  const [spotlitShelterId, setSpotlitShelterId] = useState<string | null>(null);
  const pickCardRef = useRef<HTMLDivElement>(null);
  // The panel has two docks and they fold independently. One boolean would
  // have had to guess the breakpoint at click time; two let the control that is
  // actually on screen own its own state, and the other one sits in a
  // display:none branch where nothing can reach it.
  //
  // Both start out. The sheet used to start folded, on the theory that the map
  // was worth the whole screen; measured at 390x844 that bought 356x234 of
  // plate in a 739px stage and left two thirds of the dialog empty paper. The
  // plate below lg is limited by the width of the screen, not by the height the
  // sheet takes, so collapsing the sheet gives the map no pixels it can use.
  // The fold stays for anyone who wants the plate alone; it is no longer where
  // the dialog lands.
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);

  // The found-animal strip and the ?najdena URL both land here: open the
  // dialog straight in municipality mode. Guarded by breakpoint because two
  // instances of this picker are mounted at once and exactly one is visible.
  const canDeepLink = Boolean(deepLink && municipalities?.length);
  useEffect(() => {
    if (!canDeepLink) return;
    const isMine = () => {
      const isDesktop = window.matchMedia("(min-width: 64rem)").matches;
      return deepLink === "desktop" ? isDesktop : !isDesktop;
    };
    const openLookup = () => {
      if (!isMine()) return;
      setMuniMode(true);
      setOpen(true);
      // The sheet is already up: it is the dialog's own default now, and a
      // close puts it back. This entry point was pressed by someone holding a
      // found animal, and every part of the answer, the field to type an občina
      // into and the shelter it returns, lives in the sheet, so it is the one
      // flow that could never have tolerated a folded sheet. Nothing to force
      // here any more.
    };
    if (new URLSearchParams(window.location.search).has(FOUND_ANIMAL_PARAM)) {
      openLookup();
    }
    window.addEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
    return () =>
      window.removeEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
  }, [canDeepLink, deepLink]);

  // An animal card asking for its shelter on the map. Its own effect and not a
  // branch of the one above, because canDeepLink also demands the municipality
  // table and this ask has nothing to do with it: folded together, a build
  // without coverage data would have left every card's shelter name pressing
  // nothing. The breakpoint arbitration is the same, for the same reason: two
  // instances are mounted and exactly one of them is on screen.
  const canSpotlight = Boolean(deepLink);
  useEffect(() => {
    if (!canSpotlight) return;
    const isMine = () => {
      const isDesktop = window.matchMedia("(min-width: 64rem)").matches;
      return deepLink === "desktop" ? isDesktop : !isDesktop;
    };
    const spotlight = (event: Event) => {
      if (!isMine()) return;
      const { shelterId } = (event as CustomEvent<ShelterSpotlightDetail>)
        .detail;
      setSpotlitShelterId(shelterId);
      // The shelter list is where this question is answered, whatever tab the
      // dialog was last left on: the map reads muniMode first when it decides
      // what to light up, so the found-animal tab would have swallowed the
      // spotlight outright. A stale search is cleared for the same reason, one
      // step further down: it would filter the named row out of the list this
      // is about to scroll.
      setMuniMode(false);
      setMuniShelterIds(null);
      setMuniName(null);
      setQuery("");
      setOpen(true);
      // Both docks, because the row below has to have somewhere to be brought
      // into view; only the one at the current breakpoint is on screen and the
      // other is a no-op there.
      setPanelOpen(true);
      setSheetOpen(true);
    };
    window.addEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
    return () =>
      window.removeEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
  }, [canSpotlight, deepLink]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState("");
  const placeRef = useRef<HTMLInputElement>(null);
  // The status line belongs to the place input, both on screen and to a
  // screen reader, so it is named once and pointed at from the field.
  const statusId = useId();
  const {
    state,
    toggle: toggleNearby,
    dismissError,
    turnOff: turnOffNearby,
  } = useNearby();
  const geolocated = state.status === "on" ? state.at : undefined;
  // The point the list sorts from, and where it came from. Memoized because
  // the row sort below takes it as a dependency, and a fresh object every
  // render would re-sort every render.
  const { typed, resolved } = useMemo(() => {
    const read = readTypedLocation(place);
    return { typed: read, resolved: resolveOrigin(geolocated, read) };
  }, [geolocated, place]);
  const origin = resolved.at;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // Two independent hover states for the two directions: a row lights up its
  // marker and region, a marker lights up its row(s). Keeping them as separate
  // pieces of state means neither can feed back into the other.
  const [hoveredRowValue, setHoveredRowValue] = useState<string | null>(null);
  const [hoveredMarkerValues, setHoveredMarkerValues] = useState<
    string[] | null
  >(null);
  // Hovering a legend density square lights up that step on the map, so the
  // strip becomes a way to ask "where are the busy ones" instead of a static
  // key. Pointer-only: touch devices never fire it, and that is fine.
  const [highlightedDensity, setHighlightedDensity] = useState<number | null>(
    null,
  );

  const rows: LocatedRow[] = useMemo(
    () => locateAndSort(options, origin),
    [options, origin],
  );

  // Same locating and sorting as the live rows, in their own list: these are
  // real shelters someone may live next to, they just have nothing to filter.
  const offRows: LocatedRow[] = useMemo(
    () => locateAndSort(offSite ?? [], origin),
    [offSite, origin],
  );

  // Which shelters answer for the municipalities inside each region, by region
  // id. An empty region on this map is not an empty part of the country:
  // somebody is still responsible for a stray found there, and the coverage
  // table already knows who, so the map can say it instead of stopping at "no
  // shelters here".
  //
  // Placed the same way a town is placed (see groupTownsByRegion in
  // lib/map-layout.ts): the občina's GURS centroid through project(), then
  // regionAt() on the result. A name therefore lands in the region the map
  // would have drawn that municipality in, rather than in one a second lookup
  // table might disagree about.
  const regionShelterNames = useMemo(() => {
    const byRegion = new Map<number, string[]>();
    for (const entry of municipalities ?? []) {
      // `nearest` is a shortlist of neighbours, not an answer about who is
      // responsible, so a municipality with no coverage contributes nothing.
      if (entry.coverage.length === 0) continue;
      const at = MUNICIPALITY_AT.get(entry.name);
      if (!at) continue;
      const region = regionAt(project(at));
      if (!region) continue;
      const names = byRegion.get(region.id) ?? [];
      // Deduped, in the order the table lists them: one shelter answers for
      // many občine and would otherwise be named once per municipality.
      for (const covered of entry.coverage) {
        if (!names.includes(covered.shelterName)) {
          names.push(covered.shelterName);
        }
      }
      byRegion.set(region.id, names);
    }
    return byRegion;
  }, [municipalities]);

  // What the municipality cards may offer to select: only shelters that
  // exist as filter options, i.e. currently have animals to show.
  const selectableIds = useMemo(
    () => new Set(options.map((option) => option.value)),
    [options],
  );

  const pins: ShelterPin[] = useMemo(
    () => [
      ...toPins(rows, (row) => ({ count: counts.get(row.value) ?? 0 })),
      // selectable: false is what keeps these out of region picks: a region
      // click must never select a shelter that has nothing to show.
      ...toPins(offRows, () => ({ count: 0, selectable: false })),
    ],
    [counts, offRows, rows],
  );

  // Picking a region picks every shelter in it, which is as fine as a map of a
  // country can honestly be. The list is where you drop the ones you did not
  // mean, so bringing the first of them into view is what shows what happened.
  //
  // The toggle is unchanged and still lands in one click. What is added is the
  // card: the same click also says what it just picked, in the panel, where
  // there is room to say it.
  const handlePick = useCallback(
    (values: string[], from: MapPick) => {
      onToggleMany(values);
      rowRefs.current.get(values[0])?.scrollIntoView({ block: "nearest" });
      setPick(from);
      // The card lives in the panel, so a click has to bring the panel out
      // wherever it is folded. Both docks, because only the one at the
      // current breakpoint is on screen and the other is a no-op there.
      setPanelOpen(true);
      setSheetOpen(true);
      // The card lives in the shelter panel, so a click while the found-animal
      // tab is open comes back to it. Same clearing the tab button does.
      setMuniMode(false);
      setMuniShelterIds(null);
      setMuniName(null);
      // A click on the country is a newer question than the one a card
      // arrived with, and two rings at once would be two answers.
      setSpotlitShelterId(null);
    },
    [onToggleMany],
  );

  // Bring the card into view when it appears. The panel scrolls on its own in
  // both docks, so a click made with the list scrolled down would otherwise
  // put its answer above the fold; "nearest" leaves an already-visible card
  // where it is. Focus is deliberately untouched: the clicked region or marker
  // keeps it, so the map can be walked on.
  useEffect(() => {
    if (pick) pickCardRef.current?.scrollIntoView({ block: "nearest" });
  }, [pick]);

  // The spotlit shelter's own row, brought into view once there is a row. It
  // cannot be done where the event is heard: the list is mounted by the dialog
  // that same event opens, so at that point there is nothing to scroll to.
  // "nearest" like the click path above, which leaves an already-visible row
  // where it is, and focus is left alone for the same reason it is there.
  useEffect(() => {
    if (!open || !spotlitShelterId) return;
    rowRefs.current.get(spotlitShelterId)?.scrollIntoView({ block: "nearest" });
  }, [open, spotlitShelterId]);

  // Search narrows the list only. The map keeps every pin, so the country
  // stays whole while you type.
  const matchesQuery = (row: ShelterRow) =>
    fold(`${row.label} ${row.city ?? ""}`).includes(fold(query));
  const visibleRows = query.trim() ? rows.filter(matchesQuery) : rows;
  const visibleOffRows = query.trim() ? offRows.filter(matchesQuery) : offRows;

  const unplaced = rows.length + offRows.length - pins.length;
  // Which legend rows the map has earned right now: the solid selection green,
  // the hatch, the hollow circle. Asked of the same layout and the same
  // grouping the map draws from, so a row and the thing it explains appear and
  // disappear together. One memo and one pass, because laying the towns out
  // and walking each one through a point-in-polygon lookup is the expensive
  // part and all three answers come off it.
  const { hasSelected, hasMixed, hasEmpty } = useMemo(
    () => legendFlags(pins, selected),
    [pins, selected],
  );
  const nearbyOn = state.status === "on";
  // Two independent facts, so two lines. Sharing one slot meant a geolocation
  // error silently replaced the note about shelters missing from the map.
  //
  // Within this line the order follows the origin the list is actually sorted
  // by, with one exception at the top: a geolocation error is news the user
  // just asked for by pressing the button, so it is said first. It only lasts
  // until the user types, which dismisses it in favor of the input's own
  // feedback.
  const status =
    state.status === "error"
      ? state.message
      : resolved.source === "geolocation"
        ? origin && !onMap(origin)
          ? messages.locationOutsideMap
          : messages.sortedByDistance
        : typed.status === "unknown"
          ? looksLikePostcode(place)
            ? messages.postcodeNotFound
            : messages.locationNotFound
          : resolved.source === "typed"
            ? t("sortedByDistanceFrom", { label: resolved.label ?? "" })
            : undefined;
  const missing =
    unplaced > 0
      ? sheltersMissingFromMap(unplaced, locale)
      : undefined;

  // The trigger has to answer "what is behind this" before it is clicked, and
  // the count is what answers it: eleven shelters exist and this is where they
  // are. "Vsa zavetišča" alone read as a filter state, not as a way in.
  const total = options.length;
  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";
  const label =
    selected.length === 0
      ? allShelters(total, locale)
      : t("selectedShelters", { selected: selected.length, total });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          // Reopening lands in the shelter picker, whatever question the
          // dialog closed on.
          setMuniMode(false);
          setMuniShelterIds(null);
          setMuniName(null);
          setPick(null);
          setSpotlitShelterId(null);
          // Neither dock's fold survives a close: reopening always lands with
          // both docks out, the panel beside the map at lg and the sheet over
          // it below lg.
          setPanelOpen(true);
          setSheetOpen(true);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("shelterPickerLabel", { label })}
          className="max-w-[14rem] justify-between gap-2 font-normal"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {/* A live preview, not a stand-in icon: the same region shapes and
                the same density computation the dialog's map draws from
                (lib/map-layout.ts), so the trigger already shows what is
                behind it before it is ever clicked. aria-hidden because the
                label carries the meaning; a screen reader has nothing to gain
                from a tiny country shape. */}
            <MiniMap
              pins={pins}
              selected={selected}
              className="h-4 w-auto shrink-0 text-foreground opacity-60"
            />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-3.5 opacity-50" aria-hidden />
        </Button>
      </DialogTrigger>

      <DialogContent
        // Near the whole viewport, and the map is what fills it. The plate is
        // no longer a column of the dialog; it is the dialog, and the list,
        // the title, the credits and the confirm button float on it. p-0 and
        // gap-0 because nothing here is in flow: every piece is placed against
        // an edge of the stage below.
        //
        // The dialog's own border is the map's neatline now. The plate used to
        // carry its own hairline to say where the map ended; full bleed leaves
        // that job to the frame the dialog already draws.
        className="h-[min(94dvh,60rem)] w-[min(96vw,110rem)] max-h-none max-w-none gap-0 overflow-hidden p-0"
        showCloseButton={false}
        closeLabel={messages.close}
        onEscapeKeyDown={(event) => {
          // Escape empties the box it is pressed in first, and only closes the
          // panel once that box is already empty: clearing a search should not
          // cost the whole map. It has to be handled here rather than on the
          // inputs, because the dialog listens for the key on the document in
          // the capture phase, before it ever reaches the field.
          const target = event.target;
          if (target === placeRef.current && place !== "") {
            setPlace("");
            event.preventDefault();
          } else if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Keyboards land in search, ready to type a shelter name. Touch
          // devices keep radix's default so the soft keyboard stays down
          // until the search box is asked for.
          if (window.matchMedia?.("(pointer: fine)").matches) {
            event.preventDefault();
            searchRef.current?.focus();
          }
        }}
      >
        {/* Selection changes narrate themselves: a region click can toggle
            several shelters at once, and aria-pressed alone does not say how
            many. The label is the one already on the trigger, so the wording
            cannot drift. */}
        <p aria-live="polite" className="sr-only">
          {label}
        </p>

        {/* The stage. Everything below is absolutely placed against one of its
            edges; the map's paper ground is the dialog's own background, so
            the letterbox a fixed-aspect SVG leaves has something to land on
            whatever the viewport's shape. */}
        <div className="relative h-full w-full overflow-hidden bg-muted/40">
          {/* The recenter container, and the whole of the recentering. The map
              is given only the space the panel leaves, and the SVG letterboxes
              inside it (preserveAspectRatio, the browser's default), so no
              label, no marker and no scale bar can ever end up under the
              panel: not because a transform was tuned to miss it, but because
              the picture is never drawn there in the first place.

              Panel out: the full width less the panel, its right inset and the
              gutter before it, which is 24 + 0.75 + 0.75 rem. Folded: the same
              two gutters around a 3rem rail. Below lg the panel is a bottom
              sheet instead, so what the map gives up is height above the peek
              bar and the width stays whole.

              lg and not md, everywhere the two-column stage is described here
              and below. At 768 the old md dock gave the map 295px beside a
              408px list, which is a map nobody can aim at next to a list that
              still had to scroll. A tablet now gets the same full-width plate a
              phone does, roughly 2.2px per viewBox unit, and the list comes up
              over it in the sheet.

              width is what transitions, not a transform: a transform would
              scale the plate's type and hairlines mid-flight, and this SVG's
              hairlines are a quarter of a unit wide. Checked live at 1280,
              1440 and 1920 and it runs clean, because the only work per frame
              is one SVG relayout of paths that are already computed. */}
          <div
            data-map-stage={panelOpen ? "panel" : "rail"}
            className={cn(
              "absolute inset-x-0 top-0 flex items-center justify-center p-2 sm:p-3",
              // Below lg the plate and the legend under it are one stack,
              // centred together in whatever the sheet leaves: that is how the
              // legend ends up hugging the map instead of the frame. See the
              // legend block itself, which is a child of this container now.
              "max-lg:flex-col max-lg:items-start",
              // Named, so the paw layer in map-marker.tsx can ask how wide the
              // plate is actually drawn rather than guessing from the viewport.
              // This element is the right one to ask: it is the box the SVG
              // fills, and it is the box that changes width when the panel
              // folds to a rail. Both its width and its height come from the
              // insets and the width utilities below, never from its contents,
              // so inline-size containment costs nothing here.
              "@container/map-stage",
              "lg:right-auto lg:bottom-0 lg:p-4",
              "transition-[width,bottom] duration-500 ease-out motion-reduce:transition-none",
              // Below lg the sheet takes height instead of width, so the same
              // recentering happens on the other axis: the container gives up
              // exactly what the sheet takes and the plate recentres in what
              // is left. Nothing is ever drawn under the sheet either.
              sheetOpen ? "bottom-[55dvh]" : "bottom-13",
              panelOpen
                ? "lg:w-[calc(100%-25.5rem)]"
                : "lg:w-[calc(100%-4.5rem)]",
            )}
          >
              <ShelterMap
                pins={pins}
                selected={selected}
                onPick={handlePick}
                origin={origin}
                highlightedValue={muniMode ? null : hoveredRowValue}
                matchedValues={
                  muniMode
                    ? muniShelterIds
                    : query.trim()
                      ? [...visibleRows, ...visibleOffRows].map(
                          (row) => row.value,
                        )
                      : null
                }
                // The ring and named card that answer "so where is that?".
                // Two questions land here: which shelters answer for a picked
                // municipality, and where the one named on an animal card is.
                // Stronger than the hover highlight on purpose, and the only
                // signal phones get.
                spotlightValues={
                  muniMode
                    ? muniShelterIds
                    : spotlitShelterId
                      ? [spotlitShelterId]
                      : null
                }
                // The caption belongs to the municipality answer alone. A
                // shelter named on an animal card is not "the responsible
                // shelter" for anywhere, and an unconditional note said it
                // was; the ring and the name are the whole answer there.
                spotlightNote={muniMode ? messages.muniResponsible : undefined}
                // The other half of that answer: which place is being
                // answered for. Only in municipality mode, and only when the
                // občina is one we hold a centroid for.
                spotlightFrom={
                  muniMode && muniName
                    ? (MUNICIPALITY_AT.get(muniName) ?? null)
                    : null
                }
                onHoverShelters={setHoveredMarkerValues}
                highlightedDensity={highlightedDensity}
                // The same breakdown the pick card reads. On the plate it is
                // a line of species glyphs under the name of one hovered
                // shelter, so the map answers "who lives here" without
                // waiting for a click.
                summaries={summaries}
                // What an empty region has to say for itself. Computed here
                // because this is where the coverage table already is.
                regionShelterNames={regionShelterNames}
                // lg+: the SVG takes the whole container and lets its own
                // preserveAspectRatio letterbox the viewBox inside it. That is
                // the letterboxing: no aspect-ratio arithmetic on this side,
                // and the paper it leaves showing is the dialog's ground.
                // Below lg it keeps the component's own h-auto instead, so the
                // plate is exactly as tall as 320:210 makes it and no taller,
                // capped at the container so a raised sheet shrinks it rather
                // than pushing it out of the frame.
                className="max-h-full lg:h-full"
              />

            {/* Bottom-left, over the paper: the legend and the credits, which
                is where a printed sheet puts them. The plate's own furniture,
                the scale bar, keeps the bottom-right of the viewBox, so the two
                never meet; the confirm pill takes the dialog's bottom-right
                corner, which is outside the map's container while the panel is
                out and sixty-odd pixels of dialog edge while it is folded, well
                under the scale bar's own height above the frame.

                A child of the map's own container, not of the stage, and that
                is the point below lg. Frame-anchored at bottom-28 it sat 148px
                under the plate on a 390px phone, a key floating in paper with
                no map near it. In the container's flow it is the next thing
                after the plate, so it moves with the plate's bottom edge
                whatever the sheet is doing to the height above it. At lg the
                container is the map, so absolute bottom-3 left-3 inside it puts
                the stack exactly where it has always been: the dialog's own
                bottom-left corner.

                It still steps out of the way entirely once the sheet is up:
                more than half the screen is the list then, and the map behind
                it has nothing left to explain.

                CC BY 4.0 requires the attribution paragraph below to stay
                visible regardless, so it lives outside this hidden-when-open
                wrapper: only the legend itself folds away with the sheet. */}
            <div
              className={cn(
                "pointer-events-none z-10 mt-2 flex w-full max-w-[26rem] flex-col gap-1",
                "lg:absolute lg:bottom-3 lg:left-3 lg:mt-0 lg:w-auto",
              )}
            >
              <div
                // The half of this corner that folds away with the sheet. It
                // is named so the licence check can ask where the credit sits
                // rather than which classes it wears: the paragraph below is
                // outside this element on purpose and has to stay there.
                data-slot="map-legend-fold"
                className={cn(
                  "flex flex-col gap-1",
                  sheetOpen && "max-lg:hidden",
                )}
              >
                <div className="pointer-events-auto hidden w-fit lg:block">
                  <MapLegend
                    variant="panel"
                    highlightedDensity={highlightedDensity}
                    onHoverDensity={setHighlightedDensity}
                    onLeaveDensity={() => setHighlightedDensity(null)}
                    hasSelectedRegion={hasSelected}
                    hasMixedRegion={hasMixed}
                    hasEmptyMarker={hasEmpty}
                    origin={origin}
                    messages={messages}
                  />
                </div>

                {/* The wide-plate legend, which is now everything below lg:
                    phones and tablets alike. It wraps rather than stacking,
                    because there the plate is the width of the screen and the
                    corner under it is that wide too. */}
                <div className="pointer-events-auto lg:hidden">
                  <MapLegend
                    variant="inline"
                    highlightedDensity={highlightedDensity}
                    onHoverDensity={setHighlightedDensity}
                    onLeaveDensity={() => setHighlightedDensity(null)}
                    hasSelectedRegion={hasSelected}
                    hasMixedRegion={hasMixed}
                    // Acted on here too, unlike before: this variant now
                    // covers md to lg, where the plate is full width and
                    // draws every marker. The row's own class is what keeps
                    // it off the phone.
                    hasEmptyMarker={hasEmpty}
                    origin={origin}
                    messages={messages}
                  />
                </div>
              </div>

              {/* CC BY 4.0 requires attribution, so this stays visible, just
                  quieter than the legend it sits under, even when the sheet
                  is open on a phone. */}
              <p
                // Named, because the licence depends on it staying visible:
                // a test can then find this paragraph and walk its ancestors
                // rather than matching on the classes it happens to wear.
                data-slot="map-attribution"
                className="pointer-events-auto text-[10px] leading-tight text-muted-foreground/70"
              >
                {messages.regionBoundaries}:{" "}
                <a
                  href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
                  className="underline underline-offset-2 hover:text-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  GURS
                </a>
                , CC BY 4.0.{" "}
                {/* Second sentence in the same paragraph, not a second line:
                    the relief is one more thing this map is drawn from, and it
                    does not deserve a block of its own under the legend. */}
                {messages.reliefSource}:{" "}
                <a
                  href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
                  className="underline underline-offset-2 hover:text-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terrain Tiles
                </a>{" "}
                (AWS Open Data), SRTM / NASA.
              </p>
            </div>
          </div>

          {/* The title, floated on the paper rather than stacked above the
              map. DialogHeader stays whole because radix names the dialog off
              the title and describes it off the description; only where they
              are drawn has changed. The subtitle stays in the chip: it is the
              one line that says the map is clickable, and a title attribute
              would have said it to nobody with a touch screen. */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(20rem,60%)]">
            {/* Nothing in the chip is a control, so it takes no pointer: on a
                phone it covers the top-left corner of the plate, and with
                pointer-events-auto it swallowed the taps meant for the two
                regions under it. */}
            <DialogHeader className="pointer-events-none rounded-ui border bg-background/85 px-3 py-2 shadow-xs backdrop-blur">
              {/* The chip follows the question the dialog is currently
                  asking. One dialog answers two of them, and the found-animal
                  mode used to be titled "Kje iščeš?" over instructions to pick
                  a region: the deep link from the found-animal strip landed on
                  copy about a filter the visitor had not come to set. The
                  municipality mode says what it is and what the map is doing
                  for it; the instruction is one line at both breakpoints,
                  because the answer arrives in the panel either way. */}
              <DialogTitle className="text-base leading-none">
                {muniMode ? messages.muniTab : messages.whereSearching}
              </DialogTitle>
              <DialogDescription className="text-[11px] leading-snug">
                {muniMode ? (
                  messages.mapInstructionsMuni
                ) : (
                  <>
                    {/* md and not lg, on purpose. The two lines differ in
                        whether a single shelter can be clicked on the map,
                        which is a question about markers, and markers are
                        drawn from md up whichever dock the list is in. A
                        tablet on the sheet stage still gets the plate with
                        every marker on it, so it is told it can click one. */}
                    <span className="hidden md:inline">
                      {messages.mapInstructionsDesktop}
                    </span>
                    <span className="md:hidden">
                      {messages.mapInstructionsMobile}
                    </span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* The dialog's own close, drawn here instead of by DialogContent:
              the built-in one is pinned to the top-right corner, which is
              where the panel now docks. Over the paper on the opposite side of
              the title, in the same quiet register as the rest of the floating
              chrome. */}
          <DialogClose asChild>
            <Button
              variant="outline"
              size="icon-sm"
              // size-11 below lg is the 44px touch target the mobile
              // hardening asks of every control in this dialog; lg and up gets
              // the smaller square back. Touch targets gate at lg across this
              // dialog because that is where the mobile layout actually ends:
              // the panel is a bottom sheet below lg and a side panel from lg
              // on, so a tablet on the sheet stage still needs a thumb-sized
              // control. The other touch-target sites below follow the same
              // rule without restating it.
              className="absolute right-3 top-3 z-30 size-11 bg-background/85 shadow-xs backdrop-blur lg:size-8"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogClose>

          {/* The same closing move the filter sheet has, as a pill on the
              paper: the count answers "what did my picking do" before the
              dialog goes away. Bottom-right at lg, under the panel.

              Below lg it docks inside the sheet instead of floating over the
              map above it. Sitting a gutter above the sheet's own top edge it
              was a button belonging to nothing, laid across the plate and the
              attribution line; at the foot of the sheet, full width, it reads
              as what it is, the primary action of the panel the picking
              happens in. The content block below reserves the height for it,
              so it covers no row of the list. A folded sheet keeps the old
              placement: there is no sheet to sit in, only the peek bar. */}
          <div
            className={cn(
              "absolute z-30 transition-[bottom] duration-500 ease-out motion-reduce:transition-none lg:left-auto lg:right-3 lg:bottom-3",
              sheetOpen
                ? "max-lg:inset-x-4 max-lg:bottom-4"
                : "max-lg:right-3 max-lg:bottom-16",
            )}
          >
            <DialogClose asChild>
              <Button
                size="lg"
                className="rounded-full px-5 shadow-lg max-lg:w-full"
              >
                {messages.show}
                <ResultCount
                  count={resultCount}
                  species={species}
                  locale={locale}
                  announce={false}
                  variant="inline"
                  className="justify-start text-current"
                />
              </Button>
            </DialogClose>
          </div>

          {/* The panel, one element in two docks. At lg it is a card floated
              against the right edge of the stage, folding to a rail; below lg
              the same card is a bottom sheet, folding to a peek bar. Both
              folds are the same DOM with different classes, so the list, the
              search and the card inside it keep their state and their
              scroll position across either move. */}
          <div
            data-picker-panel={panelOpen ? "open" : "collapsed"}
            data-picker-sheet={sheetOpen ? "open" : "collapsed"}
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t bg-background/95 shadow-lg backdrop-blur",
              "transition-[height,width] duration-500 ease-out motion-reduce:transition-none",
              sheetOpen ? "h-[55dvh] rounded-t-ui" : "h-13",
              "lg:inset-x-auto lg:right-3 lg:top-16 lg:bottom-16 lg:h-auto lg:rounded-ui lg:border",
              panelOpen ? "lg:w-96" : "lg:w-12 lg:justify-center",
            )}
          >
            {/* The peek bar, below lg. The whole strip is the control, because
                on a sheet the strip is the affordance.

                It says the current answer, not the open tab. The tab row inside
                the sheet names the tab and switches it, so a strip repeating
                that word was a label standing where a fact belonged: "Zavetišča"
                over a sheet whose first control already said "Zavetišča". What
                a collapsed sheet has to carry is what the picking added up to,
                which is the same sentence the toolbar trigger wears, computed
                once as `label` above and read here. The count badge stays
                beside it as the at-a-glance form of the same thing. */}
            <button
              type="button"
              data-picker-peek
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((current) => !current)}
              className="flex h-13 shrink-0 items-center gap-2 px-4 text-left lg:hidden"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {label}
              </span>
              {selected.length > 0 && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[11px] tabular-nums text-muted-foreground">
                  {selected.length}
                </span>
              )}
              <ChevronUp
                className={cn(
                  "ml-auto size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                  sheetOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            {/* The rail: everything the folded panel still has to say, which is
                which question is open and how much has been picked. One
                control, so the whole rail head takes the click. */}
            {!panelOpen && (
              <button
                type="button"
                data-picker-rail
                aria-expanded={false}
                aria-label={messages.expandPanel}
                onClick={() => setPanelOpen(true)}
                className="hidden shrink-0 flex-col items-center gap-2 p-2 text-muted-foreground transition-colors hover:text-foreground lg:flex"
              >
                <ChevronLeft className="size-4" aria-hidden />
                {muniMode ? (
                  <PawPrint className="size-4" aria-hidden />
                ) : (
                  <List className="size-4" aria-hidden />
                )}
                {selected.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] tabular-nums">
                    {selected.length}
                  </span>
                )}
              </button>
            )}

            {/* The tabs, in both docks. They used to be md:flex only, which
                left the second question unreachable on a phone: the found-
                animal mode could be entered from the strip on the page and
                never from inside the dialog, and once in it the only way back
                to the shelter list was to tap a region and hope. The peek bar
                names the open tab but does not switch it, so a phone had a
                label where the control should be.

                Same fold idiom as the list block below: the row is a flex row,
                and each breakpoint hides it when its own dock is folded, so
                neither a lg:hidden nor a max-lg:hidden ever has to outrank a
                display utility written beside it. */}
            {(panelOpen || sheetOpen) && (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1 px-4 pt-4 pb-2 max-lg:pt-2",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
                {municipalities && municipalities.length > 0 && (
                  // Two questions, two tabs: filter by shelter, or start from a
                  // found animal's občina. Labeled and always visible, so the
                  // second mode is discoverable instead of a footnote. Same
                  // shape as the species tabs, so the site has one tab.
                  <div className="flex min-w-0 shrink gap-1">
                    {(
                      [
                        { mode: false, label: messages.shelters },
                        { mode: true, label: messages.muniTab },
                      ] as const
                    ).map(({ mode, label }) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={muniMode === mode}
                        onClick={() => {
                          setMuniMode(mode);
                          if (!mode) {
                            setMuniShelterIds(null);
                            setMuniName(null);
                          }
                        }}
                        data-picker-tab={mode ? "municipality" : "shelters"}
                        className={cn(
                          // 44px of height below lg, the touch target the rest
                          // of this dialog's mobile chrome already keeps. See
                          // the close button above for why this dialog's
                          // touch-target gates sit at lg rather than at md.
                          "inline-flex shrink-0 items-center justify-center rounded-ui px-2.5 py-1 text-sm transition-colors max-lg:min-h-11 max-lg:px-3.5",
                          muniMode === mode
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  data-picker-collapse
                  aria-expanded
                  aria-label={messages.collapsePanel}
                  onClick={() => setPanelOpen(false)}
                  // lg only: below it the peek bar is what folds the dock, and
                  // a second fold control in the sheet would be two answers to
                  // one question.
                  className="ml-auto hidden size-8 shrink-0 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}

            {/* Mounted while either dock is out, and hidden at the breakpoint
                whose dock is folded. One copy of the list, one search box, one
                pick card, whichever way the panel is currently drawn. */}
            {(panelOpen || sheetOpen) && (
              <div
                className={cn(
                  // max-lg:pb-20 is the room the confirm pill docks into at
                  // the foot of the sheet: the pill is drawn over this block,
                  // not in it, so the padding is what keeps it off the last
                  // row of the list.
                  "flex min-h-0 flex-1 flex-col px-4 pb-4 max-lg:pt-1 max-lg:pb-20",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
            {muniMode && municipalities ? (
              <MunicipalityFinder
                entries={municipalities}
                selectableIds={selectableIds}
                selected={selected}
                onToggle={onToggle}
                onActiveShelters={setMuniShelterIds}
                onActiveMunicipality={setMuniName}
              />
            ) : (
              <>
            {/* Above the search boxes and in the flow, so it pushes them down
                instead of covering them: the click's answer arrives without
                taking away what was already there. */}
            {pick && (
              <MapPickCard
                pick={pick}
                rows={rows}
                counts={counts}
                selected={selected}
                summaries={summaries}
                onToggle={onToggle}
                onDismiss={() => {
                  setPick(null);
                  // The X is inside the panel, so dismissing it would drop
                  // keyboard focus on the body. Search is where the panel
                  // starts and where the dialog puts focus on open.
                  //
                  // Pointers only, the same rule the dialog's own
                  // onOpenAutoFocus keeps: focusing an input on a touch device
                  // raises the soft keyboard over half the sheet, which is not
                  // what dismissing a card asked for.
                  if (!window.matchMedia?.("(pointer: coarse)").matches) {
                    searchRef.current?.focus();
                  }
                }}
                cardRef={pickCardRef}
              />
            )}

            <div className="relative shrink-0">
              <Search
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // The top row a key may act on: the first match that has
                  // something to toggle. Both branches below mean the same
                  // row, so it is found once.
                  const first = visibleRows.find(
                    (row) =>
                      (counts.get(row.value) ?? 0) > 0 ||
                      selected.includes(row.value),
                  );
                  // Enter takes the top match, so search-and-pick is one
                  // gesture. ArrowDown walks into the list instead.
                  if (event.key === "Enter" && query.trim()) {
                    if (first) onToggle(first.value);
                    event.preventDefault();
                  } else if (event.key === "ArrowDown") {
                    if (first) {
                      rowRefs.current.get(first.value)?.focus();
                      event.preventDefault();
                    }
                  }
                }}
                placeholder={messages.searchShelters}
                aria-label={messages.searchShelters}
                // 44px tall below lg, the same touch-target rule the rest of
                // this dialog's mobile chrome keeps; lg and up gets the
                // denser h-8 back. text-base below lg because iOS Safari
                // zooms the page whenever a focused input sets type under
                // 16px, and this dialog is a map: a zoom leaves it unaimable.
                className="h-11 pl-8 text-base lg:h-8 lg:text-sm"
              />
            </div>

            {/* The typed way to sort by distance, and the one that always
                works: no permission prompt, no fix to wait for, and it answers
                "which shelter is near the town I am moving to" as well as it
                answers "near me". A postcode or a town name, resolved against
                the postal-district table. */}
            <div className="relative mt-2 shrink-0">
              <MapPin
                className={cn(
                  "absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 transition-colors",
                  resolved.source === "typed"
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                aria-hidden
              />
              <Input
                ref={placeRef}
                type="text"
                inputMode="text"
                autoComplete="postal-code"
                value={place}
                onChange={(event) => {
                  const next = event.target.value;
                  setPlace(next);
                  // The most recent act wins. Typing a place that resolves is
                  // a newer answer than any fix, so geolocation goes off
                  // rather than quietly outranking what was just typed.
                  // Anything else only clears a stale error, which would
                  // otherwise sit on top of this input's own feedback and make
                  // typing look inert.
                  if (readTypedLocation(next).status === "matched") {
                    turnOffNearby();
                  } else {
                    dismissError();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    // Nothing to submit: the sort already followed the typing.
                    // Enter is how a keyboard says it is done, so take the
                    // focus off the field and leave the dialog alone.
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  // Escape is the dialog's to hear first, so what it does in
                  // this field is decided on DialogContent above.
                }}
                // The field holds one place at a time, so coming back to it
                // means replacing, not appending. Selecting on focus makes
                // typing a new postcode over an old one just work.
                onFocus={(event) => event.currentTarget.select()}
                enterKeyHint="done"
                placeholder={messages.postcodeOrTown}
                aria-label={messages.postcodeOrTown}
                aria-describedby={statusId}
                // Same 44px-and-16px-below-lg rule as the search box above it.
                className="h-11 pl-8 pr-8 text-base lg:h-8 lg:text-sm"
              />
              {place !== "" && (
                <button
                  type="button"
                  onClick={() => {
                    setPlace("");
                    placeRef.current?.focus();
                  }}
                  aria-label={messages.clearLocation}
                  // The icon stays size-6, but below lg the button's own box
                  // grows to the 44px touch target and re-centers on the same
                  // spot the smaller icon sits at, so the field does not have
                  // to widen for it.
                  className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground lg:size-6"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              )}
            </div>

            {/* Directly under the field it is about, where the eye already is
                after typing. Stays mounted so a denied permission is
                announced, not just drawn. */}
            <p
              id={statusId}
              aria-live="polite"
              className="mt-1 shrink-0 text-[11px] leading-tight text-muted-foreground empty:hidden"
            >
              {status}
            </p>

            <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
              {/* This changes sort order, not filter state. The icon is a
                  crosshair rather than the sort arrow the sort picker owns:
                  with a typed box above it, this button's job is "use where I
                  am", and sorting is what both of them cause. It steps aside
                  while a typed place drives the sort: the list is already
                  nearest-first, and pressing it then would silently swap the
                  typed origin for the visitor's own. */}
              {resolved.source !== "typed" && (
                <button
                  type="button"
                  onClick={toggleNearby}
                  aria-pressed={nearbyOn}
                  className={cn(
                    // max-lg:min-h-9 rather than the full 44px: this row sits
                    // beside the Clear button and a full min-h-11 on both
                    // would force the row itself taller than the layout
                    // wants. 36px still clears the WCAG 2.5.8 minimum and
                    // is a real improvement on the old py-0.5 (about 22px).
                    "inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors max-lg:min-h-9",
                    nearbyOn
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {state.status === "locating" ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Navigation className="size-3.5" aria-hidden />
                  )}
                  {state.status === "locating"
                    ? messages.locating
                    : messages.nearestFirst}
                </button>
              )}

              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleMany(selected)}
                  // Same max-lg:min-h-9 as the nearest-me toggle beside it.
                  className="ml-auto inline-flex items-center rounded-ui py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground max-lg:min-h-9"
                >
                  {messages.clear} ({selected.length})
                </button>
              )}
            </div>

            {/* The list scrolls inside the panel at every size. In the sheet it
                used to be the dialog that scrolled; the sheet has a fixed
                height, so the scrolling has to happen here or the peek bar
                gets pushed off the top of its own sheet. */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {visibleRows.length === 0 && visibleOffRows.length === 0 ? (
                <div className="space-y-1.5 px-2 py-2 text-sm text-muted-foreground">
                  <p>
                    {messages.noSheltersFound} »{query.trim()}«
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    className="text-xs underline underline-offset-2 transition-colors hover:text-foreground"
                  >
                    {messages.clearSearch}
                  </button>
                </div>
              ) : (
                <>
                  <ShelterRows
                    rows={visibleRows}
                    counts={counts}
                    selected={selected}
                    onToggle={onToggle}
                    refs={rowRefs}
                    highlighted={hoveredMarkerValues ?? undefined}
                    onHoverRow={setHoveredRowValue}
                    onExitTop={() => searchRef.current?.focus()}
                    lessThanOneKm={messages.lessThanOneKm}
                    // Two columns from sm up to lg, one column from lg: the
                    // single column is the narrow panel's shape, and the panel
                    // only exists from lg now. In the sheet the list has the
                    // width of the screen and two columns is what fits it.
                    className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
                  />

                  {/* Registry shelters without animals, under their own
                      heading so the zeroes read as "not here yet" rather
                      than as empty search results. There is nothing to
                      filter by, but there is a page for each of them, so
                      the rows are links out rather than dead toggles:
                      ShelterRows renders a row with an href as an <a>
                      instead of a toggle button, so the two lists share
                      their layout, their columns and their map-hover
                      scroll echo instead of one copying the other by hand. */}
                  {visibleOffRows.length > 0 && (
                    <div className="mt-3">
                      <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                        {messages.noAnimalsListedHeading}
                      </p>
                      <ShelterRows
                        rows={visibleOffRows.map((row) => ({
                          value: row.value,
                          label: row.label,
                          city: row.city,
                          km: row.km,
                          href: `${detailBase}/${row.value}`,
                        }))}
                        highlighted={hoveredMarkerValues ?? undefined}
                        onHoverRow={setHoveredRowValue}
                        lessThanOneKm={messages.lessThanOneKm}
                        className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* This one is about the map, not about the input, so it stays at
                the bottom of the column. */}
            <div className="mt-2 shrink-0">
              <p className="text-[11px] leading-tight text-muted-foreground empty:hidden">
                {missing}
              </p>
            </div>
              </>
            )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
