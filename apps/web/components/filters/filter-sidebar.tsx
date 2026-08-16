"use client";

import {
  FilterGroupList,
  type CardGroup,
} from "@/components/filters/filter-groups";
import { useI18n } from "@/components/i18n-provider";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  ToggleDef,
  ToggleKey,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

export function FilterSidebar({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  hasActiveFilters,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onClearAll,
  className,
}: {
  filters: Filters;
  groups: { group: CardGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  hasActiveFilters: boolean;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleMany: (group: MultiGroup, values: string[]) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onClearAll: () => void;
  className?: string;
}) {
  const { messages } = useI18n();
  return (
    <aside className={cn("space-y-6", className)}>
      {/* h-7 matches the species tabs across the gutter, so both columns
          start their content on the same line. */}
      <div className="flex h-7 items-center justify-between">
        <h2 className="text-sm font-medium">{messages.filters}</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {messages.clear}
          </button>
        )}
      </div>

      <FilterGroupList
        filters={filters}
        groups={groups}
        counts={counts}
        toggles={toggles}
        toggleTally={toggleTally}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
        onToggleProperty={onToggleProperty}
      />
    </aside>
  );
}
