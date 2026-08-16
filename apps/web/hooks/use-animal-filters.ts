"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  parseFilters,
  pruneHiddenFilters,
  serializeFilters,
  type Filters,
  type MultiGroup,
  type SpeciesFilter,
  type ToggleKey,
} from "@/lib/filters";

// The URL is the single source of truth, so filtered views are shareable and
// survive reloads. No useSearchParams: with static export the prerendered HTML
// has no params, and useSyncExternalStore swaps in the client snapshot after
// hydration without a mismatch. replaceState keeps history clean; since it
// fires no event, writes notify subscribers by hand.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function getSnapshot(): string {
  return window.location.search;
}

function getServerSnapshot(): string {
  return "";
}

function writeFilters(next: Filters): void {
  const query = serializeFilters(pruneHiddenFilters(next));
  history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  for (const listener of listeners) listener();
}

export function useAnimalFilters() {
  const search = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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

  // Picking a region on the map turns on every shelter in it. Looping over
  // toggle() could not do that: each call reads the same filters snapshot and
  // writes the whole group back, so every write but the last was discarded and
  // a three-shelter region selected one shelter.
  const toggleMany = useCallback(
    (group: MultiGroup, values: string[]) => {
      if (values.length === 0) return;
      const selected = filters[group] as string[];
      const everyOne = values.every((value) => selected.includes(value));
      const next = everyOne
        ? selected.filter((value) => !values.includes(value))
        : [...new Set([...selected, ...values])];
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

  const clearAll = useCallback(() => writeFilters(EMPTY_FILTERS), []);

  return {
    filters,
    setSpecies,
    toggle,
    toggleMany,
    toggleProperty,
    clearAll,
    activeCount: activeFilterCount(filters),
  };
}
