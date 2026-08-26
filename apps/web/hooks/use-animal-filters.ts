"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
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
function scrollToResults(): void {
  if (typeof window === "undefined") return;
  const results = document.querySelector(RESULTS_ANCHOR);
  if (!results) return;
  const top = results.getBoundingClientRect().top + window.scrollY;
  if (window.scrollY <= top) return;
  const far = window.scrollY - top > window.innerHeight * SMOOTH_SCROLL_LIMIT;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: far || still ? "auto" : "smooth" });
}

/** The query already on the address bar, without its leading "?", so it can
 *  be compared against a freshly serialized one. */
function currentQuery(): string {
  return getSearchSnapshot().replace(/^\?/, "");
}

/**
 * push, so five taps of a facet and one press of Back undo them one at a
 * time instead of leaving the site. Every setter this hook returns answers
 * a single, discrete press (a tab, a checkbox, a Select), never a stream of
 * events for one gesture, so there is no keystroke-per-push case to coalesce
 * here today. A future control that fires more than once per gesture (a
 * debounced search box, say) is the one responsible for only calling a
 * setter once it has settled; a time-based guard in here would just as
 * easily coalesce two genuine, seconds-apart answers as it would a real
 * burst, and it cannot be tested without a fake clock leaking between tests.
 *
 * replace, in the one case a push would break something a marker depends on:
 * the animal dialog pushes its own entry to open (use-animal-dialog.ts) and
 * its close button reads that entry's state to know a bare `history.back()`
 * will close it. A filter or sort change made while that entry is on top
 * therefore amends it rather than stacking a new one over it, so Back still
 * closes the dialog in one step and takes the change with it, and the close
 * button does not have to pop twice to actually leave.
 */
function writeMode(): "push" | "replace" {
  return window.history.state?.animal ? "replace" : "push";
}

/**
 * What every writer below ends on, once its own codec has produced a query.
 *
 * A press that changes nothing writes nothing, rather than a history entry
 * with no history in it. The active species tab pressed again is the one the
 * UI does not guard against itself. Past that guard the write and the scroll
 * travel together, because a query that changed is a result set that changed.
 */
function write(query: string): void {
  if (query === currentQuery()) return;
  commitSearch(query, writeMode());
  scrollToResults();
}

function writeFilters(filters: Filters): void {
  write(
    mergeOwnedParams(
      getSearchSnapshot(),
      FILTER_PARAM_NAMES,
      serializeFilters(pruneHiddenFilters(filters)),
    ),
  );
}

function writeSort(sort: AnimalSort): void {
  write(
    mergeOwnedParams(getSearchSnapshot(), [SORT_PARAM], serializeSort(sort)),
  );
}

export function useAnimalFilters() {
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const filters = useMemo(() => parseFilters(search), [search]);
  const sort = useMemo(() => parseSort(search), [search]);

  const setSpecies = useCallback(
    (species: SpeciesFilter) => {
      writeFilters({ ...filters, species });
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
