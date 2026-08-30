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
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import { useNearby } from "@/hooks/use-nearby";
import { usePublishNearbyOrigin } from "@/hooks/use-nearby-origin";
import { useScrollEdgeFades } from "@/hooks/use-scroll-edge-fades";
import {
  FOUND_ANIMAL_PARAM,
  OPEN_MUNICIPALITY_LOOKUP_EVENT,
} from "@/lib/found-animal";
import { isDrop } from "@/lib/filters";
import { onMap, project } from "@/lib/geo";
import {
  animalCount,
  shelterCount,
  shelterScopeLabel,
  sheltersDropped,
  sheltersMissingFromMap,
} from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";
import { regionAt } from "@/lib/map-regions";
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
  MUNICIPALITY_AT,
  pickerText,
  toPins,
  type LocatedRow,
} from "./model";
import { useLocationPickerMotion } from "./motion";

export function useLocationPickerController({
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
  dress = "toolbar",
  open: controlledOpen,
  onOpenChange,
}: LocationPickerProps) {
  const { locale, messages, t } = useI18n();
  const [selfOpen, setSelfOpen] = useState(false);
  const open = controlledOpen ?? selfOpen;
  // Where an open goes, kept in a ref so the setter below can be stable. The
  // deep-link and spotlight effects call it and hold no dependency on it: a
  // setter whose identity moved with the open state would re-subscribe those
  // effects on every close, and the ?najdena branch would reopen the dialog
  // the visitor had just dismissed. Synced in an effect declared ahead of
  // them, so it is fresh before anything else in here runs.
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
  const setOpen = useCallback((next: boolean) => {
    if (!openTarget.current.controlled) setSelfOpen(next);
    openTarget.current.onOpenChange?.(next);
  }, []);
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
  const listFades = useScrollEdgeFades<HTMLDivElement>();
  // The same node, kept, because two effects below have to scroll this list
  // and only this list; see bringIntoList for why they may not ask the element
  // itself. The hook's callback ref is wrapped rather than replaced, so the
  // fades and this handle attach in the same commit and come away in the same
  // cleanup.
  const listNode = useRef<HTMLDivElement | null>(null);
  const listRef = useCallback(
    (node: HTMLDivElement | null) => {
      listNode.current = node;
      const cleanup = listFades(node);
      return () => {
        listNode.current = null;
        cleanup?.();
      };
    },
    [listFades],
  );
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
  const {
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    landSheet,
    landSpotlight,
    revealSelection,
    resetDocks,
  } = useLocationPickerMotion(open);


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
      // The sheet, whatever the screen. This entry point was pressed by
      // someone holding a found animal, and every part of the answer, the
      // field to type an občina into and the shelter it returns, lives in the
      // sheet; a landscape phone would otherwise land on a map with the
      // question folded away under it. Marked as landed, so the effect that
      // decides where an ordinary open puts the sheet stands aside for the one
      // open that already knows.
      landSheet();
    };
    if (new URLSearchParams(window.location.search).has(FOUND_ANIMAL_PARAM)) {
      openLookup();
    }
    window.addEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
    return () =>
      window.removeEventListener(OPEN_MUNICIPALITY_LOOKUP_EVENT, openLookup);
  }, [canDeepLink, deepLink, landSheet, setOpen]);

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
      // other is a no-op there. Landed here for the same reason the found-
      // animal entry lands itself: this open arrives with a row to show, and a
      // short screen folding the list away would fold the answer away with it.
      landSpotlight();
    };
    window.addEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
    return () => window.removeEventListener(SHELTER_SPOTLIGHT_EVENT, spotlight);
  }, [canSpotlight, deepLink, landSpotlight, setOpen]);
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
  const { typed, resolved } = useMemo(() => {
    const read = readTypedLocation(query);
    return { typed: read, resolved: resolveOrigin(geolocated, read) };
  }, [geolocated, query]);
  const origin = resolved.at;
  // Which of the two questions the one box is currently asking. The text
  // decides, not the visitor: a postal lookup either recognises it or it does
  // not, and that single fact is the whole of the mode switch.
  //
  // "Mari" resolves to nothing yet, so it narrows the list to the Maribor
  // rows; the moment the last letter lands, "Maribor" is a place, the list
  // opens back out and sorts to it instead. That handoff is the point of
  // merging the two fields: one continuous sentence, rather than a decision
  // about which box to type it into taken before there is anything to decide
  // it on.
  //
  // Read off `typed` and not off `resolved`, because resolveOrigin lets a live
  // geolocation fix outrank a typed place and this is not a question about
  // which point the list sorts from. A recognised town is a recognised town
  // whatever else is on; the field's own onChange turns geolocation off in
  // that case anyway, exactly as the place box always did.
  const placeMode = typed.status === "matched";
  // The other half of it: the box holds text that is not a place, so it is a
  // name to narrow the list by. Both are false for an empty box, which is the
  // resting state where the field asks nothing at all.
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
  const [{ hasSelected, hasMixed, hasEmpty }, setMapFacts] =
    useState<MapFacts>({
      hasSelected: false,
      hasMixed: false,
      hasEmpty: false,
    });

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
      //
      // Except on a screen with no height to spare, where the sheet is the
      // map. There the strip the sheet folds to already carries the whole of
      // this news, the running "2 od 17 zavetišč" and the count badge beside
      // it (see the peek bar), so raising the sheet would cover the country
      // the visitor is still picking from in order to repeat a sentence they
      // can already read. Every tap after the first would have cost a fold.
      revealSelection();
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
    [locale, onToggleMany, revealSelection, selected],
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
  //
  // The list is scrolled by hand and the cell is never asked to bring itself
  // in: see bringIntoList, and the column below whose own scroll this used to
  // drag the dialog's title and tabs off the top of.
  useEffect(() => {
    if (!expandedShelter) return;
    const cell = rowRefs.current
      .get(expandedShelter)
      ?.closest('[data-slot="collapsible"]');
    if (!cell) return;
    const bring = () => bringIntoList(listNode.current, cell);
    bring();
    cell.addEventListener("animationend", bring, { once: true });
    return () => cell.removeEventListener("animationend", bring);
  }, [expandedShelter]);

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
  // Only while the box is being read as a name. A recognised place has already
  // been answered by sorting the whole list to it, and filtering it down to the
  // rows whose own text happens to contain the town's name would take the
  // nearest shelters away from the visitor who just said where they are.
  const matchesQuery = (row: ShelterRow) =>
    fold(`${row.label} ${row.city ?? ""}`).includes(fold(query));
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
  // "Vsa zavetišča" alone, with no count: the roster this dialog lists is the
  // whole UVHVVR registry, live shelters and the ones with nothing listed
  // alike, which is not the number the hero states in the same breath (the
  // live-shelter count). A number here used to read as a second, disagreeing
  // answer to a question the hero had just answered ("11 zavetišč" next to
  // "Vseh 17 zavetišč"); see allShelters in lib/labels.ts.
  const label = shelterScopeLabel(selected.length, total, locale);

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

  return {
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
    dress,
    locale,
    messages,
    t,
    open,
    setOpen,
    query,
    setQuery,
    muniMode,
    setMuniMode,
    muniShelterIds,
    setMuniShelterIds,
    muniName,
    setMuniName,
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
    selectableIds,
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
    nearbyOn,
    status,
    missing,
    detailBase,
    offGroupHeading,
    label,
    doneLabel,
  };
}

export type LocationPickerController = ReturnType<
  typeof useLocationPickerController
>;
