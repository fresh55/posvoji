"use client";

import { FilterGroup, TogglePills } from "@/components/filters/filter-groups";
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
  onToggleProperty,
  onClearAll,
  className,
}: {
  filters: Filters;
  groups: { group: MultiGroup; options: FilterOption[] }[];
  counts: Record<MultiGroup, Map<string, number>>;
  toggles: ToggleDef[];
  toggleTally: Map<string, number>;
  hasActiveFilters: boolean;
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onClearAll: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("space-y-7", className)}>
      {/* h-7 matches the species tabs across the gutter, so both columns
          start their content on the same line. */}
      <div className="flex h-7 items-center justify-between">
        <h2 className="text-sm font-medium">Filtri</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Počisti
          </button>
        )}
      </div>

      {groups.map(({ group, options }) => (
        <FilterGroup
          key={group}
          group={group}
          options={options}
          counts={counts[group]}
          selected={filters[group]}
          onToggle={(value) => onToggle(group, value)}
        />
      ))}

      {toggles.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Zdravje
          </h3>
          <TogglePills
            toggles={toggles}
            counts={toggleTally}
            selected={filters.toggles}
            onToggle={(key) => onToggleProperty(key as ToggleKey)}
          />
        </section>
      )}
    </aside>
  );
}
