"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  activeFilterCount,
  EMPTY_FILTERS,
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
  subscribeToLocation,
} from "@/lib/location-search";

// Filters live in the query, the open animal lives in the path, so a filter
// write leaves the dialog where it is without having to carry anything over.
function writeFilters(next: Filters): void {
  commitSearch(serializeFilters(pruneHiddenFilters(next)), "replace");
}

export function useAnimalFilters() {
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const filters = useMemo(() => parseFilters(search), [search]);

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

  const clearAll = useCallback(() => writeFilters(EMPTY_FILTERS), []);

  return {
    filters,
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
    clearAll,
    activeCount: activeFilterCount(filters),
  };
}
