"use client";

import { SlidersHorizontal, Undo2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import { RemovableChips, type Chip } from "@/components/filters/filter-chips";
import {
  FilterGroupList,
  type CardGroup,
  type CareSection,
  type GoodWithSection,
  type HomeSection,
} from "@/components/filters/filter-groups";
import { SECTION_LABEL_CLASS } from "@/components/filters/filter-section-header";
import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { SortPicker } from "@/components/filters/sort-picker";
import { SpeciesGlyphIcon } from "@/components/filters/species-glyph";
import { useDesktopBreakpointClose } from "@/hooks/use-desktop-breakpoint-close";
import { usePickerHistory } from "@/hooks/use-picker-history";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
} from "@/lib/filters";
import { speciesScopeLabel } from "@/lib/labels";
import type { AnimalSort } from "@/lib/sort";
import { cn } from "@/lib/utils";

/** The Kje row at the top of the sheet, and the pills under it. The dialog it
 *  opens is the dock's picker, not one of the sheet's own: a full-viewport map
 *  nested inside a vaul drawer fights it for the scroll lock and the focus
 *  trap, so the press closes the drawer and animal-filters.tsx opens the map
 *  after it. Absent when the dataset has no shelters to choose between. */
export type ShelterScope = {
  options: FilterOption[];
  counts: Map<string, number>;
  offSite?: FilterOption[];
  selected: string[];
  /** The picked shelters as removable pills. Without them a phone could pick
   *  a shelter on the map and had no way at all of taking it off again short
   *  of reopening the map and finding the row. */
  chips: Chip[];
  onOpen: () => void;
  onReset: () => void;
};

// How long the drawer takes to leave. Vaul animates its content out over half
// a second and holds the body's scroll lock for the whole of it, so the map is
// asked for once the drawer is gone rather than over the top of it.
const DRAWER_CLOSE_MS = 500;

/** Below lg exactly one placement offers sorting: the sheet below md or in a
 *  short viewport, the sticky toolbar otherwise. Keep these complementary;
 *  a short viewport lets the toolbar scroll away. The order-only trigger uses
 *  the sheet's condition so the dock keeps the remaining way to sort. */
export const SORT_ROW_HIDDEN = "md:not-short:hidden";
export const SORT_TOOLBAR_HIDDEN = "max-md:hidden short:hidden";

/** The caption over the sort row, and the row itself, each resolved once:
 *  every half is a constant, so there is one answer and no reason to ask cn
 *  for either per render.
 *
 *  The caption prints in SECTION_LABEL_CLASS, the voice every section heading
 *  in the panel uses, so the one row that is not a filter section still reads
 *  as one. FilterSectionHeader itself is not used: it carries a reset link and
 *  a disclosure trigger, and this row wants neither. The caption wears
 *  SORT_ROW_HIDDEN too, so the label and the control it labels leave on the
 *  same query.
 *
 *  mt-3 moved up to the caption and the row kept mt-1.5, which is the gap that
 *  makes the two read as one labelled control rather than as a heading and a
 *  separate setting under it. */
const SORT_CAPTION_CLASS = cn(SECTION_LABEL_CLASS, "mt-3", SORT_ROW_HIDDEN);
const SORT_ROW_CLASS = cn("mt-1.5 h-11 w-full text-sm", SORT_ROW_HIDDEN);

/** The column the sheet's own content stands in. The header and the footer
 *  wear it as a class each; the body says the same thing about its children
 *  one at a time (SHEET_BLOCK_CHILDREN_CLASS below, which says why). The three
 *  line up either way.
 *
 *  The frame itself stays full-bleed, and ui/drawer.tsx says why: a horizontal
 *  inset on it shows the overlay down the notch side and draws the drawer's
 *  border where it used to be off screen, so the way to clear an inset here is
 *  to pad the content. This is that padding, for the one screen that needs it.
 *  A drawer is as wide as the viewport, and a tablet is not a phone: measured
 *  at 834 the sheet was 834px across and a Spol tile came to 393px of it for
 *  the word "Samec", with the footer's two buttons stretched the same way.
 *
 *  28rem because the dock on the same screen is capped there from sm
 *  (animal-filters.tsx), so the sheet and the button that opened it hold
 *  their controls in one column. min() keeps it a cap rather than a floor. */
const SHEET_BLOCK_CLASS = "sm:mx-auto sm:w-[min(28rem,100%)]";

