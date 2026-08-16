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
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  SpeciesFilter,
  ToggleDef,
  ToggleKey,
} from "@/lib/filters";

export function FilterSheet({
  filters,
  groups,
  counts,
  speciesTally,
  toggles,
  toggleTally,
  activeCount,
  resultCount,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onSpeciesChange,
  onClearAll,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  speciesTally: Record<SpeciesFilter, number>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  activeCount: number;
  resultCount: number;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleMany: (group: MultiGroup, values: string[]) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onSpeciesChange: (species: SpeciesFilter) => void;
  onClearAll: () => void;
}) {
  const { locale, messages } = useI18n();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
          <SlidersHorizontal className="size-4" aria-hidden />
          {messages.filters}
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        closeLabel={messages.close}
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl px-5 pt-4"
      >
        <SheetTitle className="text-base">{messages.filters}</SheetTitle>

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
            ageLayout="sheet"
          />
        </div>

        <div className="sticky bottom-0 -mx-5 mt-6 flex gap-3 border-t bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={onClearAll}>
            {messages.clear}
          </Button>
          <SheetClose asChild>
            <Button className="flex-1">
              {messages.show}
              <ResultCount
                count={resultCount}
                locale={locale}
                announce={false}
                className="justify-start text-current"
              />
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
