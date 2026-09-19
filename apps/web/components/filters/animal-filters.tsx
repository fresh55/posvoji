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
  type Chip,
} from "@/components/filters/filter-chips";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-context";
import type {
  CardGroup,
  CareSection,
  GoodWithSection,
  HomeSection,
} from "@/components/filters/filter-groups";
import {
  filterSheetReason,
  SORT_ROW_HIDDEN,
  SORT_TOOLBAR_HIDDEN,
} from "@/components/filters/filter-sheet-policy";
import { ResponsiveFilterSheet as FilterSheet } from "./responsive-filter-sheet";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { LocationPicker } from "@/components/filters/location-picker";
import {
  pickerFilterSummary,
  pickerRecoveryActions,
} from "@/components/filters/location-picker/model";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import { SortPicker } from "@/components/filters/sort-picker";
import { activeFilterCount } from "@/lib/filters";
import { cn } from "@/lib/utils";
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

// The dock's two children are not equal: the Filtri button needs its own text
// and badge and nothing more, so it keeps the width of its content and the
// location control takes the rest. Giving both flex-1 handed the button half
// the plate and truncated the town name beside it. What splits it now is
// flex-1 on the picker against a button that asks for nothing: flex-grow
// starts at 0, which is what leaves it at its content width, and only:grow
// gives it the whole plate on the days it is the only child.
//
// A flex row, and it used to be a two-column grid. The difference is that a
// child can leave: the trigger stands down between md and lg where the sheet
// behind it has nothing in it, and a display:none child still holds its grid
// column. only:col-span-2 could not see that its sibling was gone, and the
// picker dropped into the auto column the button had been holding, 151px of a
// 448px plate measured at 768. A flex item that is not drawn is not an item,
// so the picker fills the row on its own and one rule splits the plate at
// every width.
//
// The edges follow env(safe-area-inset-*) with the 0px
// fallbacks globals.css documents, so the plate clears a notch or a curved
// corner instead of running under it.
//
// Edge to edge is a phone's shape, not a tablet's. Pinned to both edges at
// every width below lg, a tablet stretched two short controls across the page:
// measured at 768x1024 the dock was 736px wide and the location pill 639px of
// that, carrying the 13 characters of "Vsa zavetišča". From sm it is capped at
// 28rem and centred instead, near the width it has on the phone it was drawn
// for; a landscape phone at 844px lands on the same 28rem. min() is what keeps
// 28rem a cap rather than a floor if either that number or the breakpoint
// moves. Only the horizontal edges move: the bottom keeps the safe-area inset
// the footer's docked padding is measured against, and BackToTop is positioned
// on its own and stays at the viewport's right edge.
//
// z-30, under the sticky toolbar band (z-40) and above the page. The two only
// ever meet at 200% text, where the band lands at y 687-792 on a 390x844
// phone and this plate covers 698-812. Something is covered at landing either
// way, so this is a choice about which: with the plate on top the species tabs
// were unreachable, and with the band on top about 38px of this plate is,
// leaving its lower edge and both labels. The tabs win because the band is the
// only place they live, while everything in this plate opens a sheet that
// carries its own way back to every species; and one scroll frees whichever is
// covered, since the plate is fixed and the band pins. Nothing above it below
// lg but BackToTop (z-40), which stands 5.5rem up and never overlaps it.
const DOCK_CLASS =
  "fixed left-[max(1rem,env(safe-area-inset-left,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-30 flex items-stretch gap-1.5 rounded-ui border bg-background p-1.5 shadow-lg sm:left-1/2 sm:right-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 lg:hidden [&>*]:min-w-0 [&>*]:only:grow";

/** The band the toolbar draws itself in: full width below lg, the frame's own
 *  column from lg, with the rule under it that the grid starts below.
 *
 *  Exported because the stand-in that holds the results' place while a filtered
 *  link hydrates draws the same band (ResultsPending in animal-grid.tsx), and
 *  its height is what decides where that page's first row of cards starts. It
 *  cannot render this component to find out - the sheet and the picker in here
 *  are stateful, and exactly one desktop LocationPicker may be mounted - so the
 *  band is a string both can wear instead of a shape one of them copies. */
export const TOOLBAR_BAND = "bleed border-b py-rail-pad lg:mx-0 lg:px-0";

