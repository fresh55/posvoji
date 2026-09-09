import { usePickerHistory } from "@/hooks/use-picker-history";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MapFacts } from "@/components/filters/shelter-map";
import type { ShelterRow } from "@/components/filters/shelter-rows";
import { useI18n } from "@/components/i18n-provider";
import {
  DESKTOP_QUERY,
  useDesktopBreakpointClose,
} from "@/hooks/use-desktop-breakpoint-close";
import { useNearby, useNearbyQuery, useNearbyChosenPlace } from "@/hooks/use-nearby";
import { usePublishNearbyOrigin } from "@/hooks/use-nearby-origin";
import { isDrop } from "@/lib/filters";
import { onMap } from "@/lib/geo";
import {
  animalCount,
  shelterCount,
  shelterSelectionLabel,
  sheltersDropped,
  sheltersMissingFromMap,
} from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { readTypedLocation, resolveOrigin } from "@/lib/origin";
import { looksLikePostcode } from "@/lib/postal-lookup";
import {
  SHELTER_SPOTLIGHT_EVENT,
  type ShelterSpotlightDetail,
} from "@/lib/shelter-spotlight";
import type { LocationPickerProps } from "./contracts";
import {
  bringIntoList,
  fold,
  locateAndSort,
  pickerText,
  shelterNamesByRegion,
  toPins,
  type LocatedRow,
} from "./model";
import { hasHeightToSpare, useLocationPickerMotion } from "./motion";

