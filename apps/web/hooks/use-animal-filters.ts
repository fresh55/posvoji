"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { standsOnDialogEntry } from "@/hooks/use-animal-dialog";
import { standsOnLayerEntry } from "@/hooks/use-picker-history";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  FILTER_PARAM_NAMES,
  parseFilters,
  pruneHiddenFilters,
  serializeFilters,
  toggleValues,
  type CareKey,
  type Filters,
  type GoodWithKey,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "@/lib/filters";
import {
  commitSearch,
  getSearchSnapshot,
  getServerSearchSnapshot,
  mergeOwnedParams,
  subscribeToLocation,
} from "@/lib/location-search";
import {
  parseSort,
  serializeSort,
  SORT_PARAM,
  type AnimalSort,
} from "@/lib/sort";

// Filters and sort are written by two independent codecs, each owning its
// own slice of the query (mergeOwnedParams rebuilds only the params passed
// in, so a foreign param already in the query, or the other codec's own
// param, survives untouched). Filters live in the query, the open animal
// lives in the path, so a write leaves the dialog where it is without having
// to carry anything over.
/** The results block, which begins with the toolbar and holds every card. */
const RESULTS_ANCHOR = 'section[aria-labelledby="rezultati"]';

/**
 * Answering a filter with the same scroll offset leaves the visitor deep
 * inside a list they have never seen. Measured on a 390px phone: scrolled to
 * 30,000px of the 503-animal grid, tapping "Psi" left them at 5,263px of a
 * 17,071px list of dogs, a third of the way down their new results with no
 * sense of what was above. Every faceted search answers this the same way, by
 * returning to the top of the results, and that is where the toolbar and the
 * count are too. Somebody already at or above the results is left alone.
 */
let pendingScroll: MutationObserver | undefined;

export function scrollToResults(): void {
  if (typeof window === "undefined") return;
  if (
    document.body.hasAttribute("data-scroll-locked") ||
    getComputedStyle(document.body).overflow === "hidden"
  ) {
    if (!pendingScroll) {
      pendingScroll = new MutationObserver(() => {
        if (
          document.body.hasAttribute("data-scroll-locked") ||
          getComputedStyle(document.body).overflow === "hidden"
        )
          return;
        pendingScroll?.disconnect();
        pendingScroll = undefined;
        requestAnimationFrame(scrollToResults);
      });
      pendingScroll.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-scroll-locked", "style", "class"],
      });
    }
    return;
  }
  const results = document.querySelector(RESULTS_ANCHOR);
  if (!results) return;
  const top = results.getBoundingClientRect().top + window.scrollY;
  if (window.scrollY <= top) return;
  // Motion measures the incoming cards and restores the scroll it captured.
  // Finish this move immediately so that measurement captures the new position
  // instead of cancelling an in-flight smooth scroll.
  window.scrollTo({ top, behavior: "auto" });
}

/**
 * Writes a filter state into the query.
 *
 * Replace by default, because a filter is an adjustment to the list already on
 * screen and one entry per checkbox would turn the back button into a log of
 * every box ticked. The species strip is the exception and asks for a push
 * (setSpecies below).
 *
 * A push carries the state the current entry holds rather than the null a bare
 * pushState writes. The dialog's back-to-close marker lives in history.state,
 * and a replace amends the entry it is already on, so neither mode may drop
 * it (filter-flow.test.tsx checks both).
 */
function writeFilters(
  filters: Filters,
  mode: "push" | "replace" = "replace",
): void {
  commitSearch(
    mergeOwnedParams(
      getSearchSnapshot(),
      FILTER_PARAM_NAMES,
      serializeFilters(pruneHiddenFilters(filters)),
    ),
    mode,
    mode === "push" ? window.history.state : undefined,
  );
  scrollToResults();
}

function writeSort(sort: AnimalSort): void {
  commitSearch(
    mergeOwnedParams(getSearchSnapshot(), [SORT_PARAM], serializeSort(sort)),
    "replace",
  );
  scrollToResults();
}