/** What the row inside that band measures at each width, for the same stand-in.
 *
 *  Three numbers because the row states three: the species strip alone comes to
 *  28px below md (its tap overlays live in padding this row's margins collapse
 *  through), the sort trigger beside it sets 44 from md, and the desktop row
 *  takes the trigger's own height so the filter panel's head lines up with it
 *  across the gutter. That last one is --toolbar-row (globals.css), read here
 *  rather than copied, because a skeleton that stands in for a row it has
 *  drifted from is a visible jump at the moment the real row arrives. */
export const TOOLBAR_ROW_HEIGHT = "h-7 md:h-11 lg:h-toolbar-row";

// Desktop has enough room for one toolbar. Below lg the species tabs hold the
// sticky rail on their own, joined from md by the same sort control, while the
// two primary discovery actions share a bottom dock that spans the viewport.
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
  onSheetOpenChange,
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
  onSheetOpenChange?: (open: boolean) => void;
  resultCount: number;
  sort: AnimalSort;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  onSortChange: (sort: AnimalSort) => void;
} & FilterActionContract) {
  const { locale } = useI18n();
  const reduceMotion = useReducedMotion();
  // Values, not sections. The chips row counts the same things and sits on the
  // same screen; a badge reading 1 over a row of two pills was two answers to
  // one question.
  const activeCount = activeFilterCount(filters);
  // Asked of the sheet rather than worked out here: what is inside it is its
  // own business, and this file only needs to know whether to hang a button
  // on the dock for it (filter-sheet.tsx).
  const sheetReason =
    filterSheetReason({
      groups,
      toggles,
      goodWith,
      home,
      care,
      resultCount,
      activeCount,
    }) ?? (undo ? "undo" : undefined);
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
  // Whether there is an order left to pick, asked once for the two rows that
  // offer one. resultCount and not just isEmpty: isEmpty is the whole dataset,
  // and a filter combination that narrows it to zero results still leaves
  // nothing for an order to apply to.
  const canSort = !isEmpty && resultCount > 0;
  // The class the sheet's trigger wears, or nothing. `order` is the one reason
  // that runs out: where the toolbar draws the order itself the sheet's own
  // sort row stands down with it, so a sheet the order alone holds open has
  // nothing left behind its button there and the button goes too. Which
  // screens those are is the sheet's to name, so the query comes from there
  // (SORT_ROW_HIDDEN) rather than being written out again here: it is a width
  // and a height, since the toolbar that takes the order over gives up its
  // pin on a short screen.
  //
  // In CSS and not from a width read in JS: this page is statically exported,
  // and a button deciding whether to exist after hydration flickers on every
  // cold load to settle a state no live dataset reaches. `canSort` is what
  // makes the premise true rather than merely true today -- the toolbar's own
  // control is gated on it, and without it a clause added there could leave
  // this band with no way to pick an order at all.
  const triggerStandsDown =
    sheetReason === "order" && canSort && SORT_ROW_HIDDEN;
  // The species strip, described once and mounted in both rows. Only CSS
  // separates the two, so both are in the tree at every width and the strip
  // prices that itself (species-tabs.tsx); what this spares is the five props
  // going out of step between two call sites, not the second mount. The box
  // is the strip's, because SpeciesTabs takes no className and the row needs
  // something that can be told to give way before the sort control does.
  // The two mounts of the chips row ask the same question of the same state,
  // so they ask it once here. Only where they are drawn differs, and that is
  // the placement each passes (filter-chips.tsx).
  const showChips = !isEmpty && (chips.length > 0 || undo);
  const chipProps = {
    chips,
    onClearAll,
    undo,
    // With nothing matching the row names the chip costing the most, because
    // "try fewer filters" is advice and not a way out, and the empty state
    // draws no pills of its own to say it with (animal-grid.tsx).
    stuck: resultCount === 0,
  };

  const speciesStrip = (
    <div className="min-w-0">
      <SpeciesTabs
        value={filters.species}
        onChange={onSpeciesChange}
        counts={speciesTally}
        roster={speciesRoster}
        disabled={isEmpty}
      />
    </div>
  );

  return (
    <>
      {/* Pinned, except where pinning costs more than it pays. A phone held
          sideways is 390px tall, and this bar and the dock below it were
          half of that. Under 32rem of height the bar scrolls away with the
          page and comes back when the visitor scrolls back up.

          The 141px this comment used to claim for the bar is stale: the chips
          row and the count line both left it, and the band measures 69px
          today against the dock's 58. That is not an argument for pinning it
          again. What the bar carries in that band is the species strip, the
          grid behind it is two cards tall, and a pinned 69px is a fifth of
          the screen that never shows an animal. Sorting stays in the sheet
          wherever this bar is unpinned; the toolbar takes it over only when
          it can remain reachable (SORT_ROW_HIDDEN and SORT_TOOLBAR_HIDDEN in
          filter-sheet.tsx).

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
      {/* py-rail-pad and not a plain length: the filter panel across the
          gutter pins to the same edge and carries the same amount as top
          padding, so the two columns start their content on one line. The
          number is written once, in globals.css. */}
      {/* z-40, above the dock, and it was z-20 under it. At 200% text on a
          390x844 phone this band lands at y 687-792 and the fixed dock covers
          698-812, so at landing the species tabs were entirely behind the
          dock's plate and the one species control on the page could not be
          pressed until the visitor scrolled. The band wins that overlap now:
          it is the tabs' only home and it pins to the top of the viewport,
          while the dock is fixed to the bottom and comes clear of it the
          moment the page moves at all. Nothing changes at 100% text, where
          the two never meet. */}
      <div className={cn(TOOLBAR_BAND, "sticky top-0 z-40 bg-background/95 backdrop-blur-sm short:static lg:bg-background lg:backdrop-blur-none")}>
        {/* --toolbar-row states the row's height rather than leaving it to
            whichever control happens to be tallest: the sort trigger stands
            down at zero results, and the row would otherwise fall to the tabs'
            own 28px in the one state where nothing else filled it, taking the
            panel head across the gutter out of line with it. */}
        <div
          data-slot="desktop-toolbar"
          className="hidden min-h-toolbar-row items-center justify-between gap-4 lg:flex"
        >
          {speciesStrip}

          {/* min-w-0 shrink, and it was shrink-0. At 200% text this cluster
              asks for 496px inside the 384px the 1024 layout leaves it, and
              refusing to shrink it pushed the document 80px wider than the
              window: the page scrolled sideways, which is the one thing a
              text-size setting must not cost. Shrinking, the sort trigger's
              value truncates instead (it is line-clamped already,
              sort-picker.tsx) and the strip beside it keeps scrolling; the
              species strip is min-w-0 too, so neither of the two is the one
              that always gives way. Nothing moves at 100% text, where the
              cluster asks for less than its track. */}
          <div className="flex min-w-0 shrink items-center gap-2">
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
                  filterSummary={pickerFilterSummary(filters, locale)}
                  {...pickerRecoveryActions(filters, onClearAll, onSpeciesChange)}
                  municipalities={municipalities}
                  offSite={offSiteShelters}
                  summaries={shelterSummaries}
                  deepLink="desktop"
                />
              </div>
            )}
            {canSort && <SortPicker value={sort} onChange={onSortChange} />}
          </div>
        </div>

        {/* One row below lg. Below md the species tabs are all of it: they
            refuse to share a 390px row with anything wide, and squeezed they
            cut "Mačke" mid-word and pushed the last tab off the end of a
            strip nobody had a reason to scroll. The count is gone from this
            bar entirely, so the tabs get the width without being given it.

            From md that argument runs out. Measured at 768x1024 this row is
            720px wide and the tabs end at x=384, so 336px of it were empty
            while the tablet had no sort control anywhere on screen: the
            order was three taps away inside the filter sheet. The same
            trigger measures 253px on the desktop row, so from md it takes
            the right end of this one and the tabs keep the rest, in a
            min-w-0 box so the strip still scrolls and still fades its own
            edges (species-tabs.tsx).

            flex from md and not below it. The strip hangs its tap overlays
            on -my-2/py-2, and this row stands at 44px only while it is a
            block box those margins can collapse through; made flex at every
            width it measures the strip's 28px margin box instead and the
            phone's row loses 16px. Both measured. From md the trigger's own
            44px (max-lg:min-h-11) sets the line height, and min-h-11 holds
            the same 44px in the states where the guard drops it. */}
        <div
          data-slot="mobile-toolbar"
          className="md:flex md:min-h-11 md:items-center md:justify-between md:gap-4 lg:hidden"
        >
          {speciesStrip}

          {/* From md there is room for sorting beside the species strip,
              except in a short viewport where this toolbar scrolls away.
              SORT_TOOLBAR_HIDDEN complements the sheet's SORT_ROW_HIDDEN:
              exactly one placement offers the order below lg. On the control
              itself rather than a box around it: the trigger's own
              base is flex (ui/select.tsx), so a wrapper turning it back on at
              md with md:block would have flattened its icon, label and
              chevron into a stack. shrink-0 because the strip beside it is
              min-w-0 and gives way first. */}
          {canSort && (
            <SortPicker
              value={sort}
              onChange={onSortChange}
              className={cn("shrink-0", SORT_TOOLBAR_HIDDEN)}
            />
          )}
        </div>

        {/* The sticky band's own row, from lg only. There the row wraps
            instead of scrolling, sits beside a sidebar that shows the same
            state anyway, and costs a wide screen nothing.

            Below lg it is not what a sticky bar can afford: 52px of pinned
            chrome, charged by growing, so the grid moved the moment a filter
            arrived, and a horizontal scroller stacked 8px under a second
            horizontal scroller inside a vertically scrolling page, where
            every pixel of every pill removes a filter and a flick the browser
            resolved as a tap dropped one silently. The filters are stated
            below lg in flow instead, under the band, where none of that
            holds (the mobile-filter-row below).

            The grow-in stays: this header is sticky at lg too, and an arrival
            that shifts the grid by its full height in one frame reads as the
            page jumping. */}
        <LazyMotion features={domAnimation}>
          <AnimatePresence initial={false}>
            {showChips && (
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
                <FilterChips {...chipProps} className="mt-2" />
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

          The sort control that used to share this row is not on it at any
          width. Below md it is in the filter sheet (filter-sheet.tsx). It
          spent a pass pinned in the bar and a pass scrolling away above the
          grid, and the second was the wrong half of a real finding: sorting
          is a primary way people find things, often reached for before
          filtering, so it has to stay reachable while the list is scrolled.
          The dock is the only thing on this page that is always reachable,
          and the sheet behind it is where the visitor already goes to change
          what the grid shows. From md, on a screen tall enough for the row
          above to stay pinned, that row carries it instead, on the 336px the
          tabs leave, and the sheet's copy stands down. */}
      {!isEmpty && (
        <span className="sr-only lg:hidden">
          <ResultCount count={resultCount} locale={locale} />
        </span>
      )}

      {/* What is on, named below lg, in flow under the band. Before this the
          count badge on the Filtri button was the whole of it, and a badge is
          a number: four filters and the one wrong filter look the same on it,
          so the only way to read the state was to open the sheet.

          In flow and not in the band, which answers each objection that took
          the row off the phone in the first place (see the lg-only row
          above). It scrolls away with the results, so the pinned chrome pays
          nothing and the badge carries the state once the row is past. And it
          sits where the sheet was: a filter picked in the sheet lands behind
          it, so closing the sheet lands on the evidence. The shape it takes
          here is the "flow" placement in filter-chips.tsx, which is where the
          wrapping and the cap are settled and measured.

          It carries the way back from a clear as well, which is why the gate
          holds on `undo` with no chips left: clearing is the one filter
          action repeating the gesture cannot undo, and FilterChips swaps the
          pills for the offer for the few seconds it stands. */}
      {/* A second mount of the same row and not the band's moved: one
          instance cannot be inside the sticky band at lg and in flow below
          it, and a hook choosing a parent from the width would break the
          static prerender. The chunk was already on this route for the lg
          row, so the cost is a second layout tree, one of which is always
          display:none, and it has to stay zero-rect-safe (focusAfterRow in
          filter-chips.tsx). */}
      {showChips && (
        <div data-slot="mobile-filter-row" className="lg:hidden">
          <FilterChips {...chipProps} placement="flow" />
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

      {(sheetReason || shelters) && (
        <div
          data-slot="mobile-filter-dock"
          className={cn(
            DOCK_CLASS,
            // The picker takes the whole plate on its own once the trigger
            // beside it leaves (DOCK_CLASS). With no picker to take it, there
            // is no plate to draw: an empty floating box is not a control.
            !shelters && triggerStandsDown,
          )}
        >
          {sheetReason && (
            <FilterSheet
              className={cn(triggerStandsDown)}
              sort={sort}
              onSortChange={onSortChange}
              onSpeciesChange={onSpeciesChange}
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
              undo={undo}
              onOpenChange={onSheetOpenChange}
            />
          )}
          {shelters && (
            <div className="flex-1 [&>button]:h-11 [&>button]:w-full [&>button]:rounded-ui">
              <LocationPicker
                options={shelters}
                counts={shelterTally}
                selected={filters.shelter}
                onToggle={(value) => onToggle("shelter", value)}
                onToggleMany={(values) => onToggleMany("shelter", values)}
                resultCount={resultCount}
                filterSummary={pickerFilterSummary(filters, locale)}
                {...pickerRecoveryActions(filters, onClearAll, onSpeciesChange)}
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
