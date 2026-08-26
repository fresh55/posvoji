"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import {
  FilterGroupList,
  type CardGroup,
  type CareSection,
  type GoodWithSection,
  type HomeSection,
} from "@/components/filters/filter-groups";
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
import type {
  FilterOption,
  Filters,
  MultiGroup,
  ToggleDef,
} from "@/lib/filters";
import type { AnimalSort } from "@/lib/sort";

export function FilterSheet({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  home,
  care,
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
  activeCount: number;
  resultCount: number;
  /** Sorting is offered here on a phone, and only here. It is not a filter
   *  and does not join `Filters` (lib/sort.ts keeps the two apart on purpose,
   *  since one orders the list the other has already matched); what it shares
   *  with them is the sheet, because the sheet is the one surface a visitor
   *  can always reach to change what the grid shows. Baymard's product-list
   *  testing is what moved it here: sorting is a primary way people find
   *  things, often reached for before filtering, so the control has to stay
   *  reachable while the list is scrolled rather than scrolling away with the
   *  top of the page. */
  sort: AnimalSort;
  onSortChange: (sort: AnimalSort) => void;
  onClearAll: () => void;
} & FilterActionContract) {
  const { locale, messages, t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  return (
    <Drawer>
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
        className="flex max-h-[72dvh] flex-col gap-0 pt-1"
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
