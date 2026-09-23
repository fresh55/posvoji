import type { Chip } from "@/components/filters/filter-chips";
import type {
  CardGroup,
  CareSection,
  GoodWithSection,
} from "@/components/filters/filter-groups";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
} from "@/lib/filters";
import type { AnimalSort } from "@/lib/sort";

export {
  SORT_ROW_HIDDEN,
  SORT_TOOLBAR_HIDDEN,
  filterSheetReason,
} from "./filter-sheet-policy";

export type ShelterScope = {
  options: FilterOption[];
  counts: Map<string, number>;
  offSite?: FilterOption[];
  selected: string[];
  chips: Chip[];
  onOpen: () => void;
  onReset: () => void;
};

export type FilterSheetProps = FilterActionContract & {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  care?: CareSection;
  scope?: ShelterScope;
  activeCount: number;
  resultCount: number;
  sort: AnimalSort;
  onSortChange: (sort: AnimalSort) => void;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  undo?: () => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};
