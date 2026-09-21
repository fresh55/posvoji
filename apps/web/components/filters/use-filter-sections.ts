"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { FILTER_PARAM_NAMES } from "@/lib/filters";
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

// Sex and age start open, on an address that asks nothing. On a short desktop,
// age starts folded so the remaining headings fit. Saved choices always
// override this height default, and an answer arriving in the address
// rearranges both ends of it: the section holding it opens, and these two give
// up their room if nobody has answered them (useFilterSections).
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

/** Whether the page was opened on an address that already carried a filter.
 *
 *  It separates the two ways a panel's first answer can appear, which are
 *  otherwise the same event: a link someone shared, and the visitor's own
 *  first press. Read from the address rather than counted, because at the
 *  moment it matters the press has already written to the address too.
 *
 *  Prerendering has no location, and the answer is only ever read on a later
 *  render, so the false it returns there costs nothing. */
function landedOnFilters(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return FILTER_PARAM_NAMES.some((name) => params.has(name));
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
  return SECTION_KEYS.every((key) => a[key] === b[key]);
}

/** The set of answered sections, as a value that can be compared between
 *  renders. The map itself is built fresh by the caller every time, so the
 *  reveal below cannot ask whether it changed; this can. */
function answeredKey(active: Overrides | undefined): string {
  return SECTION_KEYS.filter((key) => active?.[key]).join(" ");
}

/** The answered sections alone. What a caller hands in says false for every
 *  other one, and a false here is a section held shut rather than a section
 *  left to its default. */
function answeredOnly(active: Overrides | undefined): Overrides {
  return Object.fromEntries(
    SECTION_KEYS.filter((key) => active?.[key]).map((key) => [key, true]),
  );
}

function openByDefault(key: FilterSectionKey, layout: FilterCardLayout): boolean {
  return (
    DEFAULT_OPEN[key] && !(layout === "sidebar" && shortDesktop() && key === "age")
  );
}

/** The sections that give up their room to an arriving answer: open by
 *  default, holding no answer of their own, and never asked about by this
 *  visitor. A stored fold is a decision, either way, and is left alone. */
function yieldingTo(
  active: Overrides | undefined,
  overrides: Overrides,
  layout: FilterCardLayout,
): Overrides {
  if (layout !== "sidebar") return NO_OVERRIDES;
  return Object.fromEntries(
    SECTION_KEYS.filter(
      (key) =>
        !active?.[key] &&
        openByDefault(key, layout) &&
        overrides[key] === undefined,
    ).map((key) => [key, false]),
  );
}

/** What the panel holds open or shut before the visitor has touched it.
 *
 *  Answered sections, and on an address that arrived carrying them, the
 *  unanswered defaults standing above. The sidebar reaches this with nothing
 *  answered, because hydration has not read the address yet, so in the built
 *  site the second half is done by the arrival below and this is the sheet's
 *  path and the tests'. One rule, written once, for both. */
