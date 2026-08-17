"use client";

import { FilterChips, type Chip } from "@/components/filters/filter-chips";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import type { CardGroup } from "@/components/filters/filter-groups";
import { FilterSheet } from "@/components/filters/filter-sheet";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { LocationPicker } from "@/components/filters/location-picker";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import { SortPicker } from "@/components/filters/sort-picker";
import { activeFilterSectionCount } from "@/lib/filters";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
} from "@/lib/filters";
import type { AnimalSort } from "@/lib/sort";

// Desktop has enough room for one quiet toolbar: species on the left and the
// result/location/sort actions on the right. Narrower screens keep the result
// and sort on a second row; below sm the species control lives in the sheet.
export function AnimalFilters({
  isEmpty,
  filters,
  speciesTally,
  groups,
  counts,
  toggles,
  toggleTally,
  shelters,
  shelterTally,
  chips,
  resultCount,
  clearTrailKey,
  sort,
  onSpeciesChange,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onClearAll,
  onSortChange,
}: {
  isEmpty: boolean;
  filters: Filters;
  speciesTally: Record<SpeciesFilter, number>;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  /** Absent when the dataset has nothing to choose between. */
  shelters: FilterOption[] | undefined;
  shelterTally: Map<string, number>;
  chips: Chip[];
  resultCount: number;
  clearTrailKey: number;
  sort: AnimalSort;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  onSortChange: (sort: AnimalSort) => void;
} & FilterActionContract) {
  const { locale } = useI18n();
  const hasFilterSheet = groups.length > 0 || toggles.length > 0;
  const activeSectionCount = activeFilterSectionCount(filters);

  return (
    <div className="bleed sticky top-0 z-10 border-b bg-background/90 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
      <div className="flex items-center justify-between gap-4">
        <div
          className={
            hasFilterSheet ? "hidden min-w-0 sm:block" : "min-w-0"
          }
        >
          <SpeciesTabs
            value={filters.species}
            onChange={onSpeciesChange}
            counts={speciesTally}
            disabled={isEmpty}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isEmpty && (
            <ResultCount
              count={resultCount}
              species={filters.species}
              locale={locale}
              clearTrailKey={clearTrailKey}
              className="hidden min-w-24 text-muted-foreground lg:inline-flex"
            />
          )}
          {shelters && (
            <LocationPicker
              options={shelters}
              counts={shelterTally}
              selected={filters.shelter}
              onToggle={(value) => onToggle("shelter", value)}
              onToggleMany={(values) => onToggleMany("shelter", values)}
            />
          )}
          {!isEmpty && (
            <SortPicker
              value={sort}
              onChange={onSortChange}
              className="hidden lg:flex"
            />
          )}
          {hasFilterSheet && (
            <div className="shrink-0 lg:hidden">
              <FilterSheet
                filters={filters}
                groups={groups}
                counts={counts}
                speciesTally={speciesTally}
                toggles={toggles}
                toggleTally={toggleTally}
                activeSectionCount={activeSectionCount}
                resultCount={resultCount}
                onToggle={onToggle}
                onToggleMany={onToggleMany}
                onToggleProperty={onToggleProperty}
                onToggleManyProperties={onToggleManyProperties}
                onSpeciesChange={onSpeciesChange}
                onClearAll={onClearAll}
              />
            </div>
          )}
        </div>
      </div>
      {!isEmpty && (
        <div
          className={`mt-2 min-w-0 items-center justify-between gap-2 ${
            chips.length > 0 ? "flex" : "flex lg:hidden"
          }`}
        >
          <div className="min-w-0 flex-1">
            <FilterChips chips={chips} onClearAll={onClearAll} />
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <ResultCount
              count={resultCount}
              species={filters.species}
              locale={locale}
              clearTrailKey={clearTrailKey}
              className="min-w-fit text-muted-foreground sm:min-w-24"
            />
            <SortPicker value={sort} onChange={onSortChange} />
          </div>
        </div>
      )}
    </div>
  );
}
