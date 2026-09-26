"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  parseFilters,
  type FilterFacet,
  type Filters,
  type SpeciesFilter,
} from "@/lib/filters";
import { getSearchSnapshot } from "@/lib/location-search";
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
  | "care";

const STORAGE_KEY = "posvoji:filter-sections";

// What starts open on an address that asks nothing: Starost, and Velikost on
// the Psi tab, a species name meaning open on that tab alone. On Vse a size
// pick leaves out every cat (groupAsks in lib/filters/engine.ts), so there it
// folds, and Mačke draws no Velikost at all. Spol opened beside Starost until
// the panel was put in the order adopters decide in, where it comes sixth
// (FILTER_FACETS in lib/filters/contracts.ts); it folds with the rest.
//
// On a short desktop everything starts folded (openByDefault). Saved choices
// always override these defaults, and an answer arriving in the address
// rearranges both ends of them: the section holding it opens, and the open
// ones give up their room if nobody has answered them (useFilterSections).
const DEFAULT_OPEN: Record<FilterSectionKey, boolean | SpeciesFilter> = {
  sex: false,
  age: true,
  size: "dog",
  energy: false,
  appearance: false,
  waiting: false,
  health: false,
  goodWith: false,
  care: false,
};

const SECTION_KEYS = Object.keys(DEFAULT_OPEN) as FilterSectionKey[];

/**
 * Which section of the panel holds each facet's answers.
 *
 * One table, because two of these are not the identity they look like: Videz
 * holds both coat facets, and the health toggles answer under their own
 * section name. Read to know which sections are answered.
 *
 * Shelter answers no section. Kje is the panel's first block and it does not
 * fold, so an address carrying only shelters has not answered anything the
 * panel can make room for.
 */
export const SECTION_OF_FACET: Record<FilterFacet, FilterSectionKey | null> = {
  sex: "sex",
  age: "age",
  size: "size",
  energy: "energy",
  coatColor: "appearance",
  coatLength: "appearance",
  waiting: "waiting",
  toggles: "health",
  goodWith: "goodWith",
  care: "care",
  shelter: null,
};

/** Which sections a filter state has answers in. */
export function answeredSections(filters: Filters): Overrides {
  const answered: Overrides = {};
  for (const [facet, section] of Object.entries(SECTION_OF_FACET)) {
    if (section && filters[facet as FilterFacet].length > 0) {
      answered[section] = true;
    }
  }
  return answered;
}

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

/** Whether the page was opened on an address that already answered a section.
 *
 *  It separates the two ways a panel's first answer can appear, which are
 *  otherwise the same event: a link someone shared, and the visitor's own
 *  first press. Read from the address rather than counted, because by the time
 *  it matters the press has written to the address too.
 *
 *  A section and not any filter. The species tab and Kje are filters and carry
 *  params of their own, but neither answers a section here, and /?vrsta=pes
 *  and the shelter links /zavetisca hands out are two of the site's commonest
 *  entry addresses: counting them, a visitor arriving on one and then pressing
 *  their own first filter would have had the panel rearranged under them,
 *  which is the one thing this asks the address in order to prevent.
 *
 *  Prerendering has no location, and the answer is only read on a later
 *  render, so the false getServerSearchSnapshot's empty string produces there
 *  costs nothing. */
