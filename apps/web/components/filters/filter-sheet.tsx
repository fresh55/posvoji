"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
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
import { useDesktopBreakpointClose } from "@/hooks/use-desktop-breakpoint-close";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  ToggleDef,
} from "@/lib/filters";
import type { AnimalSort } from "@/lib/sort";

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
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onClearAll,
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
  /** Sorting is offered here on a phone, and only here. It is not a filter
   *  and does not join `Filters` (lib/sort.ts keeps the two apart on purpose,
   *  since one orders the list the other has already matched); what it shares
   *  with them is the sheet, because the sheet is the one surface a visitor
   *  can always reach to change what the grid shows. */
  sort: AnimalSort;
  onSortChange: (sort: AnimalSort) => void;
  onClearAll: () => void;
} & FilterActionContract) {
  const { locale, messages, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // FilterSheet never unmounts, so a divider left "scrolled" from a previous
  // visit would otherwise still be there the next time the sheet opens at
  // scrollTop 0. Every way out goes through here rather than through an
  // effect watching `open`, so there is one close path and no render that
  // paints the stale divider before the effect clears it.
  const close = () => {
    setOpen(false);
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

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DrawerTrigger asChild>
        <Button
          size="sm"
          aria-label={
            activeCount > 0
              ? t("filtersWithCount", { count: activeCount })
              : messages.filters
          }
          className="h-11 gap-1.5 rounded-ui px-3"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {messages.filters}
          {activeCount > 0 && (
            <>
              <Badge
                variant="secondary"
                aria-hidden="true"
                className="hidden h-5 min-w-5 rounded-full px-1 text-xs tabular-nums min-[360px]:inline-flex"
              >
                {activeCount}
              </Badge>
              {/* Below 360px the full badge doesn't fit the trigger, but the
                  aria-label still announces the count, so sighted users need
                  some visible sign filters are active. A dot is that sign. */}
              <span
                aria-hidden="true"
                className="inline-block size-1.5 shrink-0 rounded-full bg-background min-[360px]:hidden"
              />
            </>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        closeLabel={messages.close}
        // 72dvh, down from a full 85dvh takeover: the sheet used to open the
        // visitor onto a blind list with the count in the footer as the only
        // feedback on what narrowed. The lower cap leaves the top card row
        // showing behind the sheet, so a choice still reads against the grid
        // it changed. Vaul snap points were tried instead and dropped: they
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
        className="flex max-h-[72dvh] flex-col gap-0 pt-1 short:max-h-[calc(100dvh-2rem)]"
      >
        {/* The species tabs used to repeat here, but the visitor just used
            that same row in the sticky bar behind the trigger to get here, so
            a second copy only cost the sheet 56px of a phone's short 85dvh. */}
        <div
          data-slot="filter-sheet-header"
          data-scrolled={scrolled ? "" : undefined}
          className="shrink-0 border-b border-transparent px-5 pb-3 data-scrolled:border-border"
        >
          {/* Sort on its own full-width row under the title, and inside the
              header block rather than the scrolling body, so it stays put
              while the filter list moves under it.

              It shared the title's row for one pass and could not: the close
              button is absolutely positioned in that corner at 44px, and the
              two targets overlapped by 32x14px with the X on top, so the top
              right of the sort control closed the sheet instead of opening
              it. Measured, not guessed. Padding the row clear of the X would
              have fixed the collision and left three things crowded into one
              band anyway.

              A row costs about 52px of the sheet, which is affordable because
              the control is one Select and not the five orders spelled out:
              the filters still begin about a quarter of the way down. Full
              width also stops the longest order from truncating, and reads as
              a setting for the whole sheet rather than an ornament on the
              heading. */}
          <DrawerTitle className="mt-3 text-base">
            {messages.filters}
          </DrawerTitle>
          <SortPicker
            value={sort}
            onChange={onSortChange}
            quiet={false}
            className="mt-3 h-11 w-full text-sm"
          />
        </div>

        <div
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pt-4 pb-6"
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
            >
              <RemovableChips chips={scope.chips} className="mt-2" />
            </LocationScopeRow>
          )}

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
            ageLayout="sheet"
          />
        </div>

        <div className="flex shrink-0 gap-3 border-t bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            className="h-11"
            disabled={activeCount === 0}
            onClick={onClearAll}
          >
            {messages.clearAll}
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
      </DrawerContent>
    </Drawer>
  );
}
