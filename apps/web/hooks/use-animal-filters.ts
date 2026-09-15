"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { standsOnDialogEntry } from "@/hooks/use-animal-dialog";
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
  type HomeKey,
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

// Past this far, a smooth scroll is a long ride through content nobody asked
// to see. The jump is the point, so beyond two screens it is instant.
const SMOOTH_SCROLL_LIMIT = 2;

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
  const far = window.scrollY - top > window.innerHeight * SMOOTH_SCROLL_LIMIT;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: far || still ? "auto" : "smooth" });
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
  const setSpecies = useCallback(
    (species: SpeciesFilter) => {
      const stacks = species !== filters.species && !standsOnDialogEntry();
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

  const toggleHome = useCallback(
    (key: HomeKey) => {
      const next = filters.home.includes(key)
        ? filters.home.filter((k) => k !== key)
        : [...filters.home, key];
      writeFilters({ ...filters, home: next });
    },
    [filters],
  );

  const toggleManyHome = useCallback(
    (values: HomeKey[]) => {
      if (values.length === 0) return;
      writeFilters({
        ...filters,
        home: toggleValues(filters.home, values) as HomeKey[],
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

  const clearAll = useCallback(() => writeFilters(EMPTY_FILTERS), []);

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
    toggleHome,
    toggleManyHome,
    toggleCare,
    toggleManyCare,
    setSort,
    clearAll,
    restore,
    activeCount: activeFilterCount(filters),
  };
}