export function useLocationPickerController({
  options,
  counts,
  selected,
  onToggle,
  onToggleMany,
  resultCount,
  filterSummary,
  onClearFilters,
  municipalities,
  offSite,
  summaries,
  deepLink,
  dress = "toolbar",
  open: controlledOpen,
  onOpenChange,
}: LocationPickerProps) {
  const { locale, messages, t } = useI18n();
  const [selfOpen, setSelfOpen] = useState(false);
  const open = controlledOpen ?? selfOpen;
  // Where an open goes, kept in a ref so the setter below can be stable. The
  // spotlight effect calls it and holds no dependency on it: a setter whose
  // identity moved with the open state would re-subscribe that effect on every
  // close, and it would reopen the dialog the visitor had just dismissed.
  // Synced in an effect declared ahead of it, so it is fresh before anything
  // else in here runs.
  const openTarget = useRef({
    controlled: controlledOpen !== undefined,
    onOpenChange,
  });
  useEffect(() => {
    openTarget.current = {
      controlled: controlledOpen !== undefined,
      onOpenChange,
    };
  });
  const closeCleanup = useRef<() => void>(() => {});
  const setOpen = useCallback((next: boolean) => {
    if (!next) closeCleanup.current();
    if (!openTarget.current.controlled) setSelfOpen(next);
    openTarget.current.onOpenChange?.(next);
  }, []);
  usePickerHistory(open, () => setOpen(false));
  useDesktopBreakpointClose(open, () => setOpen(false), "either");
  const [query, setQuery] = useNearbyQuery();
  const [chosenPlace, setChosenPlace] = useNearbyChosenPlace();
  // Which shelter's details are open in the list, by id. Null until an info
  // control is pressed and null again once one is collapsed. One at a time,
  // and that rule lives here because this is the only thing that sees the
  // whole list: opening a second shelter closes the first.
  //
  // Row disclosure inspects a shelter without changing the selection. A new
  // map pick also opens its details so the selected marker has a visible
  // answer in the list; removing a selection leaves those details alone.
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
  // Detail reveals scroll only the list, keeping search and dialog chrome in place.
  const listNode = useRef<HTMLDivElement | null>(null);
  const listRef = useCallback((node: HTMLDivElement | null) => {
    listNode.current = node;
    return () => { listNode.current = null; };
  }, []);
  const pendingMapFocus = useRef<string | null>(null);
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
  // Retire the note permanently, even if a later selection has the same ids.
  if (
    dropNote &&
    (dropNote.after.length !== selected.length ||
      !dropNote.after.every((value) => selected.includes(value)))
  ) {
    setDropNote(null);
  }
  // The shelter an animal card asked the map to point at. One at a time, like
  // the expanded shelter above it, and gone when the dialog closes: it answers
  // "where is this one", not "which ones did I choose".
  const [spotlitShelterId, setSpotlitShelterId] = useState<string | null>(null);
  const {
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    landSpotlight,
    revealSelection,
    resetDocks,
  } = useLocationPickerMotion(open);
  useEffect(() => {
    closeCleanup.current = () => {
      // Every dismissal, including Back and a breakpoint change, ends the
      // same visit. Keep only the explicitly confirmed place between visits.
      setQuery(chosenPlace?.query ?? "");
      setExpandedShelter(null);
      setSpotlitShelterId(null);
      setOffGroupOpen(false);
      setDropNote(null);
      resetDocks();
    };
  }, [chosenPlace, resetDocks, setQuery]);


  // An animal card asking for its shelter on the map. Guarded by breakpoint
  // because two instances of this picker are mounted at once and exactly one
  // of them is on screen; the hidden one answering would put a second dialog
  // behind the visible one. It asks nothing of the municipality table, so it
  // works in a build with no coverage data.
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
      // A stale search is cleared: it would filter the named row out of the
      // list this is about to scroll.
      setQuery("");
      setOpen(true);
      // Both docks, because the row below has to have somewhere to be brought
      // into view; only the one at the current breakpoint is on screen and the
      // other is a no-op there. Landed here for the same reason the found-
      // animal entry lands itself: this open arrives with a row to show, and a
      // short screen folding the list away would fold the answer away with it.
      landSpotlight();
    };
    window.addEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
    return () => window.removeEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
  }, [canSpotlight, deepLink, landSpotlight, setOpen, setQuery]);
  const searchRef = useRef<HTMLInputElement>(null);
  // The status line belongs to the one input, both on screen and to a
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
  const typed = useMemo(() => readTypedLocation(query), [query]);
  const resolved = useMemo(
    () => resolveOrigin(geolocated, chosenPlace?.location ?? { status: "empty" }),
    [geolocated, chosenPlace],
  );
  const origin = resolved.at;
  // Recognizing a place offers a result; choosing that result changes the
  // origin. Until then, even an exact town name filters the shelter list.
  // Editing the query after choosing a place starts a new shelter search
  // while retaining the confirmed origin in its separate, removable chip.
  const placeMode = chosenPlace !== null && chosenPlace.query === query;
  const choosePlace = useCallback(() => {
    if (typed.status !== "matched") return;
    turnOffNearby();
    setChosenPlace({ location: typed, query });
    searchRef.current?.focus({ preventScroll: true });
  }, [query, setChosenPlace, turnOffNearby, typed]);
  const clearOrigin = useCallback(() => {
    turnOffNearby();
    setChosenPlace(null);
    if (placeMode) setQuery("");
    searchRef.current?.focus({ preventScroll: true });
  }, [placeMode, setChosenPlace, setQuery, turnOffNearby]);
  const placeSuggestionRef = useRef<HTMLButtonElement>(null);
  // Unconfirmed text narrows the list. Emptying the field clears that search
  // without discarding the separately confirmed starting point.
  const searching = !placeMode && query.trim() !== "";
  // The same point, offered to the rest of the page. This control is the only
  // place on the site that asks where the visitor is, and it stays the only
  // place; what changes is that the answer no longer stops at this dialog's own
  // list. The grid's Najbližje sort reads it, and the Kje row's "from here"
  // hint is meant to. Published to a store rather than lifted into a parent
  // because the picker is mounted more than once and none of the readers are
  // anywhere near any of them in the tree; see hooks/use-nearby-origin.ts for
  // how the instances that were never touched are kept from clearing it.
  usePublishNearbyOrigin(resolved);
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
  // shelters here". How a municipality is placed in a region is with the
  // helper, in model.ts, which the found-animal page shares.
  const regionShelterNames = useMemo(
    () => (open ? shelterNamesByRegion(municipalities ?? []) : undefined),
    [municipalities, open],
  );

  // Whether the map is drawing markers right now, as the map itself answers
  // it. Two things in this dialog talk about markers, the instruction under
  // the title and the legend's hollow-circle row, and both used to decide from
  // a viewport breakpoint while the map decided from the plate it had actually
  // measured. They disagreed wherever the two differ, which is most of the
  // width of a phone held sideways: the chip told a visitor to click a marker
  // on a plate carrying none, and the legend explained a circle nothing had
  // drawn.
  //
  // True to start with, which is what ShelterMap starts at too, so the two are
  // one answer from the first render rather than converging on the second.
  const [markersVisible, setMarkersVisible] = useState(true);
  const [{ hasSelected, hasMixed, hasEmpty, hasFilteredEmpty }, setMapFacts] =
    useState<MapFacts>({
      hasSelected: false,
      hasMixed: false,
      hasEmpty: false,
      hasFilteredEmpty: false,
    });

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
  // aria-pressed always agrees with the filter change. Adding a target also
  // opens the first matching shelter's details; a row's disclosure control
  // still offers inspection without selection.
  const handlePick = useCallback(
    (values: string[]) => {
      // The same predicate toggleValues branches on, read before it runs so
      // the live region and the filter cannot disagree about what this click
      // did.
      setDropNote(null);
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
        // pressed state is the whole of that news.
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
      //
      // Except on a screen with no height to spare, where the sheet is the
      // map. There the strip the sheet folds to already carries the whole of
      // this news, the running "2 od 17 zavetišč" and the count badge beside
      // it (see the peek bar), so raising the sheet would cover the country
      // the visitor is still picking from in order to repeat a sentence they
      // can already read. Every tap after the first would have cost a fold.
      revealSelection();
      // Keep the newest map choice and its detail card together. A previous
      // name query must not hide the row that was just chosen on the map.
      if (searching) setQuery("");
      const firstMatch = values.find((value) => options.some((row) => row.value === value));
      if (firstMatch) {
        setExpandedShelter(firstMatch);
        // Mobile selection opens List view and hides the activating map target.
        if (!window.matchMedia(DESKTOP_QUERY).matches && hasHeightToSpare()) {
          pendingMapFocus.current = firstMatch;
        }
      }
      // A click on the country is a newer question than the one an animal
      // card arrived with, and two rings at once would be two answers.
      setSpotlitShelterId(null);
    },
    // `selected` is read, not just written through: the click has to know
    // whether it drops before the toggle runs, and what the selection it
    // leaves behind looks like. Both are facts about the selection at click
    // time, which the functional setter form cannot carry.
    [locale, onToggleMany, options, revealSelection, searching, selected, setQuery],
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

  // Reveal the row and details after a disclosure or map pick. The list can
  // be short and a map pick can name an offscreen row, so measure the whole
  // cell and adjust only the list's scroll position.
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
  //
  // The list is scrolled by hand and the cell is never asked to bring itself
  // in: see bringIntoList, and the column below whose own scroll this used to
  // drag the dialog's title and tabs off the top of.
  useEffect(() => {
    if (!expandedShelter) return;
    const row = rowRefs.current.get(expandedShelter);
    if (sheetOpen && pendingMapFocus.current === expandedShelter) {
      row?.focus({ preventScroll: true });
      pendingMapFocus.current = null;
    }
    const cell = row?.closest('[data-slot="collapsible"]') ?? row;
    if (!cell) return;
    const bring = () => bringIntoList(listNode.current, cell);
    bring();
    cell.addEventListener("animationend", bring, { once: true });
    return () => cell.removeEventListener("animationend", bring);
  }, [expandedShelter, panelOpen, sheetOpen, query, selected]);

  // The spotlit shelter's own row, brought into view once there is a row. It
  // cannot be done where the event is heard: the list is mounted by the dialog
  // that same event opens, so at that point there is nothing to scroll to.
  // "nearest" like the click path above, which leaves an already-visible row
  // where it is, and focus is left alone for the same reason it is there.
  //
  // Through the list and not through the row, the same as the effect above:
  // this one fires on an open, which is the moment the column has the most to
  // lose. A row near the foot of the list would have scrolled the dialog's own
  // title and tabs off the top of a sheet the visitor had not even looked at
  // yet.
  useEffect(() => {
    if (!open || !spotlitShelterId) return;
    bringIntoList(
      listNode.current,
      rowRefs.current.get(spotlitShelterId) ?? null,
    );
  }, [open, spotlitShelterId]);

  // Search narrows the list only. The map keeps every pin, so the country
  // stays whole while you type.
  //
  // Choosing the place result restores the whole list in distance order.
  // Recognition alone keeps the matching shelter rows visible alongside the
  // place suggestion, so the visitor can choose which result they meant.
  const matchesQuery = (row: ShelterRow) =>
    fold(`${row.label} ${row.city ?? ""}`).includes(fold(query.trim()));
  const visibleRows = searching ? rows.filter(matchesQuery) : rows;
  const visibleOffRows = searching ? offRows.filter(matchesQuery) : offRows;

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
  //
  // And undefined while the box holds a place, because then nothing was
  // narrowed: the list is whole and only its order moved. What that typing did
  // is said by the status line under the field, which names the town it
  // resolved to; a "Zadetki: 17 zavetišč" beside it would be a count of the
  // roster dressed up as a search result.
  const matched = visibleRows.length + visibleOffRows.length;
  const searchNews = searching
    ? matched === 0
      ? `${messages.noSheltersFound} »${query.trim()}«`
      : `${pickerText[locale].matches}: ${shelterCount(matched, locale)}`
    : undefined;

  const unplaced = rows.length + offRows.length - pins.length;
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
  //
  // The "no such place" branch is gone from this ladder, and the merged field
  // is why. A word the postal table does not know used to be a mistake worth
  // naming, because the only thing that box could hold was a place. It is now
  // a shelter's name being typed, and the list is already answering it: either
  // it narrows to the matching rows, in which case "Tega kraja ne najdem"
  // contradicts what is on screen, or it narrows to none, in which case the
  // empty list says so in its own words and offers the way out.
  //
  // The postcode branch stays, because four digits are the one input that
  // cannot have been a shelter's name. There the list is empty and the reason
  // is worth having: the number was wrong, not the roster.
  const status =
    state.status === "error"
      ? state.message
      : resolved.source === "geolocation"
        ? origin && !onMap(origin)
          ? messages.locationOutsideMap
          : undefined
        : typed.status === "unknown" && looksLikePostcode(query)
          ? messages.postcodeNotFound
          : resolved.source === "typed"
            ? t("sortedByDistanceFrom", { label: resolved.label ?? "" })
            : undefined;
  const missing =
    unplaced > 0 ? sheltersMissingFromMap(unplaced, locale) : undefined;

  const detailBase = locale === "sl" ? "/zavetisca" : "/en/shelters";

  // The registry's shelters with nothing listed, as a heading and a list. Held
  // here rather than inside the JSX because the two are drawn by whichever of
  // two shapes the query leaves room for, and building them in an IIFE inside
  // the render tree put the largest block in this file behind an anonymous
  // expression fourteen levels deep.
  const offGroupHeading = t("noAnimalsListedHeadingCount", {
    count: visibleOffRows.length,
  });
  // Selection names belong in the trigger and footer; full registry totals
  // and animal counts answer different questions and stay out of this label.
  const selectedRows = selected.map((value) =>
    [...options, ...(offSite ?? [])].find((row) => row.value === value) ?? { value, label: value },
  );
  const label = shelterSelectionLabel(selectedRows, locale);

  // The way out of the dialog, carrying the number the picking adds up to.
  // Filtering is live, so this is not a promise about what the press will do.
  // Nothing happens on the way out that has not happened already; the button
  // names what is behind it, the same job `label` does for the trigger.
  //
  // Zero names the return to results. The persistent footer explains the
  // empty result and offers recovery separately from leaving the dialog.
  //
  // animalCount is safe in the accusative "Pokaži" puts its object in. žival
  // is an i-stem feminine whose accusative matches its nominative in all four
  // of ANIMAL_FORMS, singular through plural, so the same helper the status
  // line called serves here with no second set of forms.
  const doneLabel =
    resultCount > 0
      ? t("showAnimals", { count: animalCount(resultCount, locale) })
      : pickerText[locale].backToResults;

  return {
    options,
    counts,
    selected,
    onToggle,
    onToggleMany,
    resultCount,
    filterSummary,
    onClearFilters,
    municipalities,
    offSite,
    summaries,
    deepLink,
    dress,
    locale,
    messages,
    t,
    open,
    setOpen,
    query,
    setQuery,
    typed,
    choosePlace,
    clearOrigin,
    placeSuggestionRef,
    expandedShelter,
    setExpandedShelter,
    offGroupOpen,
    setOffGroupOpen,
    listRef,
    dropNote,
    spotlitShelterId,
    setSpotlitShelterId,
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    resetDocks,
    searchRef,
    placeMode,
    searching,
    statusId,
    offGroupId,
    state,
    toggleNearby,
    dismissError,
    turnOffNearby,
    resolved,
    origin,
    rowRefs,
    hoveredRowValue,
    setHoveredRowValue,
    hoveredMarkerValues,
    setHoveredMarkerValues,
    highlightedDensity,
    setHighlightedDensity,
    regionShelterNames,
    markersVisible,
    setMarkersVisible,
    setMapFacts,
    pins,
    handlePick,
    hoverScrollTo,
    toggleExpandedShelter,
    visibleRows,
    visibleOffRows,
    searchNews,
    hasSelected,
    hasMixed,
    hasEmpty,
    hasFilteredEmpty,
    nearbyOn,
    status,
    missing,
    detailBase,
    offGroupHeading,
    label,
    selectedRows,
    doneLabel,
  };
}

export type LocationPickerController = ReturnType<
  typeof useLocationPickerController
>;
