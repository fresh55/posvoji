"use client";

import { LazyMotion, domAnimation } from "motion/react";
import { CountRoll } from "@/components/filters/filter-card";
import {
  FilterGroupList,
  type CardGroup,
  type CareSection,
  type GoodWithSection,
  type HomeSection,
} from "@/components/filters/filter-groups";
import type { FilterActionContract } from "@/components/filters/filter-contract";
import { Badge } from "@/components/ui/badge";
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
            // Same badge the mobile sheet already shows next to "Filtri". Its
            // own LazyMotion: unlike the sections below, nothing here already
            // opens one for CountRoll to read domAnimation from.
            <LazyMotion features={domAnimation}>
              <Badge
                variant="secondary"
                // motion-reduce:duration-0, not motion-reduce:animate-none:
                // see the comment on DialogOverlay in ui/dialog.tsx for why
                // the animate-none guard does not actually take effect here.
                className="h-5 min-w-5 rounded-full px-1 text-xs tabular-nums animate-in fade-in zoom-in-95 duration-200 motion-reduce:duration-0"
              >
                <CountRoll value={activeSections} />
              </Badge>
            </LazyMotion>
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
            "h-auto p-0 text-2xs font-normal text-muted-foreground transition-opacity hover:text-foreground",
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
