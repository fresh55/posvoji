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
import { pickerFilterSummary } from "@/components/filters/location-picker/model";
import { Badge } from "@/components/ui/badge";
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
  onClearAll?: () => void;
  className?: string;
} & FilterActionContract) {
  const { messages, locale } = useI18n();
  const scrollRef = useScrollEdgeFades<HTMLElement>();
  // The chips row scrolls away with the page while the sidebar stays, so this
  // count keeps the state in view after the pills have gone. Selected values
  // and not sections, so it agrees with the row it outlives: a badge reading 1
  // above two chips was two answers to one question.
  const activeValues = activeFilterCount(filters);

  return (
    <aside
      ref={scrollRef}
      // The negative margin and padding give focus rings room inside the
      // overflow clip. Hairlines between sections read the stack as one list.
      //
      // fade-scroll-thin and not fade-scroll: the picker lists this fade is
      // shared with sit inside a dialog the visitor has just opened and are
      // read as scrollable, while this panel is fixed beside the results and
      // silently cut its last sections off on a short screen. It keeps the
      // same edge mask and adds a thin scrollbar (globals.css).
      className={cn(
        "fade-scroll-thin -mx-1 space-y-3 px-1 [&>section]:border-t [&>section]:border-border/60 [&>section]:pt-3",
        className,
      )}
    >
      {/* h-8 to match the results row across the gutter, which states the same
          height for itself (min-h-8 in animal-filters.tsx). The toolbar that
          carries it pins at top-0 and pads itself with --rail-pad, and the
          aside answers with lg:top-0 and the same padding (animal-grid.tsx),
          so the two columns start their content on one line both at rest and
          stuck, and the hairline over the first section below lands on the
          toolbar's border-b rather than 16px above it.

          The height is on the heading and not on a box around it. There were
          two children here until the clear went, and one child that is itself
          a flex row does not need a flex row around it.

          No clear in here. At lg the chips row beside the toolbar owns
          clearing, next to the pills it clears, and it is on screen whenever
          this head is: every active value draws a pill there except the
          species tab, which undoes itself in a press of its own. Each section
          keeps its Ponastavi for the one facet it holds. */}
      <h2 className="flex h-8 items-center gap-2 text-sm font-medium">
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
          filterSummary={pickerFilterSummary(filters, locale)}
          onClearFilters={onClearAll}
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