/** The same column, said about a box's children one at a time.
 *
 *  The cap sits on each block in the scrolling body rather than on one box
 *  around them. The scroll box itself has to stay the sheet's full width, so
 *  its bar is at the sheet's edge and its padding is the sheet's, and the
 *  sections in it are a fragment: a box around them would be a node added for
 *  nothing but its width. Every child in there is a block of its own, so
 *  centring them one by one is the same column.
 *
 *  Beside the class it mirrors, and not spelled out at the call site 360 lines
 *  below. The child-selector form has a reason; a second copy of the two
 *  measurements it repeats does not, and a column named twice is a column that
 *  moves in one place. */
const SHEET_BLOCK_CHILDREN_CLASS =
  "[&>*]:sm:mx-auto [&>*]:sm:w-[min(28rem,100%)]";

/** What is behind the Filtri button, or undefined when nothing is.
 *
 *  It lives here rather than in the dock that mounts the sheet, because what
 *  it answers is what this file draws, and the dock was reconstructing that
 *  across a file boundary: a flat chain of conditions that grew a clause per
 *  audit, one for each state somebody noticed the sheet had gone missing
 *  from. Three things can be inside, so there are three named answers and a
 *  section added below has one place to be counted.
 *
 *  Sorting is the reason the last two exist. On a phone the sheet is where the
 *  order is changed, so a result set that no facet can narrow still has
 *  something to do in here, and so does a filtered-to-nothing one, which is
 *  where a visitor most needs the way back out.
 *
 *  A reason and not a yes, because one of the three is drawn at some sizes and
 *  not others: on a screen that is both wide and tall the toolbar carries the
 *  order itself and the sort row below stands down (SORT_ROW_HIDDEN), so a
 *  sheet held open by `order` alone opens there on a title, a footer, and a
 *  body holding the Kje row or nothing at all, depending on whether the
 *  dataset has shelters to choose between. The caller stands the trigger down
 *  on the same query instead, in CSS (animal-filters.tsx).
 *
 *  `order` is tried last, and the order of the returns below is the contract
 *  rather than a style: a sheet with anything else in it keeps its trigger at
 *  every size, so only the answer that runs out may be the one given. A clause
 *  inserted above it changes which states lose their button. */
type FilterSheetReason = "sections" | "undo" | "order";

export function filterSheetReason({
  groups,
  toggles,
  goodWith,
  home,
  care,
  resultCount,
  activeCount,
}: {
  groups: { group: CardGroup; options: FilterOption[] }[];
  toggles: ToggleDef[];
  goodWith?: GoodWithSection;
  home?: HomeSection;
  care?: CareSection;
  resultCount: number;
  activeCount: number;
}): FilterSheetReason | undefined {
  const hasSections =
    groups.length > 0 ||
    toggles.length > 0 ||
    (goodWith?.options.length ?? 0) > 0 ||
    (home?.options.length ?? 0) > 0 ||
    (care?.options.length ?? 0) > 0;
  if (hasSections) return "sections";
  // Values and not sections: a picked shelter has no section in here but it
  // has the Kje row, and every active value has the footer's clear.
  if (activeCount > 0) return "undo";
  if (resultCount > 1) return "order";
  return undefined;
}

