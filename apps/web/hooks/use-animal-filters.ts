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
  DEFAULT_ANIMAL_SORT,
  parseSort,
  serializeSort,
  SORT_PARAM,
  type AnimalSort,
} from "@/lib/sort";

// Everything the filter codec and the sort codec together own. One writer
// covers both, so a write to either can rebuild the query without disturbing
// a param neither codec knows about.
const OWNED_PARAMS = [...FILTER_PARAM_NAMES, SORT_PARAM];

// Filters and sort live in the query, the open animal lives in the path, so
// this write leaves the dialog where it is without having to carry anything
// over. Rebuilds only the params this hook owns (mergeOwnedParams), so a
// foreign param already in the query survives the write untouched.
function writeQuery(filters: Filters, sort: AnimalSort): void {
  const ownedQuery = [
    serializeFilters(pruneHiddenFilters(filters)),
    serializeSort(sort),
  ]
    .filter((part) => part.length > 0)
    .join("&");
  commitSearch(
    mergeOwnedParams(getSearchSnapshot(), OWNED_PARAMS, ownedQuery),
    "replace",
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
      writeQuery({ ...filters, species }, sort);
    },
    [filters, sort],
  );

  const toggle = useCallback(
    (group: MultiGroup, value: string) => {
      const selected = filters[group] as string[];
      const next = selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value];
      writeQuery({ ...filters, [group]: next }, sort);
    },
    [filters, sort],
  );

  const toggleMany = useCallback(
    (group: MultiGroup, values: string[]) => {
      if (values.length === 0) return;
      const selected = filters[group] as string[];
      const next = toggleValues(selected, values);
      writeQuery({ ...filters, [group]: next }, sort);
    },
    [filters, sort],
  );

  const toggleProperty = useCallback(
    (key: ToggleKey) => {
      const next = filters.toggles.includes(key)
        ? filters.toggles.filter((k) => k !== key)
        : [...filters.toggles, key];
      writeQuery({ ...filters, toggles: next }, sort);
    },
    [filters, sort],
  );

  const toggleManyProperties = useCallback(
    (values: ToggleKey[]) => {
      if (values.length === 0) return;
      writeQuery(
        {
          ...filters,
          toggles: toggleValues(filters.toggles, values) as ToggleKey[],
        },
        sort,
      );
    },
    [filters, sort],
  );

  const toggleGoodWith = useCallback(
    (key: GoodWithKey) => {
      const next = filters.goodWith.includes(key)
        ? filters.goodWith.filter((k) => k !== key)
        : [...filters.goodWith, key];
      writeQuery({ ...filters, goodWith: next }, sort);
    },
    [filters, sort],
  );

  const toggleManyGoodWith = useCallback(
    (values: GoodWithKey[]) => {
      if (values.length === 0) return;
      writeQuery(
        {
          ...filters,
          goodWith: toggleValues(filters.goodWith, values) as GoodWithKey[],
        },
        sort,
      );
    },
    [filters, sort],
  );

  const toggleHome = useCallback(
    (key: HomeKey) => {
      const next = filters.home.includes(key)
        ? filters.home.filter((k) => k !== key)
        : [...filters.home, key];
      writeQuery({ ...filters, home: next }, sort);
    },
    [filters, sort],
  );

  const toggleManyHome = useCallback(
    (values: HomeKey[]) => {
      if (values.length === 0) return;
      writeQuery(
        { ...filters, home: toggleValues(filters.home, values) as HomeKey[] },
        sort,
      );
    },
    [filters, sort],
  );

  const toggleCare = useCallback(
    (key: CareKey) => {
      const next = filters.care.includes(key)
        ? filters.care.filter((k) => k !== key)
        : [...filters.care, key];
      writeQuery({ ...filters, care: next }, sort);
    },
    [filters, sort],
  );

  const toggleManyCare = useCallback(
    (values: CareKey[]) => {
      if (values.length === 0) return;
      writeQuery(
        { ...filters, care: toggleValues(filters.care, values) as CareKey[] },
        sort,
      );
    },
    [filters, sort],
  );

  const setSort = useCallback(
    (next: AnimalSort) => writeQuery(filters, next),
    [filters],
  );

  const clearAll = useCallback(
    () => writeQuery(EMPTY_FILTERS, sort),
    [sort],
  );

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
    activeCount: activeFilterCount(filters),
  };
}
