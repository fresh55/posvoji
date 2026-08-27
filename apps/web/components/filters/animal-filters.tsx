"use client";

import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { useState } from "react";
import { BackToTop } from "@/components/back-to-top";
import {
  FilterChips,
  UndoOffer,
  type Chip,
} from "@/components/filters/filter-chips";
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
  hasSidebar = false,
  filters,
  speciesTally,
  speciesRoster,
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
  /** Whether the page draws the filter panel beside the grid at lg. When it
   *  does, the panel's own Kje row is where shelter is asked and this bar
   *  keeps no picker trigger of its own (animal-grid.tsx decides). */
  hasSidebar?: boolean;
  filters: Filters;
  /** What each species tab draws: every filter applied except species. */
  speciesTally: Record<SpeciesFilter, number>;
  /** Which species tabs exist, over the whole dataset. A filter empties a
   *  tab, it does not delete it (species-tabs.tsx). */
  speciesRoster: Record<SpeciesFilter, number>;
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
  // The picker's open state, held here because the sheet cannot hold it. Its
  // Kje row has to close the drawer before the dialog may open, and the two
  // are siblings under this component: the sheet asks, and the dock's picker
  // below is the instance that answers.
  const [pickerOpen, setPickerOpen] = useState(false);
  // The picked shelters, as the pills the sheet draws under its own scope row.
  // Read off the chips the grid already built rather than assembled a second
  // time: the labels there are already stripped by shelterChipLabel and the
  // removals already go through the same toggle.
  const shelterChips = chips.filter((chip) => chip.facet === "shelter");

  return (
    <>
      {/* Pinned, except where pinning costs more than it pays. A phone held
          sideways is 390px tall: this bar is 141 of them and the dock below
          takes 58 more, so half the screen was chrome and 191px was animals.
          Under 32rem of height it scrolls away with the page and comes back
          when the visitor scrolls back up.

          Pinned at lg too, now. A 503-animal grid puts the visitor far from
          the tabs within two scrolls, and switching species meant riding all
          the way back up; the sidebar beside this bar already stays, so the
          bar scrolling away left half the controls behind.

          Opaque at lg rather than blurred. backdrop-filter re-samples and
          re-blurs whatever is behind it on every scrolled frame, and on
          desktop what is behind it is the widest part of a 503-card grid.
          A phone's bar is narrow and short enough to be worth the effect;
          a full-width desktop rail is not, and an opaque ground pins just
          as well. */}
      <div className="bleed sticky top-0 z-20 border-b bg-background/95 py-3 backdrop-blur-sm short:static lg:mx-0 lg:bg-background lg:px-0 lg:backdrop-blur-none">
        <div
          data-slot="desktop-toolbar"
          className="hidden items-center justify-between gap-4 lg:flex"
        >
          <div className="min-w-0">
            <SpeciesTabs
              value={filters.species}
              onChange={onSpeciesChange}
              counts={speciesTally}
              roster={speciesRoster}
              disabled={isEmpty}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* sr-only here for the same reason as the phone's status line
                below: the species tabs at the other end of this row carry
                every count now, including Vse's, so a drawn copy here would
                be the same total written twice in one bar. The live region
                stays, because that is the part the tabs cannot do. */}
            {!isEmpty && (
              <span className="sr-only">
                <ResultCount count={resultCount} locale={locale} />
              </span>
            )}
            {/* Only where no panel is drawn beside the grid. With one, the
                Kje row at the top of it asks the same question with more
                room and a reset of its own, and two triggers for one dialog
                on one screen is one too many. Both branches keep exactly one
                desktop instance mounted, which is what the deep-link
                arbitration in location-picker.tsx counts on. */}
            {shelters && !hasSidebar && (
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
            {/* resultCount, not just isEmpty: isEmpty is the whole dataset,
                and a filter combination that narrows it to zero results
                still leaves nothing for an order to apply to. */}
            {!isEmpty && resultCount > 0 && (
              <SortPicker value={sort} onChange={onSortChange} />
            )}
          </div>
        </div>

        {/* One row below lg, and the species tabs are all of it. They refuse
            to share a 390px row with anything wide: squeezed they cut "Mačke"
            mid-word and pushed the last tab off the end of a strip nobody had
            a reason to scroll. The count and the sort that used to sit beside
            them are gone from this bar entirely, so the tabs get the width
            without having to be given it. The strip still scrolls and still
            fades its own edges (species-tabs.tsx). */}
        <div data-slot="mobile-toolbar" className="lg:hidden">
          <SpeciesTabs
            value={filters.species}
            onChange={onSpeciesChange}
            counts={speciesTally}
            roster={speciesRoster}
            disabled={isEmpty}
          />
        </div>

        {/* From lg only. On a phone this row was the fourth surface stating
            the filter state, after the badge on the Filtri button, the pressed
            cards in the sheet that badge opens, and the count that moved when
            the filter landed. It charged 52px of a sticky header for it, and
            it charged them by growing, which pushed the grid down the moment
            a filter arrived. Worse than the pixels: it was a horizontal
            scroller stacked 8px under a second horizontal scroller inside a
            vertically scrolling page, and every pixel of every pill in it
            removes a filter with no way to take that back. A flick the
            browser resolved as a tap dropped a filter silently.

            What it was genuinely good for survives. Removal moves to the
            sheet, beside the pressed card that set it, where the causal link
            is visible and nothing is on a scroll path. The stuck mode, which
            names the one chip costing the most, moves to the empty state
            (animal-grid.tsx), which is the screen it was for and the one
            screen with no grid underneath to push down.

            At lg the row wraps instead of scrolling, sits beside a sidebar
            that shows the same state anyway, and costs a wide screen nothing.
            It stays. So does the grow-in: this header is sticky at lg too, and
            an arrival that shifts the grid by its full height in one frame
            reads as the page jumping. */}
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
                className="min-w-0 overflow-hidden max-lg:hidden"
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

      {/* The result count, heard and never seen on a phone. Its number moved
          onto the species tabs, the one place it can be read against the
          choice it belongs to; drawn again it was a fourth number stacked
          under three, saying only what their sum or the pressed one already
          said. The announcement is the part that could not move: this holds
          the aria-live region that says "22 zivali" when a filter lands, and
          a tab quietly changing its digits announces nothing. sr-only on a
          wrapper rather than on the component, so its own layout classes are
          left alone and only the painting stops.

          The sort control that used to share this row is in the filter sheet
          now (filter-sheet.tsx). It spent a pass pinned in the bar and a pass
          scrolling away above the grid, and the second was the wrong half of
          a real finding: sorting is a primary way people find things, often
          reached for before filtering, so it has to stay reachable while the
          list is scrolled. The dock is the only thing on this page that is
          always reachable, and the sheet behind it is where the visitor
          already goes to change what the grid shows. */}
      {!isEmpty && (
        <span className="sr-only lg:hidden">
          <ResultCount count={resultCount} locale={locale} />
        </span>
      )}

      {/* The way back from a clear, on a phone. It used to ride the sort row
          and went with it; at lg the chips row still carries its own copy,
          but that row is hidden below lg, which left clearing as the one
          filter action a phone could not take back. Repeating the gesture
          undoes every other one.

          Only while the offer stands, which is a few seconds, so it costs no
          room at rest -- the reason it can afford to be a row of its own here
          rather than sharing one that has to exist all the time. */}
      {!isEmpty && undo && (
        <div data-slot="mobile-undo-row" className="lg:hidden">
          <UndoOffer onUndo={undo} />
        </div>
      )}

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
      {/* Outside the dock's condition: the way back up is worth having
          whether or not there is anything left to filter, and it is the only
          control on this page that answers the grid's own length. */}
      <BackToTop />

      {(hasFilterSheet || shelters) && (
        <div
          data-slot="mobile-filter-dock"
          // border + shadow-lg, and no ring. This plate carried a border, a
          // ring and a shadow at once, which is three edge treatments on one
          // object and the heaviest recipe on a screen whose cards make do
          // with border + shadow-xs. The ring was the one saying nothing the
          // border was not already saying.
          className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex items-stretch gap-1.5 rounded-ui border bg-background p-1.5 shadow-lg lg:hidden [&>*]:min-w-0 [&>*]:flex-1"
        >
          {hasFilterSheet && (
            <FilterSheet
              sort={sort}
              onSortChange={onSortChange}
              filters={filters}
              groups={groups}
              counts={counts}
              toggles={toggles}
              toggleTally={toggleTally}
              goodWith={goodWith}
              home={home}
              care={care}
              activeCount={activeCount}
              scope={
                shelters && {
                  options: shelters,
                  counts: shelterTally,
                  offSite: offSiteShelters,
                  selected: filters.shelter,
                  chips: shelterChips,
                  onOpen: () => setPickerOpen(true),
                  onReset: () => onToggleMany("shelter", filters.shelter),
                }
              }
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
                open={pickerOpen}
                onOpenChange={setPickerOpen}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