function initialHold(
  active: Overrides | undefined,
  layout: FilterCardLayout,
): Overrides {
  const answered = answeredOnly(active);
  if (Object.keys(answered).length === 0 || !landedOnFilters()) return answered;
  return { ...answered, ...yieldingTo(active, getSnapshot(), layout) };
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

/** Shared folds for sidebar and sheet, and what an arriving address does to
    them.

    A section holding an answer opens itself. Two moments, one rule: the sheet
    mounts long after hydration, so its answered sections are open the first
    time it is drawn, while the sidebar mounts during hydration, where there is
    no answer to read yet. next.config sets output: "export", so the prerendered
    HTML is the unfiltered page and getServerSearchSnapshot has to return ""
    (lib/location-search.ts); a shared ?dlaka=kratka link reaches this hook with
    nothing selected and gains its filters a beat later, which is why the reveal
    cannot be a mount-time default alone.

    Only a folded section is ever revealed, and only on the render its answer
    arrives. A section the visitor has folded themselves stays folded when its
    own count changes, and clearing the last value out of a revealed section
    leaves it open rather than folding away under the pointer that just cleared
    it.

    The other half is the room those answers need. Sex and age are open by
    default because they are what a visitor reaches for first, which is an
    answer about an address that asks nothing; on a filtered link they are two
    unanswered questions standing between the panel's top and the sections this
    visitor came with. Measured at 1440x900 on /?cakanje=nad-1-leto: 294px of
    them, and the one answered heading below at 1200, where a panel whose whole
    box ends at 1041 cannot show it. Folded, the answered heading comes up to
    the window's own edge without scrolling anything at all.

    So they yield, and only where that is not a decision being taken from
    anyone: on an address that arrived carrying filters, in the sidebar, once
    per visit, and never over a fold the visitor has set themselves. A first
    press does not qualify, which is the whole reason the address is asked
    rather than the count. */
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
} {
  const overrides = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  // What this visit holds open or shut over the stored folds, for as long as
  // the panel is mounted. Answered sections start in it; an arrival adds to it
  // at both ends; pressing a heading takes that section out of it and hands the
  // question back to storage.
  const [held, setHeld] = useState(() => initialHold(active, layout));
  const short = useSyncExternalStore(subscribeHeight, shortDesktop, serverHeight);
  const [landedFiltered] = useState(landedOnFilters);
  // `short` is read through the store above rather than off matchMedia here,
  // so a window resized across the boundary re-renders the panel. The module
  // helper the arrival shares asks matchMedia directly, because it runs before
  // there is a render to subscribe from.
  const defaultOpen = useCallback(
    (key: FilterSectionKey) =>
      DEFAULT_OPEN[key] && !(layout === "sidebar" && short && key === "age"),
    [layout, short],
  );

  const isOpen = useCallback(
    (key: FilterSectionKey) => held[key] ?? (overrides[key] ?? defaultOpen(key)),
    [held, overrides, defaultOpen],
  );

  // Adjusted during render rather than in an effect, so the panel arrives in
  // the same paint as the grid its filter narrowed; an effect would draw the
  // old arrangement first and rearrange it a frame later, which is the page
  // moving on its own for no reason the visitor can see. React's own shape for
  // this: set state while rendering, and it re-runs this hook's component
  // before anything is committed.
  const answered = useMemo(() => answeredKey(active), [active]);
  const [seen, setSeen] = useState(answered);
  const [answeredOnce, setAnsweredOnce] = useState(false);
  if (seen !== answered) {
    const before = new Set(seen.split(" "));
    const gained = SECTION_KEYS.filter(
      (key) => active?.[key] && !before.has(key) && !isOpen(key),
    );
    // The arrival is the first answers of a visit, on an address that came
    // with them. Anything later is the visitor's own navigation inside a panel
    // they are already reading, and it moves nothing but the section gained.
    const arriving = !answeredOnce && seen === "" && landedFiltered;
    const yielding = arriving ? yieldingTo(active, overrides, layout) : NO_OVERRIDES;
    setSeen(answered);
    setAnsweredOnce(true);
    if (gained.length > 0 || Object.keys(yielding).length > 0) {
      setHeld((previous) => ({
        ...previous,
        ...Object.fromEntries(gained.map((key) => [key, true])),
        ...yielding,
      }));
    }
  }

  const toggleSection = useCallback(
    (key: FilterSectionKey) => {
      const current = getSnapshot();
      const open = held[key] ?? (current[key] ?? defaultOpen(key));
      // Out of this visit's hold and into storage, where a choice the visitor
      // made themselves belongs. Left in, a revealed section could not be
      // folded and a section that yielded could not be opened.
      if (key in held) {
        setHeld((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }
      write({ ...current, [key]: !open });
    },
    [held, defaultOpen],
  );

  return { isOpen, toggleSection };
}
