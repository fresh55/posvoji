import type { ShelterRow } from "@/components/filters/shelter-rows";
import { activeFilterCount, type FilterOption, type Filters } from "@/lib/filters";
import { cityAt, distanceKm, type LatLon } from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import type { ShelterPin } from "@/lib/map-layout";

export function sameValues(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function pickerFilterSummary(filters: Filters, locale: Locale): string {
  const species = locale === "sl"
    ? { all: "Vse živali", dog: "Psi", cat: "Mačke", other: "Ostale živali" }
    : { all: "All animals", dog: "Dogs", cat: "Cats", other: "Other animals" };
  const extra = activeFilterCount({ ...filters, shelter: [] });
  return [species[filters.species], extra > 0
    ? locale === "sl" ? `Dodatni filtri: ${extra}` : `Additional filters: ${extra}`
    : null].filter(Boolean).join(" · ");
}

export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
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
    shelters: "Zavetišča",
    near: "V bližini",
    removeOrigin: "Odstrani izhodišče",
    distance: "Približna zračna razdalja med kraji.",
    countsMatch: "Število živali upošteva izbrane filtre.",
    zeroMatches: "Nobena objavljena žival ne ustreza tvoji izbiri.",
    allShelters: "Vsa zavetišča",
    clearFilters: "Počisti vse filtre",
    backToResults: "Nazaj k rezultatom",
    chooseShelters: "Izberi zavetišča",
    chooseSheltersHint: "Izberi eno ali več zavetišč.",
    showList: "Pokaži seznam",
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
    shelters: "Shelters",
    near: "Near",
    removeOrigin: "Remove starting point",
    distance: "Approximate straight-line distance between towns.",
    countsMatch: "Animal counts reflect your current filters.",
    zeroMatches: "No published animals match your selection.",
    allShelters: "All shelters",
    clearFilters: "Clear all filters",
    backToResults: "Back to results",
    chooseShelters: "Choose shelters",
    chooseSheltersHint: "Select one or more shelters.",
    showList: "Show list",
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
  return [...located].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
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
