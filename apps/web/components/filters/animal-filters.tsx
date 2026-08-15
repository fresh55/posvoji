"use client";

import { FilterChips, type Chip } from "@/components/filters/filter-chips";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
  ToggleKey,
} from "@/lib/filters";
import { ANIMAL_FORMS, plural } from "@/lib/labels";

// Species tabs and the count live in this top bar at every width. The other
// groups sit in the desktop sidebar; below lg they move into the bottom sheet.
export function AnimalFilters({
  isEmpty,
  filters,
  speciesTally,
  groups,
  counts,
  toggles,
  toggleTally,
  chips,
  activeCount,
  resultCount,
  onSpeciesChange,
  onToggle,
  onToggleProperty,
  onClearAll,
}: {
  isEmpty: boolean;
  filters: Filters;
  speciesTally: Record<SpeciesFilter, number>;
  groups: { group: MultiGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  chips: Chip[];
  activeCount: number;
  resultCount: number;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="bleed sticky top-0 z-10 border-b bg-background/90 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <SpeciesTabs
            value={filters.species}
            onChange={onSpeciesChange}
            counts={speciesTally}
            disabled={isEmpty}
          />
          {(groups.length > 0 || toggles.length > 0) && (
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
                onToggleProperty={onToggleProperty}
                onSpeciesChange={onSpeciesChange}
                onClearAll={onClearAll}
              />
            </div>
          )}
        </div>
        {!isEmpty && (
          <span
            aria-live="polite"
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {plural(resultCount, ANIMAL_FORMS)}
          </span>
        )}
      </div>
      <FilterChips chips={chips} onClearAll={onClearAll} className="mt-2.5" />
    </div>
  );
}
