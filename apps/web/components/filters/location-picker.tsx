"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  List,
  LoaderCircle,
  MapPin,
  Maximize2,
  Navigation,
  PawPrint,
  Search,
  X,
} from "lucide-react";
import { MiniMap } from "@/components/filters/mini-map";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
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
import { EmptyMarkerGlyph } from "@/components/filters/map-marker";
import { OriginGlyph } from "@/components/filters/map-callout";
// No MapPick here any more. The map still builds one and hands it to onPick,
// because a marker and a region have to say which they were for the callout's
// own sake, but nothing in this component keeps it: a click picks, and what it
// picked is read off the rows themselves.
import { ShelterMap, mapFacts } from "@/components/filters/shelter-map";
import {
  ShelterRows,
  type ShelterRow,
} from "@/components/filters/shelter-rows";
import { useI18n } from "@/components/i18n-provider";
import { useScrollEdgeFades } from "@/hooks/use-scroll-edge-fades";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import { useNearby } from "@/hooks/use-nearby";
import type { FilterOption } from "@/lib/filters";
import { cityAt, distanceKm, onMap, project, type LatLon } from "@/lib/geo";
import { isDrop } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import {
  allShelters,
  sheltersOf,
  animalCount,
  shelterCount,
  sheltersDropped,
  sheltersMissingFromMap,
} from "@/lib/labels";
import { DENSITY_STEPS, type ShelterPin } from "@/lib/map-layout";
import { regionAt } from "@/lib/map-regions";
import { MUNICIPALITY_CENTROIDS } from "@/lib/postcode-municipalities";
import { readTypedLocation, resolveOrigin } from "@/lib/origin";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { looksLikePostcode } from "@/lib/postal-lookup";
import { cn } from "@/lib/utils";

/** Whether two picks stand for the same shelters, whatever order they list
 *  them in. Both sides come from the same layout pass and hold no duplicates,
 *  so equal lengths plus one-way membership is set equality. */
