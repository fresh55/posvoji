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

/** What narrows the counts in the picker, or "" when nothing does. The picker
 *  draws its note only while this has something in it: with every species and
 *  no other filter, each count is the whole shelter and needs no footnote. */
export function pickerFilterSummary(filters: Filters, locale: Locale): string {
  const extra = activeFilterCount({ ...filters, shelter: [] });
  if (filters.species === "all" && extra === 0) return "";
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
// every name: the grid search's own folder (foldText in lib/filters/search.ts).
//
// Not the same function as lib/geo.ts cityKey, and not the same alphabet: that
// one folds five letters by hand and never normalises, which is enough for the
// town table it keys. shelter-initial.ts and the slugify in animal-path.ts
// fold their own way too; moving them onto foldText is a pass of its own,
// since the slug one addresses animals.
export { foldText as fold } from "@/lib/filters/search";

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

/** bringIntoList now and again once `cell` has finished the animation that
 *  opens it: until then its height is still ramping up from nothing, and
 *  "nearest" would measure a strip that is not there yet. Where there is no
 *  animation to wait for, the first call is the one that does it, and the
 *  other has nothing left to do. Returns the effect's cleanup. */
export function bringIntoListOnceOpen(
  scroller: { readonly current: HTMLElement | null },
  cell: Element,
): () => void {
  const bring = () => bringIntoList(scroller.current, cell);
  bring();
  cell.addEventListener("animationend", bring, { once: true });
  return () => cell.removeEventListener("animationend", bring);
}

/** The distances the picker offers to pick by once it knows where the visitor
 *  is, in kilometres: a short drive, an afternoon, the far side of the
 *  country from the middle of it. */
export const PICK_RADII_KM = [20, 50, 100] as const;

export const pickerText = {
  sl: {
    matches: "Zadetki",
    showing: "Prikazano",
    done: "Končano",
    clearSelection: "Počisti vse",
    selected: "Izbrano",
    removeSelection: "Odstrani zavetišče",
    places: "Kraji",
    near: "V bližini",
    removeOrigin: "Odstrani izhodišče",
    countsMatch: "Število živali upošteva filtre",
    zeroMatches: "Nobena objavljena žival ne ustreza tvoji izbiri.",
    // An empty result with animals in shelters nobody picked (footer.tsx).
    // "Dodaj" and not "Dodaj zavetišče", because the shelter's name follows.
    matchesElsewhere: "Zadetki drugje",
    andMore: "in še {n}",
    add: "Dodaj",
    backToResults: "Nazaj k rezultatom",
    showList: "Pokaži seznam",
    chooseShelters: "Izberi zavetišča",
    chooseSheltersHint: "Izberi eno ali več zavetišč.",
    showMap: "Pokaži zemljevid",
    pickWithin: "Izberi zavetišča v razdalji",
    upTo: "do",
  },
  en: {
    matches: "Matches",
    showing: "Showing",
    done: "Done",
    clearSelection: "Clear all",
    selected: "Selected",
    removeSelection: "Remove shelter",
    places: "Places",
    near: "Near",
    removeOrigin: "Remove starting point",
    countsMatch: "Counts follow your filters",
    zeroMatches: "No published animals match your selection.",
    matchesElsewhere: "Matches elsewhere",
    andMore: "and {n} more",
    add: "Add",
    backToResults: "Back to results",
    showList: "Show list",
    chooseShelters: "Choose shelters",
    chooseSheltersHint: "Select one or more shelters.",
    showMap: "Show map",
    pickWithin: "Pick shelters within",
    upTo: "within",
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

/** The rows the filters leave something in, ahead of the ones they empty,
 *  each group in the order it already had. With no filter narrowing the counts
 *  every live shelter has animals and this changes nothing; with one, the
 *  answer stops being scattered down an alphabetical list between muted rows.
 *  Counts follow the other filters and not the shelter pick, so nothing moves
 *  while the dialog is open: picking or dropping a row never re-sorts it. */
export function matchesFirst<Row extends { value: string }>(
  rows: Row[],
  counts: Map<string, number>,
): Row[] {
  const has = (row: Row) => (counts.get(row.value) ?? 0) > 0;
  return [...rows.filter(has), ...rows.filter((row) => !has(row))];
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
