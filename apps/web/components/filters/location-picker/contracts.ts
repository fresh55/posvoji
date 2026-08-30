import type { LookupEntry } from "@/lib/municipality-coverage";
import type { FilterOption } from "@/lib/filters";
import type { ShelterSummary } from "@/lib/shelter-summary";

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
  /** Municipality → responsible-shelter entries. */
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site. */
  offSite?: FilterOption[];
  /** Per-shelter species breakdown and longest wait, keyed by shelter id. */
  summaries?: Map<string, ShelterSummary>;
  /** Which mounted instance answers found-animal and spotlight deep links. */
  deepLink?: "desktop" | "mobile";
  /** The toolbar button or the filter sidebar's scope row. */
  dress?: "toolbar" | "sidebar";
  /** Optional controlled dialog state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