function landedOnAnswers(): boolean {
  if (typeof window === "undefined") return false;
  const answered = answeredSections(parseFilters(getSearchSnapshot()));
  return Object.keys(answered).length > 0;
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

/** Whether a section starts open, before any answer or stored fold. A pure
 *  function of these four, so a species tab or a window crossing the short
 *  desktop's height moves the defaults and nothing else. */
function openByDefault(
  key: FilterSectionKey,
  layout: FilterCardLayout,
  short: boolean,
  species: SpeciesFilter,
): boolean {
  // Every section folded, so the rail on a short desktop is the whole list of
  // headings: at 1280x720 Kje and the eight headings come to 629px of the
  // rail's 696, where Spol left open among them used to overflow it.
  if (layout === "sidebar" && short) return false;
  const open = DEFAULT_OPEN[key];
  return open === true || open === species;
}

/**
 * What the panel holds open and shut on an address that arrived answering it.
 *
 * One rule: a section is open if it holds an answer, and shut if it does not,
 * over every section the visitor has not stored a fold for. The sections open
 * by default are not special here; they are only the ones the rule has
 * anything to say about, because they would otherwise be open with nothing in
 * them.
 *
 * They are open by default because they are what a visitor reaches for first,
 * which is an answer about an address that asks nothing. On a filtered link
 * they are unanswered questions standing between the top of the panel and the
 * sections that visitor arrived with. Measured at 1440x900 on
 * /?cakanje=nad-1-leto, Starost's 207px put the answered heading at 1053,
 * under the window's edge at 900; on Psi Velikost's 185px more put it at 1246,
 * past the end of the panel's own box at 1107. Folded, the heading comes up
 * to 838 on either tab, on screen with nothing scrolled at all.
 *
 * A stored fold is a decision, either way, and is left alone.
 */
function arrivalHold(
  active: Overrides | undefined,
  overrides: Overrides,
  layout: FilterCardLayout,
): Overrides {
  if (layout !== "sidebar") return NO_OVERRIDES;
  return Object.fromEntries(
    SECTION_KEYS.filter((key) => overrides[key] === undefined).map((key) => [
      key,
      Boolean(active?.[key]),
    ]),
  );
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

    The other half is the room those answers need. The sections open by
    default are what a visitor reaches for first, which is an answer about an
    address that asks nothing; on a filtered link they are unanswered questions
    standing between the panel's top and the sections this visitor came with
    (arrivalHold has the numbers).

    So they yield, and only where that is not a decision being taken from
    anyone: on an address that arrived carrying filters, in the sidebar, once
    per visit, and never over a fold the visitor has set themselves. A first
    press does not qualify, which is the whole reason the address is asked
    rather than the count.

    The defaults move with the species tab and the window's height
    (openByDefault), and they move only the sections nobody has answered. An
    answered section that a default held open stays open when the default
    goes: a size picked on Psi keeps Velikost open on Vse, where its note says
    that the pick leaves every cat out. */
export function useFilterSections({
  active,
  layout = "sidebar",
  species = "all",
}: {
  /** Which sections hold an answer right now. */
  active?: Overrides;
  layout?: FilterCardLayout;
  /** The species tab, which Velikost's default reads (DEFAULT_OPEN). */
  species?: SpeciesFilter;
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
  const [held, setHeld] = useState(() => answeredOnly(active));
  // Through the store and not off matchMedia here, so a window resized across
  // the boundary re-renders the panel.
  const short = useSyncExternalStore(subscribeHeight, shortDesktop, serverHeight);
  const [landedAnswering] = useState(landedOnAnswers);
  const defaultOpen = useCallback(
    (key: FilterSectionKey) => openByDefault(key, layout, short, species),
    [layout, short, species],
  );

  const isOpen = useCallback(
    (key: FilterSectionKey) => held[key] ?? (overrides[key] ?? defaultOpen(key)),
    [held, overrides, defaultOpen],
  );
  // Called while rendering, by the two adjustments below.
  const holdOpen = (keys: FilterSectionKey[]) => {
    if (keys.length === 0) return;
    setHeld((previous) => ({
      ...previous,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    }));
  };

  // Adjusted during render rather than in an effect, so the panel arrives in
  // the same paint as the grid its filter narrowed; an effect would draw the
  // old arrangement first and rearrange it a frame later, which is the page
  // moving on its own for no reason the visitor can see. React's own shape for
  // this: set state while rendering, and it re-runs this hook's component
  // before anything is committed.
  //
  // No useMemo around the key: the caller builds `active` fresh every render
  // (filter-groups.tsx), so a dependency on it can never match, and ten key
  // reads and a join are cheaper than the bookkeeping that would wrap them.
  //
  // First the defaults moving, on a species tab or across the short desktop's
  // height: an answered section they held open is held open in their place,
  // so only what nobody has answered folds. Only ever towards open, so it
  // cannot undo what an arrival in the same render holds (arrivalHold opens
  // every answered section too).
  const [defaultsSeen, setDefaultsSeen] = useState({ species, short });
  if (defaultsSeen.species !== species || defaultsSeen.short !== short) {
    holdOpen(
      SECTION_KEYS.filter(
        (key) =>
          active?.[key] &&
          held[key] === undefined &&
          overrides[key] === undefined &&
          openByDefault(key, layout, defaultsSeen.short, defaultsSeen.species),
      ),
    );
    setDefaultsSeen({ species, short });
  }

  const answered = answeredKey(active);
  const [seen, setSeen] = useState(answered);
  if (seen !== answered) {
    // The arrival is the first answers of a visit, on an address that came
    // carrying them: the panel is arranged around them once. Anything later is
    // the visitor's own navigation inside a panel they are already reading,
    // and it opens the section gained and moves nothing else.
    //
    // A second arrival, after a clear-all, is left to the same rule rather
    // than guarded against: it can only rewrite what it wrote the first time,
    // since every section the visitor has touched since has left this hold and
    // gained a stored fold that arrivalHold does not overwrite.
    if (seen === "" && landedAnswering) {
      setHeld(arrivalHold(active, overrides, layout));
    } else {
      const before = new Set(seen.split(" "));
      holdOpen(
        SECTION_KEYS.filter(
          (key) => active?.[key] && !before.has(key) && !isOpen(key),
        ),
      );
    }
    setSeen(answered);
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
