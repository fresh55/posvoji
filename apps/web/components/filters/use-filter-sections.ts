"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
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

const SECTION_KEYS = Object.keys(DEFAULT_OPEN) as FilterSectionKey[];

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

const NOTHING_ARRIVED: FilterSectionKey[] = [];

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
  return SECTION_KEYS.every((key) => a[key] === b[key]);
}

/** The set of answered sections, as a value that can be compared between
 *  renders. The map itself is built fresh by the caller every time, so the
 *  reveal below cannot ask whether it changed; this can. */
function answeredKey(active: Overrides | undefined): string {
  return SECTION_KEYS.filter((key) => active?.[key]).join(" ");
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

/** Shared folds for sidebar and sheet. A section that holds an answer reveals
    itself, without replacing the visitor's stored choices for other sections.

    Two moments, one rule. The sheet mounts long after hydration, so its
    answered sections are open the first time it is drawn. The sidebar mounts
    during hydration, where there is no answer to read yet: next.config sets
    output: "export", so the prerendered HTML is the unfiltered page and
    getServerSearchSnapshot has to return "" (lib/location-search.ts). A
    shared ?dlaka=kratka link therefore reaches this hook with nothing
    selected and gains its filters a beat later, which is why the reveal
    cannot be a mount-time default alone.

    Only a folded section is ever revealed, and only on the render its answer
    arrives. A section the visitor has folded themselves stays folded when
    its own count changes, and clearing the last value out of a revealed
    section leaves it open rather than folding away under the pointer that
    just cleared it. */
export function useFilterSections({
  active,
  layout = "sidebar",
}: {
  /** Which sections hold an answer right now. */
  active?: Overrides;
  layout?: FilterCardLayout;
} = {}): {
  isOpen: (key: FilterSectionKey) => boolean;
  toggleSection: (key: FilterSectionKey) => void;
  /** The sections an arriving address opened, for the one caller that has to
   *  put them where they can be seen. Empty for every later change, so a
   *  section gained mid-visit opens where it stands and moves nothing. */
  arrived: FilterSectionKey[];
} {
  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [revealed, setRevealed] = useState(active);
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

  // Adjusted during render rather than in an effect, so a section arrives open
  // in the same paint as the grid its filter narrowed; an effect would draw
  // the folded header first and grow it open a frame later, which is the page
  // moving on its own for no reason the visitor can see. React's own shape for
  // this: set state while rendering, and it re-runs this hook's component
  // before anything is committed.
  const answered = useMemo(() => answeredKey(active), [active]);
  const [seen, setSeen] = useState(answered);
  const [arrived, setArrived] = useState<FilterSectionKey[]>(NOTHING_ARRIVED);
  if (seen !== answered) {
    const before = new Set(seen.split(" "));
    const gained = SECTION_KEYS.filter(
      (key) => active?.[key] && !before.has(key) && !isOpen(key),
    );
    setSeen(answered);
    if (gained.length > 0) {
      setRevealed((previous) => ({
        ...previous,
        ...Object.fromEntries(gained.map((key) => [key, true])),
      }));
      // Only the first answers of a visit are an arrival: the panel had none,
      // and this is the address a link carried in. A later gain is the
      // visitor's own navigation inside a panel they are already reading, and
      // it moves nothing. Held in state rather than derived, so the reference
      // is stable and the caller's effect runs once.
      if (seen === "") setArrived(gained);
    }
  }

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

  return { isOpen, toggleSection, arrived };
}