function sameValues(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

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

// The map legend, one rendering at every width. It used to be two, a column
// floated into the plate's bottom-left corner from lg up and a wrapping row
// under the plate below that, on the bet that the letterbox always left paper
// in that corner. It does not: a plate limited by height fills its box, and
// the column sat on the country. The legend is a caption under the map now,
// which is one shape and one place, and a wrapping row is what a caption under
// a plate wants to be at any width.
//
// It explains what nobody can guess and nothing else. The density ramp is the
// one encoding with no other way in, so it is always here. Everything else
// waits for the thing it describes to exist: the hatch appears with the first
// partial selection, the origin ring with the first origin. The marker shapes
// and sizes explain themselves on hover, through the callout, so they say
// nothing here at all.
//
// One rendering, compacted by CSS below lg rather than replaced by a second
// one. The sheet used to take the whole caption away with it, which left a
// phone reading a density ramp, a hatch and an origin ring with nothing on
// screen to explain any of them. What a phone gets is the same set of rows in
// a tighter register: 10px instead of 11, half the gaps, and no hover
// affordance on the swatches, because the highlight they drive is gated on a
// mouse and a touch device has none. The empty-marker row is the one that is
// genuinely absent below md, and it says so itself.
function MapLegend({
  highlightedDensity,
  onHoverDensity,
  onLeaveDensity,
  hasSelectedRegion,
  hasMixedRegion,
  hasEmptyMarker,
  origin,
  messages,
}: {
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
   *  now. The row itself decides at which widths that is worth saying: see it
   *  below. */
  hasEmptyMarker: boolean;
  origin: LatLon | undefined;
  messages: ReturnType<typeof useI18n>["messages"];
}) {
  return (
    <div
      data-map-legend
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-3xs leading-none text-muted-foreground lg:gap-x-4 lg:gap-y-1.5 lg:text-2xs"
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
            // Both are lg-only, because both are about a pointer: below lg
            // the padding buys a touch device nothing but width it does not
            // have, and a help cursor advertises an answer it cannot get.
            //
            // Pointer events gated on a mouse, the idiom use-filter-motion.ts
            // already uses. A tap synthesizes a mouseenter with no mouseleave
            // after it, so the highlight latched and every unpicked region
            // stayed dimmed for the rest of the session.
            <span
              key={opacity}
              className="lg:cursor-help lg:p-0.5"
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

          This row follows the markers and not the docks: markers are drawn
          from md up, so max-md:hidden is what keeps the row off the phone,
          where there is no hollow circle to explain. */}
      {hasEmptyMarker && (
        <span className="flex items-center gap-1.5 max-md:hidden">
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

// The words only this dialog says, which the shared messages do not carry.
// Kept here as a locale pair rather than as bare strings, the shape
// animal-page.tsx and shelters-page.tsx use for the same job, so the second
// locale cannot be forgotten.
//
// The two that carry a number, `matches` and `showing`, are a label followed
// by a colon rather than a sentence. That shape sidesteps the agreement
// Slovenian would otherwise demand of a verb with a counted noun, and it
// leaves the noun itself to the helpers in lib/labels.ts.
//
// The search announcement's zero case is not here: it reuses noSheltersFound,
// so the sentence a screen reader hears and the sentence drawn in the empty
// list are the same sentence.
const pickerText = {
  sl: {
    matches: "Zadetki",
    showing: "Prikazano",
    done: "Končano",
    clearSelection: "Počisti izbor",
  },
  en: {
    matches: "Matches",
    showing: "Showing",
    done: "Done",
    clearSelection: "Clear selection",
  },
} satisfies Record<Locale, Record<string, string>>;

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
  /** Municipality → responsible-shelter entries. When present, the dialog
   *  grows a second mode behind a quiet button: search by občina instead of
   *  by shelter. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site. Drawn as inert markers
   *  and as rows linking to their shelter page, so the map answers "where are
   *  Slovenia's shelters" and not just "where are ours". */
  offSite?: FilterOption[];
  /** Per-shelter species breakdown and longest wait, keyed by shelter id, for
   *  the details a list row opens and for the map's own hover callout.
   *  Computed once in the grid from the whole dataset. */
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
  // Which shelter's details are open in the list, by id. Null until an info
  // control is pressed and null again once one is collapsed. One at a time,
  // and that rule lives here because this is the only thing that sees the
  // whole list: opening a second shelter closes the first.
  //
  // It is inspection and nothing else. Nothing here reads or writes the
  // selection and the selection never writes here, which is the whole of the
  // split: a shelter can be looked at without being picked, and picked without
  // being looked at.
  const [expandedShelter, setExpandedShelter] = useState<string | null>(null);
  // Whether the registry shelters with nothing listed are unfolded. Shut to
  // start with: none of them can be picked, so every row of that group is
  // scroll the picker charges before reaching anything pickable, and the group
  // heading names how many are folded away.
  //
  // It only governs the case where there is something to fold against. A
  // search whose matches are all off-roster leaves the live list empty, and
  // there the group is not a group at all, it is the whole answer: the list
  // draws it open and unfoldable rather than putting the one thing the query
  // found behind a control that reads as "not found". See the branch at the
  // foot of the scroller.
  const [offGroupOpen, setOffGroupOpen] = useState(false);
  // Drives the two mask stops on the list's fade-scroll: the hook writes
  // --scroll-fade-top/bottom off the scroll position and re-measures on the
  // children, which is what keeps the bottom fade honest when the group at the
  // foot of the list folds open or shut and changes the scroll height without
  // a scroll event. A callback ref, so it wires up on whichever commit the
  // dialog gets around to mounting the list in.
  const listRef = useScrollEdgeFades<HTMLDivElement>();
  // The news of a region click that took several shelters off at once, and the
  // selection it left behind. It is carried with that selection rather than
  // cleared by hand because every other path that edits the selection would
  // otherwise have to remember to clear it: the note is read only while
  // `after` is still what is selected, so the next change of any kind retires
  // it.
  const [dropNote, setDropNote] = useState<{
    text: string;
    after: string[];
  } | null>(null);
  // The shelter an animal card asked the map to point at. One at a time, like
  // the expanded shelter above it, and gone when the dialog closes: it answers
  // "where is this one", not "which ones did I choose".
  const [spotlitShelterId, setSpotlitShelterId] = useState<string | null>(null);
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
      const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
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
      const isDesktop = window.matchMedia(DESKTOP_QUERY).matches;
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
    return () => window.removeEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
  }, [canSpotlight, deepLink]);
  const searchRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState("");
  const placeRef = useRef<HTMLInputElement>(null);
  // The status line belongs to the place input, both on screen and to a
  // screen reader, so it is named once and pointed at from the field.
  const statusId = useId();
  // Names the off-roster rows for a screen reader. Both branches below draw
  // the same heading, one as a fold trigger and one as a plain paragraph, and
  // both hand this id to the rows underneath so the group is labelled whether
  // it can be folded or not.
  const offGroupId = useId();
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
  // mean, and the "Izbrano:" line above it is what says what a region click
  // just took.
  //
  // Every target on the map is a toggle and nothing else, with nothing in
  // between: a click on something not picked yet picks it and brings the panel
  // out so the result is visible, a click on something already picked drops
  // it, on that same click. Click, tap, Enter and Space all land here, and a
  // list row does the same through the parent's own onToggle.
  //
  // That is what the markers and the regions have been saying all along
  // through aria-pressed, and the picker used to disagree with them: a click
  // on a picked target re-asked about it and changed no filter, so the first
  // press of a pressed control did nothing to the selection. No map target
  // opens information of any kind now, so nothing on screen stands between a
  // click and its effect, and nothing on screen decides what a click does.
  // Asking about a shelter is the info control's job, one row down in the
  // list.
  const handlePick = useCallback(
    (values: string[]) => {
      // The same predicate toggleValues branches on, read before it runs so
      // the live region and the filter cannot disagree about what this click
      // did.
      const dropping = isDrop(selected, values);
      onToggleMany(values);
      if (dropping) {
        // Dropping asks nothing and moves nothing else: the rest of this
        // dialog's state is about what is being looked at, and taking a
        // shelter out of the filter is not a statement about that. Open
        // details in particular stay open, including the dropped shelter's
        // own, which is the point of keeping the two verbs apart.
        //
        // aria-pressed can say one marker came off; it cannot say twelve did,
        // and the running total in the live region is a total, not a
        // difference. Only for a region, because a single shelter's own
        // pressed state is the whole of that news. Stale notes need no
        // clearing: the note is only read while the selection is still the one
        // this click left behind.
        if (values.length > 1) {
          setDropNote({
            text: sheltersDropped(values.length, locale),
            after: selected.filter((value) => !values.includes(value)),
          });
        }
        return;
      }
      // What was picked is read off the panel, as the rows' own accent and as
      // the "Izbrano:" line, so a click has to bring the panel out wherever it
      // is folded. Both docks, because only the one at the current breakpoint
      // is on screen and the other is a no-op there.
      setPanelOpen(true);
      setSheetOpen(true);
      // The shelter list is in the panel's other tab, so a click while the
      // found-animal tab is open comes back to it. Same clearing the tab
      // button does.
      setMuniMode(false);
      setMuniShelterIds(null);
      setMuniName(null);
      // A click on the country is a newer question than the one an animal
      // card arrived with, and two rings at once would be two answers.
      setSpotlitShelterId(null);
    },
    // `selected` is read, not just written through: the click has to know
    // whether it drops before the toggle runs, and what the selection it
    // leaves behind looks like. Both are facts about the selection at click
    // time, which the functional setter form cannot carry.
    [locale, onToggleMany, selected],
  );

  // Which row a marker hover brings into view, and whether it brings one at
  // all. Open details are an answer someone asked for, and asking outranks a
  // pointer passing over the map: the hover still tints its row, but it stops
  // scrolling the list, which used to carry the answer off the top of it.
  // Worst on the shelters with nothing listed, whose rows sit at the very
  // bottom under their own heading, so grazing one of those hollow circles
  // threw the list all the way down to a row that cannot even be picked.
  //
  // Computed here rather than handed to the lists as a flag they each have to
  // remember: both take this one value, and neither can forget a rule it is
  // not carrying.
  const hoverScrollTo = expandedShelter ? undefined : hoveredMarkerValues?.[0];

  // Opening one shelter closes whichever was open, and pressing the control of
  // the shelter that is already open closes it. The rows report which one is
  // open and ask for a change; the rule about the list as a whole is kept
  // here, because the rows only ever see themselves.
  //
  // No focus management, and that is a change from the card this replaces. The
  // card's X sat inside the card and vanished with it, so a dismiss that did
  // nothing else dropped keyboard focus on the body and the restore was not
  // optional. The control that collapses now is the row's own trigger: it
  // stays mounted, it stays exactly where it was, and it keeps focus by
  // itself. Nothing inside the panel is focusable either (ShelterDetails
  // carries no button at all), so a collapse can never strand focus inside the
  // region it closes. Moving focus here would be the surprise, not the fix.
  const toggleExpandedShelter = useCallback((value: string) => {
    setExpandedShelter((current) => (current === value ? null : value));
  }, []);

  // Bring a shelter's panel into view when it opens. The row itself is on
  // screen by definition, because the control that opened it is in that row,
  // but the panel grows below it and the scroller it grows into can be as
  // short as 5rem in the sheet: opened from the last visible row, the answer
  // would be entirely under the fold with only the control's own label to say
  // anything happened. The whole cell is scrolled, row and panel together, so
  // "nearest" measures what actually has to fit.
  //
  // Twice, and both are needed. The first call is the one that runs where
  // there is no animation to wait for; the second waits for the open animation
  // to finish, because before it does the panel's height is still ramping up
  // from zero and "nearest" would measure a strip that is not there yet.
  // Both are "nearest", so the one that has nothing to do does nothing.
  //
  // Reached through the row's ref and the cell it sits in rather than through
  // a ref of its own: the panel is built in shelter-rows.tsx and this file has
  // no handle on it, and the collapsible is the element the row is wrapped in
  // there. Focus is deliberately untouched, same as everywhere else here.
  useEffect(() => {
    if (!expandedShelter) return;
    const cell = rowRefs.current
      .get(expandedShelter)
      ?.closest('[data-slot="collapsible"]');
    if (!cell) return;
    const bring = () => cell.scrollIntoView({ block: "nearest" });
    bring();
    cell.addEventListener("animationend", bring, { once: true });
    return () => cell.removeEventListener("animationend", bring);
  }, [expandedShelter]);

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

  // What typing just did to the list. Refiltering was silent: the count is
  // only readable off the rows themselves, and the "no matches" state is drawn
  // inside the scroller, which nobody is looking at while they type into the
  // box above it. Neither of the dialog's other two live regions moves when
  // the query does, so this is said in the one below them that is about the
  // list as a whole.
  //
  // Both lists count, because both are what the query narrowed: an off-site
  // shelter is still a shelter the search found. Undefined while the box is
  // empty, so an unsearched dialog says nothing about a search.
  const matched = visibleRows.length + visibleOffRows.length;
  const searchNews = query.trim()
    ? matched === 0
      ? `${messages.noSheltersFound} »${query.trim()}«`
      : `${pickerText[locale].matches}: ${shelterCount(matched, locale)}`
    : undefined;

  const unplaced = rows.length + offRows.length - pins.length;
  // Which legend rows the map has earned right now: the solid selection green,
  // the hatch, the hollow circle. Asked of the same layout and the same
  // grouping the map draws from, so a legend row and the thing it explains
  // appear and disappear together. One memo and one pass, because laying the
  // towns out and walking each one through a point-in-polygon lookup is the
  // expensive part and every answer comes off it.
  const { hasSelected, hasMixed, hasEmpty } = useMemo(
    () => mapFacts(pins, selected),
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
  //
  // The plain geolocation case says nothing at all now. It used to draw
  // sortedByDistance, "Seznam je razvrščen po bližini.", which was the third
  // statement of one fact: the Najbližje prvo toggle eight pixels below it
  // reports aria-pressed and goes font-medium while it is on, and every row in
  // the list carries its own "· 23 km". The two branches either side of it
  // stay, because neither is a restatement of anything: locationOutsideMap is
  // news about the origin landing off the map, and sortedByDistanceFrom names
  // a typed place the toggle does not mention. i18n's sortedByDistance is kept
  // as well, since locationOutsideMap composes its second sentence.
  const status =
    state.status === "error"
      ? state.message
      : resolved.source === "geolocation"
        ? origin && !onMap(origin)
          ? messages.locationOutsideMap
          : undefined
        : typed.status === "unknown"
          ? looksLikePostcode(place)
            ? messages.postcodeNotFound
            : messages.locationNotFound
          : resolved.source === "typed"
            ? t("sortedByDistanceFrom", { label: resolved.label ?? "" })
            : undefined;
  const missing =
    unplaced > 0 ? sheltersMissingFromMap(unplaced, locale) : undefined;

  // One roster, and every count in this dialog is read off it. The four
  // quantities are kept apart on purpose, because conflating any two of them
  // is what made the trigger lie:
  //
  //   total       every shelter in the registry, the live ones and the ones
  //               with nothing listed alike. This is what the list renders and
  //               what the trigger promises, and it does not move when a
  //               species tab does.
  //   selected    how many are picked. Always a subset of the roster, so
  //               "2 od 1 zavetišč" cannot be written any more.
  //   resultCount the animals the whole filter state matches, which is about
  //               animals and not about shelters at all.
  //
  // `total` used to be options.length, which is the shelter facet of the
  // species-filtered set: the trigger read "Vseh 11 zavetišč" over a list of
  // seventeen rows, and /?zavetisce=macja-hisa,macji-dol&vrsta=zajcek read
  // "2 od 1 zavetišč". The roster is the registry now, so the sentence on the
  // trigger and the rows under it are the same set of shelters.
  const total = rows.length + offRows.length;
  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";

  // The registry's shelters with nothing listed, as a heading and a list. Held
  // here rather than inside the JSX because the two are drawn by whichever of
  // two shapes the query leaves room for, and building them in an IIFE inside
  // the render tree put the largest block in this file behind an anonymous
  // expression fourteen levels deep.
  const offGroupHeading = t("noAnimalsListedHeadingCount", {
    count: visibleOffRows.length,
  });
  const offGroupList = (
    <ShelterRows
      rows={visibleOffRows.map((row) => ({
        value: row.value,
        label: row.label,
        city: row.city,
        km: row.km,
        href: `${detailBase}/${row.value}`,
      }))}
      highlighted={hoveredMarkerValues ?? undefined}
      scrollTo={hoverScrollTo}
      onHoverRow={setHoveredRowValue}
      lessThanOneKm={messages.lessThanOneKm}
      labelledBy={offGroupId}
      className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
    />
  );
  // "Vsa zavetišča" alone, with no count: the roster this dialog lists is the
  // whole UVHVVR registry, live shelters and the ones with nothing listed
  // alike, which is not the number the hero states in the same breath (the
  // live-shelter count). A number here used to read as a second, disagreeing
  // answer to a question the hero had just answered ("11 zavetišč" next to
  // "Vseh 17 zavetišč"); see allShelters in lib/labels.ts.
  const label =
    selected.length === 0
      ? allShelters(locale)
      : sheltersOf(selected.length, total, locale);

  // The way out of the dialog, carrying the number the picking adds up to.
  // Filtering is live, so this is not a promise about what the press will do.
  // Nothing happens on the way out that has not happened already; the button
  // names what is behind it, the same job `label` does for the trigger.
  //
  // Zero keeps the bare "Končano". "Pokaži 0 živali" offers something the
  // press cannot deliver, and a visitor who has filtered everything away needs
  // the way out named, not the emptiness counted: the empty state inside the
  // list is where that is already said.
  //
  // animalCount is safe in the accusative "Pokaži" puts its object in. žival
  // is an i-stem feminine whose accusative matches its nominative in all four
  // of ANIMAL_FORMS, singular through plural, so the same helper the status
  // line called serves here with no second set of forms.
  const doneLabel =
    resultCount > 0
      ? t("showAnimals", { count: animalCount(resultCount, locale) })
      : pickerText[locale].done;

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
          setExpandedShelter(null);
          setSpotlitShelterId(null);
          // The off-roster fold goes back to shut with everything else here.
          // It is the same kind of state as the query and the open shelter,
          // something the last visit did rather than something about the
          // filter, and a reopened picker that kept one visit's fold while
          // dropping that visit's search is remembering half a session.
          setOffGroupOpen(false);
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
          // A plain button, which is what it is. It used to report
          // role="combobox", and a combobox promises a value and a listbox to
          // pick it from; this one opens a dialog with a map in it and owns
          // neither, so the promise was one no screen reader could collect on.
          // aria-haspopup says what actually happens and aria-expanded says
          // whether it has happened yet, which is the whole of the contract.
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("shelterPickerLabel", { label })}
          // The browser tests' way in. Every other element in this dialog is
          // found by a data-* attribute the component promises to keep, and
          // this one was the exception: the specs located it by implicit role,
          // which is derived from aria-haspopup above and moved when that
          // attribute did. One line changed here turned the whole e2e suite
          // red at once, which reads as a product failure rather than as a
          // selector that needs updating. The role and the label stay worth
          // asserting, but as one explicit a11y check that fails loudly on its
          // own, not as the way seven other tests reach the dialog.
          data-picker-trigger
          // The quiet dress belongs to the toolbar, where the species tabs
          // anchor the row and this control can afford to be only text at
          // rest. The dock has no such anchor: floating on its own plate next
          // to the filled Filtri button, a borderless "Vsa zavetišča" read as
          // a caption, not as something to press. There the button keeps the
          // outline variant's own frame, shadow and dark ground.
          className={cn(
            "justify-between gap-2 font-normal",
            deepLink === "mobile"
              ? // A touch tighter than the size-sm defaults: the frame's two
                // border pixels were exactly what pushed "Vsa zavetišča" into
                // an ellipsis on a 390px dock.
                "gap-1.5 px-2"
              : cn(
                  QUIET_TRIGGER_CLASS,
                  "max-w-[14rem] aria-expanded:border-border",
                ),
          )}
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
          {/* Not a chevron. Everywhere else in this app a chevron down is a
              fold opening in place: the health row, a filter section, the
              off-roster list, a real select. This control opens a full-screen
              map, which is why the ARIA above had to stop saying combobox,
              and the glyph was the other half of the same promise. Maximize
              says what the tap does, and paired with the MiniMap on the left
              the whole button reads as "the small map, made big". */}
          <Maximize2 className="size-3.5 opacity-50" aria-hidden />
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
        //
        // Capped at 84rem rather than 110rem, and 52rem rather than 60rem. A
        // border and a corner radius only read as a frame if there is ground
        // visible outside them; at 110rem the dialog ran to 1760px on a wide
        // monitor, where the backdrop was a sliver and the frame said nothing.
        // The viewport-relative terms are what still decide it on a laptop, so
        // nothing narrower than about 1400px moves at all.
        className="h-[min(94dvh,52rem)] w-[min(94vw,84rem)] max-h-none max-w-none gap-0 overflow-hidden p-0"
        showCloseButton={false}
        closeLabel={messages.close}
        onEscapeKeyDown={(event) => {
          // A ladder, one rung per press, innermost first. Escape empties the
          // box it is pressed in before anything else: clearing a search
          // should not cost the whole map. With the boxes settled, a shelter's
          // open details are the next thing to go. The dialog itself goes on
          // the press after that.
          //
          // The details rung asks nothing about the breakpoint. The card this
          // replaces was drawn from lg up and nowhere else, so below lg the
          // press would have spent itself on state with nothing on screen
          // behind it and read as Escape doing nothing; details render at every
          // width, so at every width this rung takes down something visible,
          // which is what makes the press legible.
          //
          // It collapses and stops there. The selection is not Escape's to
          // touch: the shelter stays picked or unpicked exactly as it was, and
          // the way out of a selection is the row's own toggle or its marker.
          // Focus is left where the press found it, for the reasons on
          // toggleExpandedShelter above.
          //
          // It has to be handled here rather than on the inputs, because the
          // dialog listens for the key on the document in the capture phase,
          // before it ever reaches the field.
          const target = event.target;
          if (target === placeRef.current && place !== "") {
            setPlace("");
            event.preventDefault();
          } else if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          } else if (expandedShelter) {
            setExpandedShelter(null);
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
            cannot drift.
            A bulk drop gets a line in front of it, because the label is a
            running total and a total cannot say that twelve shelters just came
            off.

            The search result follows it in the same region rather than in a
            third one: this region is already the dialog's answer to "what does
            the list hold now", and a live region per fact would have three of
            them competing for the same moment. The clauses are assembled in
            reading order, and every one of them can be absent.

            The running result count is the third clause, because filtering is
            live: a click on a region changes the URL on that click, and this
            is the only place the consequence is spoken. It reads as a
            statement rather than as the promise the footer button used to
            carry.

            Silent in found-animal mode, all of it. Every clause here is about
            the adoption filter, and somebody who came in holding a stray does
            not need their shelter selection read out at them. */}
        <p aria-live="polite" className="sr-only">
          {muniMode
            ? ""
            : [
                dropNote && sameValues(dropNote.after, selected)
                  ? dropNote.text
                  : undefined,
                label,
                `${pickerText[locale].showing}: ${animalCount(resultCount, locale)}`,
                searchNews,
              ]
                .filter(Boolean)
                .join(" ")}
        </p>

        {/* The stage. Everything below is absolutely placed against one of its
            edges; the map's paper ground is the dialog's own background, so
            the letterbox a fixed-aspect SVG leaves has something to land on
            whatever the viewport's shape.

            It is also where the sheet's height is declared, once. Two
            elements need that number: the sheet below wears it as its own
            height, and the map stage wears it as a bottom inset so nothing is
            ever drawn under the sheet. They have to agree exactly, or the map
            is drawn behind the sheet or leaves a band of bare paper above it,
            and Tailwind reads class names out of the source text, so it
            cannot be a shared JS constant. A custom property is the shared
            constant CSS has, and this element is the one both consumers
            inherit from.

            The percentage inside it stays honest under that move. var()
            substitutes tokens rather than values, so the 100% is resolved by
            the property it lands in, on the element it lands on; both
            consumers are absolutely positioned children of this box, so both
            resolve it against this box, which is what they resolved against
            when each wrote the expression out for itself.

            --sheet-reserve is the only term that changes with the viewport:
            it is what the map stage keeps for its caption. See the panel
            below for what the three terms are for, and for why a short wide
            viewport reserves 6rem instead of 9. */}
        <div
          data-picker-stage
          className="relative h-full w-full overflow-hidden bg-muted/40 [--sheet-reserve:9rem] [--sheet-h:min(max(55dvh,27.5rem),calc(100%_-_var(--sheet-reserve)))] max-lg:sm:short:[--sheet-reserve:6rem]"
        >
          {/* The recenter container, and the whole of the recentering. The map
              is given only the space the panel leaves, and the SVG letterboxes
              inside it (preserveAspectRatio, the browser's default), so no
              label and no marker can ever end up under the
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
              // One stack at every width: the plate, then the caption under
              // it. The caption used to float into the plate's own bottom-left
              // corner from lg up, which only works while the letterbox
              // happens to leave paper there; a plate limited by height leaves
              // none and the legend ended up on the country. In flow the plate
              // is given what the caption does not take, so an overlap is not
              // something to tune away, it is something that cannot be
              // expressed.
              "absolute inset-x-0 top-0 flex flex-col gap-2 p-2 sm:p-3",
              // Named, so the paw layer in map-marker.tsx can ask how wide the
              // plate is actually drawn rather than guessing from the viewport.
              // This element is the right one to ask: its width is the width
              // the SVG fills, and it is the box that changes width when the
              // panel folds to a rail. The container query is about width
              // alone, so the caption sharing this column costs it nothing.
              "@container/map-stage",
              // p-3 and not p-4 at lg: every other edge in this dialog is
              // inset by three, the title chip, the close, the pill and the
              // panel alike, and the plate was the one thing keeping a
              // different gutter.
              "lg:right-auto lg:bottom-0 lg:p-3",
              "transition-[width,bottom] duration-500 ease-out motion-reduce:transition-none",
              // Below lg the sheet takes height instead of width, so the same
              // recentering happens on the other axis: the container gives up
              // exactly what the sheet takes and the plate recentres in what
              // is left. Nothing is ever drawn under the sheet either.
              //
              // The inset is the sheet's own height, read from --sheet-h
              // rather than written out a second time. The two used to be twin
              // arbitrary expressions, base and short-viewport, kept in step
              // by a note; they are one declaration on the stage now (see it
              // above), so there is nothing left to drift.
              sheetOpen ? "bottom-(--sheet-h)" : "bottom-13",
              panelOpen
                ? "lg:w-[calc(100%-25.5rem)]"
                : "lg:w-[calc(100%-4.5rem)]",
            )}
          >
            {/* The plate gets what the caption leaves and no more. min-h-0 is
                what lets a flex item give way at all, and the SVG letterboxes
                inside whatever height it ends up with, so the map shrinks
                rather than the caption being pushed off the stage. */}
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <ShelterMap
                pins={pins}
                selected={selected}
                onPick={handlePick}
                origin={origin}
                // This shelter's open details in the list are already carrying
                // its count and species line, so the marker under the pointer
                // says its name and stops there.
                describedElsewhere={expandedShelter}
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
                // The same breakdown the shelter details read. On the plate it is
                // a line of species glyphs under the name of one hovered
                // shelter, so the map answers "who lives here" without
                // waiting for a click.
                summaries={summaries}
                // What an empty region has to say for itself. Computed here
                // because this is where the coverage table already is.
                regionShelterNames={regionShelterNames}
                // lg+: the SVG takes the whole row above and lets its own
                // preserveAspectRatio letterbox the viewBox inside it. That is
                // the letterboxing: no aspect-ratio arithmetic on this side,
                // and the paper it leaves showing is the dialog's ground.
                // Below lg it keeps the component's own h-auto instead, so the
                // plate is exactly as tall as 320:210 makes it and no taller,
                // capped at the row so a raised sheet shrinks it rather than
                // pushing it out of the frame.
                className="max-h-full lg:h-full"
              />
            </div>

            {/* The caption: the legend and the credits, under the plate, which
                is where a printed sheet puts them and the one place they can
                be that no aspect ratio can turn into an overlap. It is the
                stage's last row, so the plate's bottom edge is always above
                it, whatever the sheet is doing to the height they share.

                The plate's own furniture keeps its own corners inside the
                viewBox and never meets this; the confirm pill takes the
                dialog's bottom-right, which at lg is outside this column
                entirely (the stage stops where the panel begins) and below lg
                floats in the same band this sits in, as it did before.

                Nothing in it folds any more. The legend used to be taken away
                with the sheet, on the reasoning that an open sheet leaves the
                map nothing worth explaining; measured, it leaves a plate, and
                the density ramp, the selection green, the hatch and the origin
                ring are all still drawn on it. What a phone gets is the
                compact register MapLegend writes for itself, not a smaller
                share of the same rows. The stage's floor pays for it: see the
                sheet's ceiling term below, which reserves the room this whole
                caption needs rather than the room the credit alone needs.

                CC BY 4.0 requires the attribution paragraph to stay visible,
                which with nothing folding is now a property of the caption as
                a whole rather than of where inside it the paragraph sits. */}
            <div className="pointer-events-none z-10 flex w-full shrink-0 flex-col gap-1">
              <div className="pointer-events-auto">
                <MapLegend
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

              {/* CC BY 4.0 requires attribution, so this stays visible even
                  when the sheet is open on a phone. It reads quieter than the
                  legend it sits under through size alone: at 10px the token
                  was carrying a /70 as well, which measured 2.71:1 against
                  the paper and put the one line the licence requires below
                  the 4.5:1 that normal-size text has to clear. Full strength
                  is the smallest change that clears it. */}
              <p
                // Named, because the licence depends on it staying visible:
                // a test can then find this paragraph and walk its ancestors
                // rather than matching on the classes it happens to wear.
                data-slot="map-attribution"
                // The measure is capped here rather than on the caption as a
                // whole: this is prose and wants a line length, while the
                // legend beside it is a key and wants the plate's own width.
                className="pointer-events-auto max-w-[26rem] text-3xs leading-tight text-muted-foreground"
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
          <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(17rem,65%)]">
            {/* Nothing in the chip is a control, so it takes no pointer: on a
                phone it covers the top-left corner of the plate, and with
                pointer-events-auto it swallowed the taps meant for the two
                regions under it. */}
            <DialogHeader className="pointer-events-none gap-0.5 rounded-ui border bg-background/80 px-2.5 py-1.5 shadow-xs backdrop-blur">
              {/* The chip follows the question the dialog is currently
                  asking. One dialog answers two of them, and the found-animal
                  mode used to be titled "Kje iščeš?" over instructions to pick
                  a region: the deep link from the found-animal strip landed on
                  copy about a filter the visitor had not come to set. The
                  municipality mode says what it is and what the map is doing
                  for it; the instruction is one line at both breakpoints,
                  because the answer arrives in the panel either way. */}
              <DialogTitle className="text-sm leading-tight">
                {muniMode ? messages.muniTab : messages.whereSearching}
              </DialogTitle>
              {/* One line, and short enough to stay one line at the widths
                  this chip is given. The instruction used to name the list as
                  a third way in, which cost it a second and a third line over
                  a list that is already on screen in both docks. What is left
                  is the part only the map has to say. */}
              <DialogDescription className="text-xs leading-tight">
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

          {/* The panel, one element in two docks. At lg it is a card floated
              against the right edge of the stage, folding to a rail; below lg
              the same card is a bottom sheet, folding to a peek bar. Both
              folds are the same DOM with different classes, so the list, the
              search and whichever shelter is open inside it keep their state
              and their scroll position across either move. */}
          <div
            data-picker-panel={panelOpen ? "open" : "collapsed"}
            data-picker-sheet={sheetOpen ? "open" : "collapsed"}
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t bg-background/95 shadow-lg backdrop-blur",
              "transition-[height,width] duration-500 ease-out motion-reduce:transition-none",
              // The sheet used to be a flat 55dvh, which is a fraction of the
              // screen picked for a tall phone and then charged to every
              // short one. Its chrome does not shrink with the viewport: the
              // peek bar, the tab row, the two 44px inputs, the sort row and
              // the pill's reserve come to about 320px whatever the screen
              // is, so at 375x667 the list scroller was left 18px and at
              // 320x568 it was left none at all, with the confirm pill
              // sitting where the first row should have been.
              //
              // Three terms, innermost first:
              //
              //   55dvh          what a tall phone gets, unchanged. At 390x844
              //                  this is still the term that wins, so that
              //                  layout is exactly what it was.
              //   max(…,27.5rem) the floor: 320px of chrome plus three rows of
              //                  about 40px. This is what a short viewport
              //                  gets instead of a fraction, and it is why the
              //                  sheet is sized by what it holds rather than
              //                  by how tall the screen happens to be.
              //   min(…,100%-…) the ceiling, against the stage rather than the
              //                  viewport, so the floor can never push the
              //                  sheet past the dialog it lives in. What it
              //                  subtracts is --sheet-reserve, the map stage's
              //                  own floor, which is what the whole caption
              //                  costs: the legend no longer folds away under
              //                  an open sheet, so the reserve has to cover its
              //                  compact rows, the gap and the CC BY
              //                  attribution together, which is about 128px at
              //                  the narrowest width we draw at. That is the
              //                  9rem the stage declares. It was 6rem while the
              //                  credit was the only thing left standing there;
              //                  at 6rem with the legend back the caption
              //                  overruns the stage and the credit ends up
              //                  behind the sheet, which the licence does not
              //                  allow.
              //
              // The reserve drops to 6rem on a viewport that is short and at
              // least sm wide, which is every phone held sideways. What the
              // reserve pays for is the caption, and the caption is counted in
              // lines: from 640px up the credit wraps to two of them and the
              // legend holds every row it has on one, which measures 70px with
              // the stage's own padding and gap in it, so 9rem there is
              // reserving room for lines nobody draws. Below sm the same rows
              // wrap further and the full reserve stands, because the CC BY
              // paragraph disappearing behind the sheet is not a trade this
              // layout may make. The 48px it hands back is not the fix for a
              // landscape phone, it is what keeps the sheet from spending all
              // of it on chrome: the scroll below is the fix.
              //
              // Below that ceiling the plate is a sliver, which is the honest
              // answer on a 568px screen: the sheet is what was opened, and
              // the peek bar folds it away when the map is what is wanted.
              //
              // Both terms live on the stage as --sheet-h and --sheet-reserve,
              // so the height here and the stage's own bottom inset are one
              // expression read twice rather than two written twice.
              sheetOpen ? "h-(--sheet-h) rounded-t-ui" : "h-13",
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
                beside it as the at-a-glance form of the same thing.

                Except in found-animal mode, where there is no picking and the
                adoption selection is not the current answer to anything on
                screen. A strip reading "2 od 17 zavetišč" over a form asking
                where a stray was found is that selection riding along under a
                question it has nothing to do with. There the strip names the
                question instead, which is the one case where the tab's own
                word is the fact. */}
            <button
              type="button"
              data-picker-peek
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((current) => !current)}
              className="flex h-13 shrink-0 items-center gap-2 px-4 text-left lg:hidden"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {muniMode ? messages.muniTab : label}
              </span>
              {!muniMode && selected.length > 0 && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
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
                control, so the whole rail head takes the click.
                The badge follows the same rule the peek bar does: it counts
                the adoption selection, so it is not shown beside the paw that
                stands for the found-animal question. */}
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
                {!muniMode && selected.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-2xs tabular-nums">
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
                          // Either direction: the open details answered a
                          // question asked on the tab being left, and coming
                          // back should not replay it as if just asked.
                          setExpandedShelter(null);
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
                whose dock is folded. One copy of the list and one search box,
                whichever way the panel is currently drawn. */}
            {(panelOpen || sheetOpen) && (
              <div
                className={cn(
                  // No top padding of its own at any width: the tab row above
                  // already ends with pb-2, and adding to it below lg made the
                  // gap under the tabs two different gaps. Nothing reserved at
                  // the bottom either: every child of this column, the footer
                  // included, takes its own height in flow.
                  //
                  // overflow-y-auto is the floor under all of that. Everything
                  // above sizes the sheet to what it holds, and on a screen
                  // short enough no size is enough: a 390px viewport held
                  // sideways leaves this column about 160px to seat 300px of
                  // chrome, and while the panel clipped what did not fit, the
                  // list and the confirm button were not on screen at all and
                  // nothing scrolled to reach them. The list is still the one
                  // child that gives way, so this scroller only takes over once
                  // the list has given everything it has; when it does, the
                  // footer is scrolled to rather than cut off, which is what in
                  // flow has to mean on a screen that short. The peek bar and
                  // the tab row sit outside it, so the fold and the tabs never
                  // scroll away from under the thumb.
                  //
                  // Plain, not fade-scroll: that utility takes the scrollbar
                  // away and puts a mask in its place, and this is a last
                  // resort that should say so in the platform's own hand.
                  "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4",
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
                            // Selection and nothing else, the same as clicking the
                            // row: search-and-pick is a row click by keyboard, and a
                            // row click asks about nothing.
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
                      className="mt-1 shrink-0 text-2xs leading-tight text-muted-foreground empty:hidden"
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
                            <LoaderCircle
                              className="size-3.5 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Navigation className="size-3.5" aria-hidden />
                          )}
                          {state.status === "locating"
                            ? messages.locating
                            : messages.nearestFirst}
                        </button>
                      )}

                      {/* The way back to no shelter at all, and the only reset in the
                  dialog. Named for what it clears rather than with the bare
                  "Počisti" every other sheet in the site uses: this one sits
                  beside a search box and a place box that both have a clear of
                  their own, and the word alone did not say which of the three
                  it meant. Ghost weight, because live filtering means the
                  primary act is picking, not undoing it. */}
                      {selected.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onToggleMany(selected)}
                          // Same max-lg:min-h-9 as the nearest-me toggle beside it.
                          // px-2 and a hover surface give the press a body to land on,
                          // so it reads as a button rather than a stray line of text.
                          className="ml-auto inline-flex items-center rounded-ui px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:min-h-9"
                        >
                          {pickerText[locale].clearSelection} ({selected.length}
                          )
                        </button>
                      )}
                    </div>

                    {/* The list scrolls inside the panel at every size. In the sheet it
                used to be the dialog that scrolled; the sheet's height is
                bounded, so the scrolling has to happen here or the peek bar
                gets pushed off the top of its own sheet.

                min-h-0 is what lets it give way to the fixed rows above it.
                Below lg it may only give way so far: this is the one child of
                the column that is allowed to shrink, so every pixel the chrome
                wants comes out of here, and with a hard zero as the limit the
                list is what disappears first. 5rem is the last resort, not the
                normal case, and it only bites if something above grows past
                what the sheet's own floor budgeted for it, a two-line status
                line under the place field being the likely one, and a landscape
                phone being the certain one. When it does, the overflow lands in
                the column's own scroll rather than in the list, which is the
                right thing to spend: a row that has to be scrolled to can still
                be read, a row that was never given a height cannot. */}
                    <div
                      ref={listRef}
                      // fade-scroll rather than a scrollbar. The group of
                      // shelters with nothing listed sits below the fold at
                      // every height this panel takes, so the list always has
                      // more under it than it shows, and a bare overflow-y-auto
                      // left that to a scrollbar the platform may draw as
                      // nothing at all until it is scrolled. The mask says it
                      // without taking a gutter, which is also why pr-1 goes:
                      // it was insetting the rows off a scrollbar that is no
                      // longer drawn.
                      className="fade-scroll mt-2 min-h-0 flex-1 overflow-y-auto max-lg:min-h-20"
                    >
                      {visibleRows.length === 0 &&
                      visibleOffRows.length === 0 ? (
                        // The one state in this panel that had a bare
                        // underline for a control. Centred in the space the
                        // list is not using, with the reset as a real button:
                        // an empty list is the one moment the panel has room
                        // to spare, and the way out of it should look like
                        // something to press.
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                          <p className="text-sm text-muted-foreground">
                            {messages.noSheltersFound} »{query.trim()}«
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setQuery("");
                              searchRef.current?.focus();
                            }}
                          >
                            {messages.clearSearch}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <ShelterRows
                            rows={visibleRows}
                            counts={counts}
                            selected={selected}
                            // The parent's own toggle, unwrapped: a row click is a
                            // selection and nothing more, exactly like a marker click.
                            onToggle={onToggle}
                            // What a shelter is, for the one shelter being asked
                            // about. Only the live list needs them: an off-site row
                            // leads to that shelter's own page, which is where its
                            // details already are.
                            summaries={summaries}
                            // Asking about a shelter without touching what is picked.
                            // The row itself cannot carry this: it reports
                            // aria-pressed, so its click has to toggle, and a picked
                            // shelter could never be asked about from its own row. The
                            // two verbs stay apart in both directions, so this handler
                            // goes nowhere near onToggle and onToggle goes nowhere
                            // near this.
                            //
                            // One shelter at a time, decided here because the rows see
                            // one row each and this sees the list.
                            expanded={expandedShelter}
                            onToggleExpanded={toggleExpandedShelter}
                            // The words, from here, because the rows take every word
                            // they show as a prop. Two names for one control, one per
                            // state, and each tooltip's string sits inside the
                            // accessible name that adds the shelter to it (WCAG 2.5.3).
                            infoLabel={(rowLabel) =>
                              t("showShelterDetails", { label: rowLabel })
                            }
                            hideInfoLabel={(rowLabel) =>
                              t("hideShelterDetailsFor", { label: rowLabel })
                            }
                            infoText={messages.showShelterDetailsShort}
                            hideInfoText={messages.hideShelterDetails}
                            refs={rowRefs}
                            highlighted={hoveredMarkerValues ?? undefined}
                            scrollTo={hoverScrollTo}
                            onHoverRow={setHoveredRowValue}
                            onExitTop={() => searchRef.current?.focus()}
                            lessThanOneKm={messages.lessThanOneKm}
                            // What the count pill is counting, said only to a
                            // screen reader: the digits are the row's own mark
                            // and the noun beside "· 113 km" is what stopped
                            // two numbers in one row from reading alike.
                            countLabel={(count) => animalCount(count, locale)}
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
                          {visibleOffRows.length > 0 &&
                            (visibleRows.length === 0 ? (
                              // Nothing live left for the query, so this group
                              // is not a group, it is the answer. No trigger: a
                              // control that cannot be closed without hiding
                              // the only rows on screen is a dead control, and
                              // a fold over the sole match reads as "not
                              // found" on a list that found it.
                              //
                              // Swapping the trigger for a paragraph unmounts a
                              // focusable element, which would drop focus to
                              // the body if it held it. It cannot here: the
                              // only thing that moves visibleRows is the query,
                              // and the query only moves while focus is in the
                              // search box.
                              <div className="mt-3">
                                <p
                                  id={offGroupId}
                                  className="px-2 pb-1 text-2xs font-medium text-muted-foreground"
                                >
                                  {offGroupHeading}
                                </p>
                                {offGroupList}
                              </div>
                            ) : (
                              <Collapsible
                                open={offGroupOpen}
                                onOpenChange={setOffGroupOpen}
                                className="mt-3"
                              >
                                {/* The chevron turns off the trigger's own
                            data-state, which Radix writes and the repo's
                            data-open variant matches, so the open state has one
                            home rather than a copy handed down as a prop. */}
                                <CollapsibleTrigger
                                  id={offGroupId}
                                  className="group flex w-full items-center gap-1 rounded-ui px-2 py-1 text-left text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] max-lg:min-h-9"
                                >
                                  <ChevronRight
                                    className="size-3 shrink-0 transition-transform group-data-open:rotate-90 motion-reduce:transition-none"
                                    aria-hidden
                                  />
                                  {offGroupHeading}
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-1">
                                  {offGroupList}
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                        </>
                      )}
                    </div>

                    {/* This one is about the map, not about the input, so it stays at
                the bottom of the column. No wrapper: the margin belongs on the
                paragraph itself, so empty:hidden takes the gap away with the
                line. Wrapped, the note cost the list 8px of height on every
                screen where there was no note to read. */}
                    <p className="mt-2 shrink-0 text-2xs leading-tight text-muted-foreground empty:hidden">
                      {missing}
                    </p>

                    {/* The way out, at the foot of the panel it belongs to,
                rather than floating over the map with a shadow under it.

                -mx-4 against the column's px-4 so the rule runs the full width
                of the panel rather than stopping at the text. Full width
                because there is nothing to sit beside it: the reset lives up
                by the search box, with the other two clears.

                A folded panel draws no footer, because the whole column is
                hidden at that breakpoint. The X on the map is a plain
                DialogClose and stays where it is, so folding the list costs
                the count on this button and not the way out. */}
                    {!muniMode && (
                      <div className="-mx-4 mt-3 shrink-0 border-t px-4 pt-3">
                        <DialogClose asChild>
                          <Button className="w-full">{doneLabel}</Button>
                        </DialogClose>
                      </div>
                    )}
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
