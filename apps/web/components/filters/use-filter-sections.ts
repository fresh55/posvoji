"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { FilterCardLayout } from "./filter-card";

export type FilterSectionKey =
  | "sex"
  | "age"
  | "size"
  | "energy"
  | "appearance"
  | "waiting"
  | "health"
  | "goodWith"
  | "home"
  | "care";

const STORAGE_KEY = "posvoji:filter-sections";

// Sex and age start open. On a short desktop, age starts folded so the
// remaining headings fit. Saved choices always override this height default.
// The sheet can reveal active filters for each opening independently.
const DEFAULT_OPEN: Record<FilterSectionKey, boolean> = {
  sex: true,
  age: true,
  size: false,
  energy: false,
  appearance: false,
  waiting: false,
  health: false,
  goodWith: false,
  home: false,
  care: false,
};

const SHORT_DESKTOP = "(min-width: 64rem) and (max-height: 49.99rem)";

function subscribeHeight(listener: () => void): () => void {
  const query = window.matchMedia?.(SHORT_DESKTOP);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function shortDesktop(): boolean {
  return window.matchMedia?.(SHORT_DESKTOP).matches ?? false;
}

function serverHeight(): boolean {
  return false;
}

type Overrides = Partial<Record<FilterSectionKey, boolean>>;

const NO_OVERRIDES: Overrides = {};

// Share saved folds between the sidebar and sheet within this tab.
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

// Sync saved folds from other tabs.
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

/** Test-only: discard cached folds and notify subscribers. */
export function resetFilterSectionsStore(): void {
  cache = null;
  for (const listener of listeners) listener();
}

/** Shared folds for sidebar and sheet. A sheet can reveal its active sections
    on mount without replacing the visitor's stored choices for other sections. */
export function useFilterSections({
  initiallyOpen,
  layout = "sidebar",
}: {
  initiallyOpen?: Overrides;
  layout?: FilterCardLayout;
} = {}): {
  isOpen: (key: FilterSectionKey) => boolean;
  toggleSection: (key: FilterSectionKey) => void;
} {
  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [revealed, setRevealed] = useState(initiallyOpen);
  const short = useSyncExternalStore(subscribeHeight, shortDesktop, serverHeight);
  const defaultOpen = useCallback(
    (key: FilterSectionKey) =>
      DEFAULT_OPEN[key] && !(layout === "sidebar" && short && key === "age"),
    [layout, short],
  );

  const isOpen = useCallback(
    (key: FilterSectionKey) =>
      revealed?.[key] || (overrides[key] ?? defaultOpen(key)),
    [overrides, revealed, defaultOpen],
  );

  const toggleSection = useCallback(
    (key: FilterSectionKey) => {
      const current = getSnapshot();
      const open = revealed?.[key] || (current[key] ?? defaultOpen(key));
      if (revealed?.[key]) {
        setRevealed((previous) => ({ ...previous, [key]: false }));
      }
      write({ ...current, [key]: !open });
    },
    [revealed, defaultOpen],
  );

  return { isOpen, toggleSection };
}
