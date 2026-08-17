"use client";

import { SlidersHorizontal } from "lucide-react";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-provider";
import {
  FilterGroupList,
  type CardGroup,
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
  activeSectionCount: number;
  resultCount: number;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
} & FilterActionContract) {
  const { locale, messages, t } = useI18n();
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
        className="max-h-[85dvh] gap-0 overflow-y-auto px-5 pt-1"
      >
        <DrawerTitle className="mt-3 text-base">{messages.filters}</DrawerTitle>

        <div className="mt-4 space-y-6">
          <SpeciesTabs
            value={filters.species}
            onChange={onSpeciesChange}
            counts={speciesTally}
            fullWidth
          />

          <FilterGroupList
            filters={filters}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
            onToggleProperty={onToggleProperty}
            onToggleManyProperties={onToggleManyProperties}
            ageLayout="sheet"
          />
        </div>

        <div className="sticky bottom-0 -mx-5 mt-6 flex gap-3 border-t bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={onClearAll}>
            {messages.clear}
          </Button>
          <DrawerClose asChild>
            <Button className="flex-1">
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
