"use client";

import { CountRoll } from "@/components/filters/filter-card";
import {
  FilterGroupList,
  type CardGroup,
  type CareSection,
  type GoodWithSection,
  type HomeSection,
} from "@/components/filters/filter-groups";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { useScrollEdgeFades } from "@/hooks/use-scroll-edge-fades";
import { activeFilterSectionCount } from "@/lib/filters";
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
  home,
  care,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onClearAll,
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
  onClearAll: () => void;
  className?: string;
} & FilterActionContract) {
  const { messages } = useI18n();
  const scrollRef = useScrollEdgeFades<HTMLElement>();
  // The chips row scrolls away with the page while the sidebar stays; this
  // count and its clear keep the state and the way out in view.
  const activeSections = activeFilterSectionCount(filters);

  return (
    <aside
      ref={scrollRef}
      // The negative margin and padding give focus rings room inside the
      // overflow clip. Hairlines between sections read the stack as one list.
      className={cn(
        "fade-scroll -mx-1 space-y-3 px-1 [&>section]:border-t [&>section]:border-border/60 [&>section]:pt-3",
        className,
      )}
    >
      {/* h-7 matches the species tabs across the gutter, so both columns
          start their content on the same line. */}
      <div className="flex h-7 items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {messages.filters}
          {activeSections > 0 && (
            <span className="inline-flex min-w-4.5 items-center justify-center rounded-full border border-[var(--filter-accent-border)]/50 bg-[var(--filter-accent)] px-1.5 py-px text-[10px] font-medium leading-none tabular-nums text-[var(--filter-accent-foreground)] animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
              <CountRoll value={activeSections} />
            </span>
          )}
        </h2>
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={onClearAll}
          aria-hidden={activeSections === 0}
          tabIndex={activeSections > 0 ? undefined : -1}
          className={cn(
            "h-auto p-0 text-[11px] font-normal text-muted-foreground transition-opacity hover:text-foreground",
            activeSections === 0 && "pointer-events-none opacity-0",
          )}
        >
          {messages.clearFilters}
        </Button>
      </div>

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
        collapsible
      />
    </aside>
  );
}
