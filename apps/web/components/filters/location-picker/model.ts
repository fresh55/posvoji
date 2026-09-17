import type { ShelterRow } from "@/components/filters/shelter-rows";
import {
  activeFilterCount,
  type FilterOption,
  type Filters,
  type SpeciesFilter,
} from "@/lib/filters";
import { cityAt, distanceKm, type LatLon } from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import { speciesScopeLabel } from "@/lib/labels";
import type { ShelterPin } from "@/lib/map-layout";

export function sameValues(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function pickerFilterSummary(filters: Filters, locale: Locale): string {
  const extra = activeFilterCount({ ...filters, shelter: [] });
  return [speciesScopeLabel(filters.species, locale), extra > 0
    ? locale === "sl" ? `Dodatni filtri: ${extra}` : `Additional filters: ${extra}`
    : null].filter(Boolean).join(" · ");
}

/** What the picker's footer may offer at zero results, beside widening the
 *  shelters. A clear never touches the species (use-animal-filters.ts), so
 *  it is offered only while there is a filter for it to clear; once the
 *  species is the only thing left narrowing the list, the offer is the
 *  species' own way back, or the button would press and nothing would move.
 *  Written here because three surfaces mount the picker and each of them
 *  was about to decide this for itself. */
export function pickerRecoveryActions(
  filters: Filters,
  onClearAll: (() => void) | undefined,
  onSpeciesChange: ((species: SpeciesFilter) => void) | undefined,
): { onClearFilters?: () => void; onShowAllSpecies?: () => void } {
  const extra = activeFilterCount({ ...filters, shelter: [] });
  return {
    onClearFilters: extra > 0 ? onClearAll : undefined,
    onShowAllSpecies:
      filters.species !== "all" && onSpeciesChange
        ? () => onSpeciesChange("all")
        : undefined,
  };
}

// Search text with its accents taken off, so a keyboard without them finds
// every name. NFD splits č ć š ž into a letter and a combining mark and the
// mark is dropped; đ is its own letter with no decomposition, so it is named
// here. Same alphabet as lib/geo.ts cityKey, which the town table folds with.
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

export function visibleTrigger(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const triggers =
    document.querySelectorAll<HTMLElement>("[data-picker-trigger]");
  for (const trigger of triggers) {
    if (trigger.getClientRects().length > 0) return trigger;
  }
  return null;
}

// Whether the control about to hand focus into the dialog was itself focused
// by a keyboard. Asked at open time, while the trigger still holds focus:
// :focus-visible is the browser's own record of how that focus arrived, drawn
// as a ring after a keypress and withheld after a click.
//
// A mouse open reaches false by one of two roads. Chrome and Firefox focus the
// button they were clicked on and withhold focus-visible from it; Safari does
// not focus it at all, which leaves activeElement on the body.
export function openedWithKeyboard(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  // The body is named rather than left to the selector because the engines
  // disagree about it: jsdom answers :focus-visible for an unfocused body and
  // a browser does not. Excluding it makes both say what is true either way,
  // that nobody opened a dialog with a keyboard from there.
  if (!active || active === document.body) return false;
  return active.matches(":focus-visible");
}

export function bringIntoList(
  scroller: HTMLElement | null,
  cell: Element | null,
) {
  if (!scroller || !cell) return;
  const view = scroller.getBoundingClientRect();
  const box = cell.getBoundingClientRect();
  const above = box.top - view.top;
  const below = box.bottom - view.bottom;
  if (above >= 0 && below <= 0) return;
  scroller.scrollTop += above < 0 || box.height > view.height ? above : below;
}

export const pickerText = {
  sl: {
    matches: "Zadetki",
    showing: "Prikazano",
    done: "Končano",
    clearSelection: "Počisti izbor",
    selected: "Izbrano",
    removeSelection: "Odstrani zavetišče",
    places: "Kraji",
    near: "V bližini",
    removeOrigin: "Odstrani izhodišče",
    distance: "Približna zračna razdalja med kraji.",
    countsMatch: "Število živali upošteva izbrane filtre.",
    zeroMatches: "Nobena objavljena žival ne ustreza tvoji izbiri.",
    // The footer's way out of an empty result, beside "Počisti filtre" and
    // "Pokaži vse živali". A verb like them, and not the bare two words the
    // panel head uses for the state of having nothing picked (lib/labels.ts
    // allShelters), which read as a label rather than a button.
    allShelters: "Pokaži vsa zavetišča",
    backToResults: "Nazaj k rezultatom",
    chooseShelters: "Izberi zavetišča",
    chooseSheltersHint: "Izberi eno ali več zavetišč.",
    showMap: "Pokaži zemljevid",
  },
  en: {
    matches: "Matches",
    showing: "Showing",
    done: "Done",
    clearSelection: "Clear selection",
    selected: "Selected",
    removeSelection: "Remove shelter",
    places: "Places",
    near: "Near",
    removeOrigin: "Remove starting point",
    distance: "Approximate straight-line distance between towns.",
    countsMatch: "Animal counts reflect your current filters.",
    zeroMatches: "No published animals match your selection.",
    allShelters: "Show all shelters",
    backToResults: "Back to results",
    chooseShelters: "Choose shelters",
    chooseSheltersHint: "Select one or more shelters.",
    showMap: "Show map",
  },
} satisfies Record<Locale, Record<string, string>>;

export type LocatedRow = ShelterRow & { at?: LatLon };

export function locateAndSort(
  options: FilterOption[],
  origin: LatLon | undefined,
): LocatedRow[] {
  const located = options.map((option) => {
    const at = option.city ? cityAt(option.city) : undefined;
    return {
      ...option,
      at,
      km: at && origin ? distanceKm(origin, at) : undefined,
    };
  });
  if (!origin) return located;
  return located.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

export function toPins(
  rows: LocatedRow[],
  extra: (row: LocatedRow) => { count: number; selectable?: boolean },
): ShelterPin[] {
  return rows.flatMap((row) =>
    row.at
      ? [
          {
            value: row.value,
            label: row.label,
            city: row.city ?? "",
            at: row.at,
            ...extra(row),
          },
        ]
      : [],
  );
}