export function useAnimalFilters() {
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const filters = useMemo(() => parseFilters(search), [search]);
  const sort = useMemo(() => parseSort(search), [search]);

  // The one filter control that reads as navigation. It sits at the top of the
  // page, it changes what the page is about, and on a phone it is very often
  // the last thing pressed before the back gesture. On replace that gesture
  // pointed at whatever page came before the results, so arriving from
  // /zavetisca, pressing "Mačke" and going back left the list entirely instead
  // of returning to Vse. A push gives the species its own entry, and back then
  // undoes the press the way it undoes an opened animal.
  //
  // Only when the species actually changes. The strip still reports a press on
  // the tab that is already pressed (species-tabs.tsx), and an entry for a
  // write that changes no part of the query is a back press that does nothing.
  //
  // And never on top of an open animal. Back closes the dialog in one press,
  // and an entry stacked under it would spend that press undoing a filter
  // change behind a card nobody can see past. The strip is behind the dialog
  // at every width, so the entry a species change wants there is the one it is
  // already standing on.
  //
  // Nor on top of an open sheet, for the same reason. The filter sheet
  // repeats the chosen species as a pill that sets it back to all
  // (filter-sheet.tsx), and the sheet stands on an entry of its own that its
  // back gesture pops; a push from inside it would carry the sheet's marker
  // onto a second entry and back would undo the species before closing.
  const setSpecies = useCallback(
    (species: SpeciesFilter) => {
      const stacks =
        species !== filters.species &&
        !standsOnDialogEntry() &&
        !standsOnLayerEntry();
      writeFilters({ ...filters, species }, stacks ? "push" : "replace");
    },
    [filters],
  );

  const toggle = useCallback(
    (group: MultiGroup, value: string) => {
      const selected = filters[group] as string[];
      const next = selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value];
      writeFilters({ ...filters, [group]: next });
    },
    [filters],
  );

  const toggleMany = useCallback(
    (group: MultiGroup, values: string[]) => {
      if (values.length === 0) return;
      const selected = filters[group] as string[];
      const next = toggleValues(selected, values);
      writeFilters({ ...filters, [group]: next });
    },
    [filters],
  );

  const toggleProperty = useCallback(
    (key: ToggleKey) => {
      const next = filters.toggles.includes(key)
        ? filters.toggles.filter((k) => k !== key)
        : [...filters.toggles, key];
      writeFilters({ ...filters, toggles: next });
    },
    [filters],
  );

  const toggleManyProperties = useCallback(
    (values: ToggleKey[]) => {
      if (values.length === 0) return;
      writeFilters({
        ...filters,
        toggles: toggleValues(filters.toggles, values) as ToggleKey[],
      });
    },
    [filters],
  );

  const toggleGoodWith = useCallback(
    (key: GoodWithKey) => {
      const next = filters.goodWith.includes(key)
        ? filters.goodWith.filter((k) => k !== key)
        : [...filters.goodWith, key];
      writeFilters({ ...filters, goodWith: next });
    },
    [filters],
  );

  const toggleManyGoodWith = useCallback(
    (values: GoodWithKey[]) => {
      if (values.length === 0) return;
      writeFilters({
        ...filters,
        goodWith: toggleValues(filters.goodWith, values) as GoodWithKey[],
      });
    },
    [filters],
  );

  const toggleCare = useCallback(
    (key: CareKey) => {
      const next = filters.care.includes(key)
        ? filters.care.filter((k) => k !== key)
        : [...filters.care, key];
      writeFilters({ ...filters, care: next });
    },
    [filters],
  );

  const toggleManyCare = useCallback(
    (values: CareKey[]) => {
      if (values.length === 0) return;
      writeFilters({
        ...filters,
        care: toggleValues(filters.care, values) as CareKey[],
      });
    },
    [filters],
  );

  const setSort = useCallback((next: AnimalSort) => writeSort(next), []);

  // Everything but the species. The species is the scope the list is read
  // in, chosen on the strip outside the sheet and outside the sidebar, and it
  // is not counted by the badge or the chips (activeFilterCount): a clear
  // that reset it was a button inside the sheet undoing a choice made
  // outside it, and on a phone it did so behind the sheet where the strip
  // cannot be seen. Pressing Mačke, narrowing, and clearing lands on every
  // cat again, not on every animal. The way back to all species is the
  // strip, or the sheet's own species pill.
  const clearAll = useCallback(
    () => writeFilters({ ...EMPTY_FILTERS, species: filters.species }),
    [filters.species],
  );

  // Clearing is the one filter action that cannot be undone by repeating the
  // gesture that caused it, so it is the one that needs a way back. The
  // snapshot is held by the caller, not here: this hook has no state of its
  // own to keep it in, and the query is the only place the answer lives.
  const restore = useCallback((snapshot: Filters) => {
    writeFilters(snapshot);
  }, []);

  return {
    filters,
    sort,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    toggleCare,
    toggleManyCare,
    setSort,
    clearAll,
    restore,
    activeCount: activeFilterCount(filters),
  };
}
