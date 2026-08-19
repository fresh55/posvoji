"use client";

import {
  FilterGroupList,
  type CardGroup,
  type GoodWithSection,
} from "@/components/filters/filter-groups";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { useI18n } from "@/components/i18n-provider";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  ToggleDef,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

export function FilterSidebar({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  className,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  goodWith?: GoodWithSection;
  className?: string;
} & FilterActionContract) {
  const { messages } = useI18n();
  return (
    <aside className={cn("space-y-6", className)}>
      {/* h-7 matches the species tabs across the gutter, so both columns
          start their content on the same line. */}
      <div className="flex h-7 items-center">
        <h2 className="text-sm font-medium">{messages.filters}</h2>
      </div>

      <FilterGroupList
        filters={filters}
        groups={groups}
        counts={counts}
        toggles={toggles}
        toggleTally={toggleTally}
        goodWith={goodWith}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
        onToggleProperty={onToggleProperty}
        onToggleManyProperties={onToggleManyProperties}
      />
    </aside>
  );
}
