"use client";

import { FilterChips, type Chip } from "@/components/filters/filter-chips";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import type { CardGroup } from "@/components/filters/filter-groups";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { LocationPicker } from "@/components/filters/location-picker";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
  ToggleKey,
} from "@/lib/filters";

// Below sm the species control lives in the filter sheet. Keeping the full tab
// strip beside location, the sheet trigger, and the result count reduced it to
// zero width and left its divider stranded at the start of the row.
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
  activeCount,
  resultCount,
  onSpeciesChange,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onClearAll,
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
  activeCount: number;
  resultCount: number;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleMany: (group: MultiGroup, values: string[]) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onClearAll: () => void;
}) {
  const { locale } = useI18n();
  const hasFilterSheet = groups.length > 0 || toggles.length > 0;

  return (
    <div className="bleed sticky top-0 z-10 border-b bg-background/90 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
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
          {shelters && (
            <>
              <span
                aria-hidden
                className={
                  hasFilterSheet
                    ? "hidden h-5 w-px shrink-0 bg-border sm:block"
                    : "h-5 w-px shrink-0 bg-border"
                }
              />
              <LocationPicker
                options={shelters}
                counts={shelterTally}
                selected={filters.shelter}
                onToggle={(value) => onToggle("shelter", value)}
                onToggleMany={(values) => onToggleMany("shelter", values)}
              />
            </>
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
                activeCount={activeCount}
                resultCount={resultCount}
                onToggle={onToggle}
                onToggleMany={onToggleMany}
                onToggleProperty={onToggleProperty}
                onSpeciesChange={onSpeciesChange}
                onClearAll={onClearAll}
              />
            </div>
          )}
        </div>
        {!isEmpty && (
          <ResultCount
            count={resultCount}
            locale={locale}
            className="min-w-fit text-muted-foreground sm:min-w-24"
          />
        )}
      </div>
      <FilterChips chips={chips} onClearAll={onClearAll} className="mt-2" />
    </div>
  );
}
