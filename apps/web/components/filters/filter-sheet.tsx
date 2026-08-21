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
import { SpeciesTabs } from "@/components/filters/species-tabs";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
} from "@/lib/filters";

export function FilterSheet({
  filters,
  groups,
  counts,
  speciesTally,
  toggles,
  toggleTally,
  goodWith,
  home,
  care,
  activeSectionCount,
  resultCount,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onSpeciesChange,
  onClearAll,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  speciesTally: Record<SpeciesFilter, number>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  home?: HomeSection;
  care?: CareSection;
  activeSectionCount: number;
  resultCount: number;
  onSpeciesChange: (species: SpeciesFilter) => void;
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
            activeSectionCount > 0
              ? t("filtersWithCount", { count: activeSectionCount })
              : messages.filters
          }
          className="h-11 gap-1.5 rounded-ui px-3"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {messages.filters}
          {activeSectionCount > 0 && (
            <Badge
              variant="secondary"
              aria-hidden="true"
              className="hidden h-5 min-w-5 rounded-full px-1 text-xs tabular-nums min-[360px]:inline-flex"
            >
              {activeSectionCount}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent
        closeLabel={messages.close}
        className="flex max-h-[85dvh] flex-col gap-0 pt-1"
      >
        <div data-slot="filter-sheet-header" className="shrink-0 px-5 pb-3">
          <DrawerTitle className="mt-3 text-base">
            {messages.filters}
          </DrawerTitle>
        </div>

        <div
          data-scrolled={scrolled ? "" : undefined}
          className="shrink-0 border-b border-transparent px-5 pb-4 data-scrolled:border-border"
        >
          <SpeciesTabs
            value={filters.species}
            onChange={onSpeciesChange}
            counts={speciesTally}
            fullWidth
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
            disabled={activeSectionCount === 0}
            onClick={onClearAll}
          >
            {messages.clear}
          </Button>
          <DrawerClose asChild>
            <Button className="h-11 flex-1">
              {messages.show}
              <ResultCount
                count={resultCount}
                species={filters.species}
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
