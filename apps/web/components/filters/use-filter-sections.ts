"use client";

import { useCallback, useSyncExternalStore } from "react";

export type FilterSectionKey =
  | "sex"
  | "age"
  | "size"
  | "energy"
  | "health"
  | "goodWith"
  | "home"
  | "care";

const STORAGE_KEY = "posvoji:filter-sections";

// What a visitor reaches for first starts open; the rest folds away until
// asked for. A closed section still shows its selection in the header.
const DEFAULT_OPEN: Record<FilterSectionKey, boolean> = {
  sex: true,
  age: true,
  size: true,
  energy: false,
  health: false,
  goodWith: false,
  home: false,
  care: false,
};

type Overrides = Partial<Record<FilterSectionKey, boolean>>;

const NO_OVERRIDES: Overrides = {};

// One store per tab, so every list reading the sections sees the same folds.
const listeners = new Set<() => void>();
let cache: Overrides | null = null;

function readStored(): Overrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return NO_OVERRIDES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return NO_OVERRIDES;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => key in DEFAULT_OPEN && typeof value === "boolean",
      ),
    );
  } catch {
    return NO_OVERRIDES;
  }
}

function sameOverrides(a: Overrides, b: Overrides): boolean {
  const keys = Object.keys(DEFAULT_OPEN) as FilterSectionKey[];
  return keys.every((key) => a[key] === b[key]);
}

// A second tab folding a section writes to the same storage. Reading it back
// here keeps both tabs on one state instead of drifting apart.
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  const next = readStored();
  if (cache !== null && sameOverrides(cache, next)) return;
  cache = next;
  for (const listener of listeners) listener();
}

// Only the client subscribes, so the window listener never runs at import or
// during prerendering.
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

// The snapshot has to be reference-stable between writes, so reads go through
// a cache that only the first read or a write refills.
function getSnapshot(): Overrides {
  if (cache === null) cache = readStored();
  return cache;
}

// Prerendering has no storage, so the server always sees the defaults. React
// swaps the stored state in right after hydration.
function getServerSnapshot(): Overrides {
  return NO_OVERRIDES;
}

function write(next: Overrides) {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked or full; the toggle still holds for the visit.
  }
  for (const listener of listeners) listener();
}

/** Test-only. The store outlives a single render, so a test that folded a
    section would hand its state to the next one. Drops the cache and wakes
    every reader, which then reads storage again. */
export function resetFilterSectionsStore(): void {
  cache = null;
  for (const listener of listeners) listener();
}

/** Which sidebar sections are unfolded. Choices survive the visit through
    localStorage; only departures from the defaults are stored. */
export function useFilterSections(): {
  isOpen: (key: FilterSectionKey) => boolean;
  toggleSection: (key: FilterSectionKey) => void;
} {
  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const isOpen = useCallback(
    (key: FilterSectionKey) => overrides[key] ?? DEFAULT_OPEN[key],
    [overrides],
  );

  const toggleSection = useCallback((key: FilterSectionKey) => {
    const current = getSnapshot();
    write({ ...current, [key]: !(current[key] ?? DEFAULT_OPEN[key]) });
  }, []);

  return { isOpen, toggleSection };
}
