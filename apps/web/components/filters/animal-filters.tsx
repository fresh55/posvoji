"use client";

import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
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
import { activeFilterCount } from "@/lib/filters";
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

// Desktop has enough room for one quiet toolbar. Mobile keeps the species
// tabs, the result count and sort in the sticky rail while the two primary
// discovery actions share a bottom dock that spans the viewport.
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
  undo,
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
  /** Present only during the few seconds a clear can still be taken back. */
  undo?: () => void;
  resultCount: number;
  clearTrailKey: number;
  sort: AnimalSort;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  onSortChange: (sort: AnimalSort) => void;
} & FilterActionContract) {
  const { locale } = useI18n();
  const reduceMotion = useReducedMotion();
  const hasFilterSheet =
    groups.length > 0 ||
    toggles.length > 0 ||
    (goodWith?.options.length ?? 0) > 0 ||
    (home?.options.length ?? 0) > 0 ||
    (care?.options.length ?? 0) > 0;
  // Values, not sections. The chips row counts the same things and sits on the
  // same screen; a badge reading 1 over a row of two pills was two answers to
  // one question.
  const activeCount = activeFilterCount(filters);

  return (
    <>
      {/* Pinned, except where pinning costs more than it pays. A phone held
          sideways is 390px tall: this bar is 141 of them and the dock below
          takes 58 more, so half the screen was chrome and 191px was animals.
          Under 32rem of height it scrolls away with the page and comes back
          when the visitor scrolls back up, which is the same bargain the
          desktop layout already takes at lg. */}
      <div className="bleed sticky top-0 z-20 border-b bg-background/95 py-3 backdrop-blur-sm [@media(max-height:32rem)]:static lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
        <div
          data-slot="desktop-toolbar"
          className="hidden items-center justify-between gap-4 lg:flex"
        >
          <div className="min-w-0">
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
                className="text-muted-foreground"
              />
            )}
            {shelters && (
              <div>
                <LocationPicker
                  options={shelters}
                  counts={shelterTally}
                  selected={filters.shelter}
                  onToggle={(value) => onToggle("shelter", value)}
                  onToggleMany={(values) => onToggleMany("shelter", values)}
                  resultCount={resultCount}
                  municipalities={municipalities}
                  offSite={offSiteShelters}
                  summaries={shelterSummaries}
                  deepLink="desktop"
                />
              </div>
            )}
            {!isEmpty && <SortPicker value={sort} onChange={onSortChange} />}
          </div>
        </div>

        {/* Two rows on a phone, one from sm up, and the split is measured
            rather than assumed. The four Slovenian species tabs come to 286px
            and refuse to share: with the count and the sort beside them they
            had about sixty percent of a 390px screen, which cut "Mačke"
            mid-word and put "Zajčki" off the end of a strip nobody had a
            reason to scroll. Every species fits its own phone row, so someone
            looking for a rabbit can see that rabbits exist.

            All three together need 578px. That is over the line at 600px and
            under it at 640, which is sm exactly, so from sm they share a row:
            203px to spare on a phone held sideways, 127px on a tablet. It is
            worth the branch because stacking them there cost 44px of a
            landscape phone's 390, on top of a dock that already takes 58.

            The strip still scrolls and still fades its edges (species-tabs
            .tsx), which is what absorbs the 14px margin at sm itself. */}
        <div
          data-slot="mobile-toolbar"
          className="lg:hidden sm:flex sm:items-center sm:gap-3"
        >
          <div className="min-w-0 sm:flex-1">
            <SpeciesTabs
              value={filters.species}
              onChange={onSpeciesChange}
              counts={speciesTally}
              disabled={isEmpty}
            />
          </div>

          {!isEmpty && (
            <div className="mt-2 flex items-center justify-between gap-2 sm:mt-0 sm:shrink-0 sm:justify-end">
              <ResultCount
                count={resultCount}
                species={filters.species}
                locale={locale}
                clearTrailKey={clearTrailKey}
                className="text-muted-foreground max-sm:min-w-fit"
              />
              <SortPicker value={sort} onChange={onSortChange} />
            </div>
          )}
        </div>

        {/* The row's own arrival used to shift the grid under it by its full
            height in one frame, because it is inside a header that is sticky
            on a phone. Growing into place costs the same pixels and does not
            read as the page jumping. */}
        <LazyMotion features={domAnimation}>
          <AnimatePresence initial={false}>
            {!isEmpty && (chips.length > 0 || undo) && (
              <m.div
                key="filter-chips"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                // Height is not a transform, so the global MotionConfig
                // reducedMotion="user" does not switch it off the way it does
                // the pills' own motion. A box growing under the toolbar is
                // exactly the movement that setting is asking for less of.
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                className="min-w-0 overflow-hidden"
              >
                <FilterChips
                  chips={chips}
                  onClearAll={onClearAll}
                  undo={undo}
                  stuck={resultCount === 0}
                  className="mt-2"
                />
              </m.div>
            )}
          </AnimatePresence>
        </LazyMotion>
      </div>

      {/* The dock is present at any result count, including one. It used to
          vanish there, because both of its children were gated on a facet
          having something left to narrow: with a single animal on screen no
          group has two distinct values, so the sheet had no sections and the
          shelter list came through undefined. That is exactly the state where
          the picker is the way out, so `shelters` is now handed down whenever
          any shelter has animals at all (see animal-grid.tsx) and this
          condition holds. It still stands down when there is genuinely nothing
          to put in the dock, which is an empty dataset: an empty floating box
          is not a control. */}
      {(hasFilterSheet || shelters) && (
        <div
          data-slot="mobile-filter-dock"
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-stretch gap-1.5 rounded-ui border bg-background p-1.5 shadow-lg ring-1 ring-foreground/5 lg:hidden [&>*]:min-w-0 [&>*]:flex-1"
        >
          {hasFilterSheet && (
            <FilterSheet
              filters={filters}
              groups={groups}
              counts={counts}
              toggles={toggles}
              toggleTally={toggleTally}
              goodWith={goodWith}
              home={home}
              care={care}
              activeCount={activeCount}
              resultCount={resultCount}
              onToggle={onToggle}
              onToggleMany={onToggleMany}
              onToggleProperty={onToggleProperty}
              onToggleManyProperties={onToggleManyProperties}
              onClearAll={onClearAll}
            />
          )}
          {shelters && (
            <div className="[&>button]:h-11 [&>button]:w-full [&>button]:rounded-ui">
              <LocationPicker
                options={shelters}
                counts={shelterTally}
                selected={filters.shelter}
                onToggle={(value) => onToggle("shelter", value)}
                onToggleMany={(values) => onToggleMany("shelter", values)}
                resultCount={resultCount}
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