export function FilterSheet({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  home,
  care,
  scope,
  activeCount,
  resultCount,
  sort,
  onSortChange,
  onSpeciesChange,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onClearAll,
  undo,
  onOpenChange,
  className,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  home?: HomeSection;
  care?: CareSection;
  scope?: ShelterScope;
  /** How many values the whole filter state holds. Shelter counts: the Kje
   *  row at the top of this sheet is a control for it, so the badge on the
   *  trigger no longer promises a section the sheet does not have. */
  activeCount: number;
  resultCount: number;
  /** Sorting is offered here on a phone, and on a phone it is offered nowhere
   *  else. It is not a filter and does not join `Filters` (lib/sort.ts keeps
   *  the two apart on purpose, since one orders the list the other has
   *  already matched); what it shares with them is the sheet, because on a
   *  phone the sheet is the one surface a visitor can always reach to change
   *  what the grid shows. On a screen wide and tall enough for the toolbar to
   *  pin the control, the row below stands down (SORT_ROW_HIDDEN). */
  sort: AnimalSort;
  onSortChange: (sort: AnimalSort) => void;
  /** The way from the species pill back to every species. The pill is the
   *  one species control in here, so this is only ever called with "all";
   *  it takes the strip's own setter so the two write the query the same
   *  way, and the hook behind it knows to write in place while the sheet is
   *  open (use-animal-filters.ts). */
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
  /** The same timed offer as the page row, reachable while this sheet covers it. */
  undo?: () => void;
  /** Keeps the page's Undo clock paused while the sheet owns that control. */
  onOpenChange?: (open: boolean) => void;
  /** Merged onto the trigger, which is all this component draws until it is
   *  opened. The dock passes the query on which the sheet has nothing left in
   *  it (animal-filters.tsx); the content is portalled to <body> and takes
   *  none of it. */
  className?: string;
} & FilterActionContract) {
  const { locale, messages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Release the page's paused clock if this instance unmounts, and report the
  // current state if its observer changes while it is already open.
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  // The caption's id, which the sort trigger takes half of its accessible name
  // from. Generated rather than written out: nothing stops a page from
  // mounting two of these, and a duplicate id points aria-labelledby at
  // whichever one the document happens to hold first.
  const sortCaptionId = useId();
  // Where focus goes when the species pill takes itself off the screen: the
  // dialog itself, which Radix already gives tabIndex -1, so a keyboard user
  // stays inside the sheet at its top rather than being dropped on the body
  // or wherever the focus trap's own fallback lands. The chips row and the
  // picker's footer hand focus on the same way when a control removes itself.
  const contentRef = useRef<HTMLDivElement>(null);

  // FilterSheet never unmounts, so a divider left "scrolled" from a previous
  // visit would otherwise still be there the next time the sheet opens at
  // scrollTop 0. Every way out goes through here rather than through an
  // effect watching `open`, so there is one close path and no render that
  // paints the stale divider before the effect clears it.
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
    setScrolled(false);
  };

  // The way from the Kje row to the map: down first, then out. Opening a
  // dialog while the drawer is still leaving leaves two scroll locks and two
  // focus traps on the page, and the one that unmounts second wins.
  const openScope = () => {
    close();
    window.setTimeout(() => scope?.onOpen(), DRAWER_CLOSE_MS);
  };

  // Vaul portals to <body>, so this sheet would otherwise stay open and
  // floating if a resize (or a phone rotated to landscape) crosses into the
  // lg layout while it is up, even though the trigger for it just vanished.
  // It closes through the same path as everything else.
  useDesktopBreakpointClose(open, close);

  // The Android back button and the iOS edge swipe are how a phone dismisses
  // whatever is on top, and without an entry of its own the sheet was not on
  // top of anything: one back from the open sheet left the results page
  // altogether, taking the filter with it, and on a tab that opened on the
  // list it closed the tab. The hook pushes one temporary entry and pops it on
  // every other close path, so the two cannot get out of step. Filter writes
  // are `replace` (use-animal-filters.ts), so the entry under this one is the
  // previous page rather than the unfiltered list; the hook restores the
  // address it left on, which is why a choice made in the sheet survives the
  // gesture that dismissed it.
  usePickerHistory(open, close);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          onOpenChange?.(true);
        } else close();
      }}
    >
      <DrawerTrigger asChild>
        <Button
          size="sm"
          aria-label={
            activeCount > 0
              ? t("filtersWithCount", { count: activeCount })
              : messages.filters
          }
          className={cn("h-11 gap-1.5 rounded-ui px-3", className)}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {messages.filters}
          {activeCount > 0 && (
            /* The count, at every width. It used to start at 360px, with a 6px
               dot standing in below that because "the full badge doesn't fit
               the trigger". Measured at 320: it fits. The trigger draws
               "Filtri 2" whole, nothing in it truncates, and the dock is
               still 320px wide. What the badge does cost there is 14px of the
               shelter trigger beside it, whose label is a town name already
               truncated at that width, against a number that was otherwise
               only in the aria-label: a sighted visitor on the narrowest
               phone had a dot saying something was on and no way to learn how
               much short of opening the sheet. */
            <Badge
              variant="secondary"
              aria-hidden="true"
              className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        ref={contentRef}
        closeLabel={messages.close}
        // 72dvh, down from a full 85dvh takeover: the sheet used to open the
        // visitor onto a blind list with the count in the footer as the only
        // feedback on what narrowed. The lower cap leaves part of the page
        // visible behind the sheet; whether cards are in that strip depends
        // on the page's scroll position. Vaul snap points were dropped: they
        // translate the full-height content down, and the pinned footer with
        // the primary action goes below the fold at the lower snap.
        //
        // A short landscape phone (844x390) has no card row to keep visible
        // behind the sheet in the first place -- 72dvh of a 390px-tall
        // viewport is 281px, and the header and footer alone eat most of
        // that -- so under a 32rem-tall viewport (the shared `short` variant,
        // globals.css) the cap lifts to almost the full height instead,
        // leaving a small strip of the page as the only sign a sheet opened
        // over it. Portrait phones stay on the 72dvh cap.
        //
        // The close button is ui/drawer's own, and it halves to 32px from sm,
        // which is a width and not a hand: on a 768 tablet and on a landscape
        // phone the one way out of this sheet that is not a gesture measured
        // 32x32. The override is spelled here because the primitive is shared
        // and this is its only caller; `> button` is that close button, the
        // only direct button child the content has.
        className="flex max-h-[72dvh] flex-col gap-0 pt-1 [&>button]:pointer-coarse:size-11 short:max-h-[calc(100dvh-2rem)]"
      >
        <div
          data-slot="filter-sheet-header"
          data-scrolled={scrolled ? "" : undefined}
          className="shrink-0 border-b border-transparent px-5 pb-3 data-scrolled:border-border"
        >
          {/* Sort on its own full-width row under the title, on a phone and on
              any screen short enough that the toolbar unpins (SORT_ROW_HIDDEN),
              and inside the header block rather than the scrolling body, so
              it stays put while the filter list moves under it.

              The caption above it is the fix for what the row looked like
              without one: a bordered full-width select directly under "Filtri"
              showing an order and a glyph, with nothing on screen saying it
              ordered the list rather than narrowing it. Baymard's product-list
              work asks for a visible "Sort by" on the control, and a phone has
              no toolbar around it to imply the rest. The word alone is enough
              here because the control under it names the order in full.

              From md in a taller viewport the toolbar carries the order.
              On short landscape screens that toolbar scrolls away, so it
              gives the order back to this row through the fixed dock.
              SORT_TOOLBAR_HIDDEN and SORT_ROW_HIDDEN are complements: the
              control has one placement below lg, including at scroll zero. The
              header's own pb-3 is what sits under the title once the pair is
              gone. The sheet is only reachable below lg, so this is the
              md-to-lg band, less the landscape phones in it: under 32rem of
              height that toolbar stops pinning and scrolls away with the page
              (SORT_ROW_HIDDEN says what that measured), so 844x390 and
              932x430 keep the pair in here.

              It shared the title's row for one pass and could not: the close
              button is absolutely positioned in that corner at 44px, and the
              two targets overlapped by 32x14px with the X on top, so the top
              right of the sort control closed the sheet instead of opening
              it. Measured, not guessed. Padding the row clear of the X would
              have fixed the collision and left three things crowded into one
              band anyway.

              The pair costs about 78px of the sheet. That is affordable
              because the control is one Select and not every order spelled out
              on a row of its own, and the filters still begin about a quarter
              of the way down. Full width also stops the longest order from
              truncating, and reads as a setting for the whole sheet rather
              than an ornament on the heading. */}
          {/* The title, and beside it the species the list is being read in.

              The species tabs used to repeat here and were taken out to save
              the sheet 56px, on the argument that the visitor had just used
              the strip behind the trigger to get here. Measured on
              2026-09-17, that argument does not hold: with the page at the
              top the strip sits under the open sheet at every phone width,
              scrolled it is under the overlay's blur where no word survives,
              in landscape it has scrolled away, and a deep link arrives with
              a species pressed and no press made. A visitor who chose Ostale
              and opened the sheet found "Samica 0" with nothing on screen
              saying the 0 was counted among two rabbits.

              So the sheet states its scope, once, in the one place that never
              scrolls: a pill on the title line, drawn in the pressed tab's
              own token (the dark fill, the species glyph, the species word)
              so it is recognised rather than read, and pressable, because
              "show me everything again" is the one species action anyone
              wants from in here. It costs 8px of header, against 38 for the
              strip, and nothing at all on Vse, where every count in the sheet
              means what it says and there is no scope to state.

              A scope, not a filter: it is not in the badge on the trigger,
              and "Počisti filtre" below leaves it standing
              (use-animal-filters.ts). The x on the pill is its own reset.

              The row keeps clear of the drawer's close button on the right
              (44px, absolutely positioned in this band) with pe-12: the
              longest label, "Other animals", measures 148px at 320 and the
              button starts 267px in, so the clearance is for a label that
              has not been written yet, not for these. */}
          {/* The header's own column, so the title line and the sort row
              stand where the body's sections do (SHEET_BLOCK_CLASS). The
              border under the header stays on the block outside it and runs
              the full width: it is the drawer's own edge when the body is
              scrolled, not a rule under this content. */}
          <div className={SHEET_BLOCK_CLASS}>
            <div className="mt-3 flex min-w-0 items-center gap-3 pe-12">
              <DrawerTitle className="text-base">{messages.filters}</DrawerTitle>
              {filters.species !== "all" && (
                <button
                  type="button"
                  data-slot="species-scope"
                  onClick={() => {
                    contentRef.current?.focus();
                    onSpeciesChange("all");
                  }}
                  aria-label={t("speciesScope", {
                    label: speciesScopeLabel(filters.species, locale),
                  })}
                  className="inline-flex h-8 min-w-0 touch-manipulation select-none items-center gap-1.5 rounded-ui bg-foreground px-2.5 text-sm text-background outline-none focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:tap-target"
                >
                  <SpeciesGlyphIcon tab={filters.species} />
                  <span className="min-w-0 truncate">
                    {speciesScopeLabel(filters.species, locale)}
                  </span>
                  <X aria-hidden className="size-3.5 shrink-0 opacity-70" />
                </button>
              )}
            </div>
            <div id={sortCaptionId} className={SORT_CAPTION_CLASS}>
              {messages.sortCaption}
            </div>
            <SortPicker
              value={sort}
              onChange={onSortChange}
              labelledBy={sortCaptionId}
              className={SORT_ROW_CLASS}
            />
          </div>
        </div>

        {/* scrollbar-thin because until it was here this box said nothing
            about being a scroll box: no fade, no bar, and nine folded section
            names that end at the bottom edge with more under it. The same thin
            bar the picker's shelter list wears (picker-shelter-list.tsx), and
            the utility carries the thumb colour that a hand-written
            scrollbar-width never got (globals.css); a phone draws no bar at
            all and loses nothing, and on a mouse or a trackpad it is the whole
            of the cue. */}
        <div
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          className={cn(
            "flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 scrollbar-thin",
            SHEET_BLOCK_CHILDREN_CLASS,
          )}
        >
          {/* Kje above every section, the same order the panel keeps at lg.
              The pills under it are the mobile half of the fix: the dock's
              picker states the scope and the map picks it, and until this row
              existed neither of them could take a shelter back off. */}
          {scope && (
            <LocationScopeRow
              options={scope.options}
              counts={scope.counts}
              offSite={scope.offSite}
              selected={scope.selected}
              onOpen={openScope}
              onReset={scope.onReset}
              layout="row"
            >
              <RemovableChips chips={scope.chips} className="mt-2" />
            </LocationScopeRow>
          )}

          {/* The sections fold behind their headers here, the way they do in
              the panel at lg. This sheet used to open all nine of them into
              whatever a phone had left, on the argument that it scrolls as
              one page: measured on 2026-09-17 the body held 1586px of content
              in a 388px window at 390x844 and 1649px in 189px at 320x568,
              and with the keyboard up 10.7 times the window, so six to eight
              section names were never seen at all. The panel's worst case is
              1.07x, so the argument for folding applies to this surface more
              than to the one already doing it. At 390x844 the body goes from
              1586px to about 774.

              Nothing new is built for it: the fold, the defaults that keep
              Spol and Starost open, the summary chip a closed header shows so
              an active filter never disappears with its cards, and the pull
              into view once a section has grown all ship for the panel
              already (use-filter-sections.ts, filter-section-header.tsx).
              The folds are stored per section and the two surfaces share the
              store, which is right: a visitor who folded Velikost has said
              which sections they care about, and that answer is theirs on
              both surfaces. Initially active sections are revealed when this
              sheet opens so a filtered link shows its selected options; a
              manual fold still wins for the rest of that opening. */}
          <FilterGroupList
            filters={filters}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            goodWith={goodWith}
            home={home}
            care={care}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
            onToggleProperty={onToggleProperty}
            onToggleManyProperties={onToggleManyProperties}
            layout="sheet"
          />
        </div>

        {/* The footer's band keeps its rule, its ground and the safe-area
            padding full width; the two buttons stand in the same column the
            sections above them do, rather than stretching a tablet's whole
            width (SHEET_BLOCK_CLASS). */}
        <div className="shrink-0 border-t bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={cn("flex gap-3", SHEET_BLOCK_CLASS)}>
            <Button
              variant="ghost"
              className="h-11"
              disabled={activeCount === 0 && !undo}
              onClick={activeCount === 0 && undo ? undo : onClearAll}
              aria-label={activeCount === 0 && undo ? messages.undoClearFilters : undefined}
            >
              {/* "Počisti filtre" and not "Počisti vse": the species pill on the
                  title line survives this press, and a button that says
                  everything while a dark pill beside it stays put is a button
                  that lies. */}
              {activeCount === 0 && undo ? (
                <>
                  <Undo2 className="size-4" aria-hidden />
                  {messages.undoClear}
                </>
              ) : messages.clearFilters}
            </Button>
            <DrawerClose asChild>
              <Button className="h-11 flex-1">
                {messages.show}
                <ResultCount
                  count={resultCount}
                  locale={locale}
                  announce={false}
                  variant="inline"
                  className="justify-start text-current"
                />
              </Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
