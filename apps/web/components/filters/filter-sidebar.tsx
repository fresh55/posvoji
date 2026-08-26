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
import { LocationPicker } from "@/components/filters/location-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { useScrollEdgeFades } from "@/hooks/use-scroll-edge-fades";
import { activeFilterCount } from "@/lib/filters";
import type {
  FilterOption,
  Filters,
  MultiGroup,
  ToggleDef,
} from "@/lib/filters";
import type { LookupEntry } from "@/lib/municipality-coverage";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { cn } from "@/lib/utils";

/** Everything the panel's Kje row needs, absent when the dataset has no
 *  shelters to choose between. The dialog behind the row is the picker's own,
 *  so this is what the picker asks for less the two toggles the panel already
 *  carries. */
export type SidebarScope = {
  options: FilterOption[];
  counts: Map<string, number>;
  municipalities?: LookupEntry[];
  offSite?: FilterOption[];
  summaries?: Map<string, ShelterSummary>;
  resultCount: number;
};

export function FilterSidebar({
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  home,
  care,
  scope,
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
  scope?: SidebarScope;
  onClearAll: () => void;
  className?: string;
} & FilterActionContract) {
  const { messages } = useI18n();
  const scrollRef = useScrollEdgeFades<HTMLElement>();
  // The chips row scrolls away with the page while the sidebar stays; this
  // count and its clear keep the state and the way out in view. Selected
  // values and not sections, so it agrees with the row it outlives: a badge
  // reading 1 above two chips was two answers to one question.
  const activeValues = activeFilterCount(filters);

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
          {activeValues > 0 && (
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
                <CountRoll value={activeValues} />
              </Badge>
            </LazyMotion>
          )}
        </h2>
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={onClearAll}
          aria-hidden={activeValues === 0}
          tabIndex={activeValues > 0 ? undefined : -1}
          className={cn(
            "h-auto p-0 text-2xs font-normal text-muted-foreground transition-opacity hover:text-foreground",
            activeValues === 0 && "pointer-events-none opacity-0",
          )}
        >
          {messages.clearAll}
        </Button>
      </div>

      {/* Kje first, above every folding section. It is the question a visitor
          answers before any of the others -- how far they are willing to go --
          and at lg it is the only place shelter is asked at all now: the
          toolbar's own picker trigger stands down wherever this panel is
          drawn (animal-filters.tsx).

          No chips under it. The sticky chips row above the grid already draws
          a removable pill per picked shelter at this width, and a second copy
          eighteen pixels to the left would be the same removal twice. */}
      {scope && (
        <LocationPicker
          dress="sidebar"
          options={scope.options}
          counts={scope.counts}
          selected={filters.shelter}
          onToggle={(value) => onToggle("shelter", value)}
          onToggleMany={(values) => onToggleMany("shelter", values)}
          resultCount={scope.resultCount}
          municipalities={scope.municipalities}
          offSite={scope.offSite}
          summaries={scope.summaries}
          deepLink="desktop"
        />
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
        collapsible
      />
    </aside>
  );
}
