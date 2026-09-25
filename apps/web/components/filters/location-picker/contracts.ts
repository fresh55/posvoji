import type { LookupEntry } from "@/lib/municipality-coverage";
import type { FilterOption } from "@/lib/filters";
import type { ShelterSummary } from "@/lib/shelter-summary";
import type { AnimalSort } from "@/lib/sort";

/** The stable public contract exposed by the LocationPicker facade. */
export type LocationPickerProps = {
  options: FilterOption[];
  counts: Map<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  onToggleMany: (values: string[]) => void;
  /** Animals the whole filter state currently matches, shown live on the
   * confirm button so picking a shelter has visible consequences. */
  resultCount: number;
  /** Current animal filters, shown alongside the shelter counts. */
  filterSummary?: string;
  /** Explicit recovery when no animal matches, including across shelters. */
  onClearFilters?: () => void;
  /** The species' own way back, for the zero that no clear can undo
   *  because the species is all that is narrowing the list
   *  (pickerRecoveryActions in model.ts). */
  onShowAllSpecies?: () => void;
  /** Municipality → responsible-shelter entries. Map furniture, not a mode:
   * the picker names who answers for the občine inside a region the roster
   * leaves empty. The lookup itself is a page (found-animal-page.tsx). */
  municipalities?: LookupEntry[];
  municipalitiesUrl?: string;
  /** Registry shelters with no animals on the site. */
  offSite?: FilterOption[];
  /** Per-shelter species breakdown and longest wait, keyed by shelter id. */
  summaries?: Map<string, ShelterSummary>;
  /** Which mounted instance answers an animal card's spotlight ask. */
  deepLink?: "desktop" | "mobile";
  /** The toolbar button or the filter sidebar's scope row. */
  dress?: "toolbar" | "sidebar";
  /** The grid's order, which a place given to the dialog moves to Najbližje
   *  while it is still the default, and gives back when the place goes: the
   *  shelter list sorts itself by distance, and until this the grid behind
   *  the dialog quietly did not. Without it the grid's order is left alone. */
  sort?: AnimalSort;
  onSortChange?: (sort: AnimalSort) => void;
  /** Optional controlled dialog state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
