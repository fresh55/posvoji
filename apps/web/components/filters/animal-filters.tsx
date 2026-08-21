"use client";

import { FilterChips, type Chip } from "@/components/filters/filter-chips";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import type {
  CardGroup,
  CareSection,
  GoodWithSection,
  HomeSection,
} from "@/components/filters/filter-groups";
import { FilterSheet } from "@/components/filters/filter-sheet";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { LocationPicker } from "@/components/filters/location-picker";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import { SortPicker } from "@/components/filters/sort-picker";
import { activeFilterSectionCount } from "@/lib/filters";
import type { LookupEntry } from "@/lib/municipality-coverage";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
} from "@/lib/filters";
import type { ShelterSummary } from "@/lib/shelter-summary";
import type { AnimalSort } from "@/lib/sort";

// Desktop has enough room for one quiet toolbar. Mobile keeps result and sort
// in the sticky rail while the two primary discovery actions share a bottom
// dock with enough internal space to read as one deliberate surface.
export function AnimalFilters({
  isEmpty,
  filters,
  speciesTally,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  home,
  care,
  shelters,
  shelterTally,
  municipalities,
  offSiteShelters,
  shelterSummaries,
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
  goodWith?: GoodWithSection;
  home?: HomeSection;
  care?: CareSection;
  /** Absent when the dataset has nothing to choose between. */
  shelters: FilterOption[] | undefined;
  shelterTally: Map<string, number>;
  municipalities?: LookupEntry[];
  /** Registry shelters with no animals on the site, shown inert in the
   *  location picker's map and list. */
  offSiteShelters?: FilterOption[];
  /** Species breakdown and longest wait per shelter, for the card the map's
   *  own click leaves in the picker's panel. */
  shelterSummaries?: Map<string, ShelterSummary>;
  chips: Chip[];
  resultCount: number;
  clearTrailKey: number;
  sort: AnimalSort;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  onSortChange: (sort: AnimalSort) => void;
} & FilterActionContract) {
  const { locale } = useI18n();
  const hasFilterSheet =
    groups.length > 0 ||
    toggles.length > 0 ||
    (goodWith?.options.length ?? 0) > 0 ||
    (home?.options.length ?? 0) > 0 ||
    (care?.options.length ?? 0) > 0;
  const activeSectionCount = activeFilterSectionCount(filters);

  return (
    <>
      <div className="bleed sticky top-0 z-20 border-b bg-background/95 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
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
              <div className="hidden lg:block">
                <LocationPicker
                  options={shelters}
                  counts={shelterTally}
                  selected={filters.shelter}
                  onToggle={(value) => onToggle("shelter", value)}
                  onToggleMany={(values) => onToggleMany("shelter", values)}
                  resultCount={resultCount}
                  species={filters.species}
                  municipalities={municipalities}
                  offSite={offSiteShelters}
                  summaries={shelterSummaries}
                  deepLink="desktop"
                />
              </div>
            )}
            {!isEmpty && (
              <SortPicker
                value={sort}
                onChange={onSortChange}
                className="hidden lg:flex"
              />
            )}
          </div>
        </div>

        {!isEmpty && (
          <div className="mt-2 flex items-center justify-end gap-2 lg:hidden">
            <ResultCount
              count={resultCount}
              species={filters.species}
              locale={locale}
              clearTrailKey={clearTrailKey}
              className="min-w-fit text-muted-foreground sm:min-w-24"
            />
            <SortPicker value={sort} onChange={onSortChange} />
          </div>
        )}

        {!isEmpty && chips.length > 0 && (
          <div className="mt-2 min-w-0">
            <FilterChips chips={chips} onClearAll={onClearAll} />
          </div>
        )}
      </div>

      {(hasFilterSheet || shelters) && (
        <div
          data-slot="mobile-filter-dock"
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 box-border flex max-w-[calc(100vw-2rem)] flex-row-reverse items-stretch gap-1.5 rounded-ui border bg-background p-1.5 shadow-lg ring-1 ring-foreground/5 lg:hidden"
        >
          {hasFilterSheet && (
            <FilterSheet
              filters={filters}
              groups={groups}
              counts={counts}
              speciesTally={speciesTally}
              toggles={toggles}
              toggleTally={toggleTally}
              goodWith={goodWith}
              home={home}
              care={care}
              activeSectionCount={activeSectionCount}
              resultCount={resultCount}
              onToggle={onToggle}
              onToggleMany={onToggleMany}
              onToggleProperty={onToggleProperty}
              onToggleManyProperties={onToggleManyProperties}
              onSpeciesChange={onSpeciesChange}
              onClearAll={onClearAll}
            />
          )}
          {shelters && (
            <div className="min-w-0 max-w-[12rem] sm:max-w-[14rem] [&>button]:h-11 [&>button]:w-full [&>button]:rounded-ui">
              <LocationPicker
                options={shelters}
                counts={shelterTally}
                selected={filters.shelter}
                onToggle={(value) => onToggle("shelter", value)}
                onToggleMany={(values) => onToggleMany("shelter", values)}
                resultCount={resultCount}
                species={filters.species}
                municipalities={municipalities}
                offSite={offSiteShelters}
                summaries={shelterSummaries}
                deepLink="mobile"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
