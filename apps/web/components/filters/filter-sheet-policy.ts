import type { CardGroup, CareSection, GoodWithSection } from "./filter-groups";
import type { FilterOption, ToggleDef } from "@/lib/filters";

export const SORT_ROW_HIDDEN = "md:not-short:hidden";
export const SORT_TOOLBAR_HIDDEN = "max-md:hidden short:hidden";

type FilterSheetReason = "sections" | "undo" | "order";

export function filterSheetReason({
  groups,
  toggles,
  goodWith,
  care,
  resultCount,
  activeCount,
}: {
  groups: { group: CardGroup; options: FilterOption[] }[];
  toggles: ToggleDef[];
  goodWith?: GoodWithSection;
  care?: CareSection;
  resultCount: number;
  activeCount: number;
}): FilterSheetReason | undefined {
  const hasSections =
    groups.length > 0 ||
    toggles.length > 0 ||
    (goodWith?.options.length ?? 0) > 0 ||
    (care?.options.length ?? 0) > 0;
  if (hasSections) return "sections";
  // Values and not sections: a picked shelter has no section in here but it
  // has the Kje row, and every active value has the footer's clear.
  if (activeCount > 0) return "undo";
  if (resultCount > 1) return "order";
  return undefined;
}
