"use client";

import { Undo2, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useId, useRef, useState, type ReactNode } from "react";
import { ResultCount } from "@/components/filters/result-count";
import { useI18n } from "@/components/i18n-context";
import { RemovableChips } from "@/components/filters/filter-chips";
import { FilterGroupList } from "@/components/filters/filter-groups";
import { SECTION_LABEL_CLASS } from "@/components/filters/filter-section-header";
import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { SortPicker } from "@/components/filters/sort-picker";
import { SpeciesGlyphIcon } from "@/components/filters/species-glyph";
import { layerEntryKey } from "@/hooks/use-picker-history";
import { usePressedRowAnchor } from "@/hooks/use-pressed-row-anchor";

import { speciesScopeLabel } from "@/lib/labels";
import { SCROLL_BOX_MARK } from "@/lib/scroll-strip";
import { cn } from "@/lib/utils";
import {
  SORT_ROW_HIDDEN,
  type FilterSheetProps,
} from "./filter-sheet-contract";

/**
 * When the Kje row asks for the map, in ms after the sheet starts to close.
 *
 * The sheet takes 500ms to slide out, but it is 96% of the way down by 300
 * (its top at 819 of 844 at 390x844, measured), and waiting out the rest
 * left the page bare for about 300ms before the map began to open. Nothing
 * the wait was for needs the rest of it: the sheet stops trapping focus the
 * moment it closes, the two scroll locks are counted
 * (react-remove-scroll-bar), so the page stays locked until the later of them
 * goes, and the close's own focus return is held off below (handingOff), so
 * it cannot pull focus out of the map. What does have to be over is the
 * sheet's history entry, or the map's would be pushed on top of an entry
 * whose pop is still on its way and would take the map down with it; that
 * pop measured about 50ms, and the handoff waits for it if it is late.
 */
export const PICKER_HANDOFF_MS = 300;

/** The longest the handoff waits for that pop, from the press. */
const PICKER_HANDOFF_LIMIT_MS = 1000;

/**
 * The sort caption and control, first in the sheet's scrolling body.
 *
 * They were pinned in the sheet's header, so all 78px of them stood over the
 * sections for as long as the sheet was open, and the sections had 388px left
 * at 390x844, 189 at 320x568 and 138 at 844x390. In the body they are the
 * first thing seen on opening and scroll away with the rest, which gives the
 * sections 466, 267 and 216. Order is read once and then left alone; the
 * sections are what a visitor works through.
 *
 * SORT_ROW_HIDDEN on the block, so the caption and the control leave together
 * wherever the toolbar carries the order instead, and the body's gap goes
 * with them. The caption is the section headings' voice and height (min-h-5,
 * then 8px to the control), so the block reads as one more section.
 */
const SORT_CAPTION_CLASS = cn(SECTION_LABEL_CLASS, "flex min-h-5 items-center");
const SORT_ROW_CLASS = "mt-2 h-11 w-full text-sm";

const SHEET_BLOCK_CLASS = "sm:mx-auto sm:w-[min(28rem,100%)]";

const SHEET_BLOCK_CHILDREN_CLASS =
  "[&>*]:sm:mx-auto [&>*]:sm:w-[min(28rem,100%)]";

export function FilterSheetContent({
  open,
  trigger,
  filters,
  groups,
  counts,
  toggles,
  toggleTally,
  goodWith,
  care,
  unanswered,
  scope,
  activeCount,
  resultCount,
  sort,
  onSortChange,
  onSpeciesChange,
  onToggle,
  onToggleMany,
  onToggleProperty,
  onToggleManyProperties,
  onClearAll,
  undo,
  onOpenChange,
}: Omit<FilterSheetProps, "onOpenChange"> & {
  open: boolean;
  trigger: ReactNode;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale, messages, t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReducedMotion();

  const sortCaptionId = useId();
  const pressedRowAnchor = usePressedRowAnchor();

  // Keep focus in the drawer when a filter removes its own control.
  const contentRef = useRef<HTMLDivElement>(null);
  // Set while the sheet closes in order to open the map. The sheet's content
  // unmounts at the end of its slide, and Radix then hands focus back to the
  // Filtri trigger, which by then sits behind the open map: measured, focus
  // left the map for the trigger and the map's trap pulled it back.
  const handingOff = useRef(false);

  const close = () => {
    onOpenChange(false);
    setScrolled(false);
  };

  // Down first, then the map (PICKER_HANDOFF_MS). Under reduced motion the
  // sheet leaves in one frame (globals.css), so only the pop is waited for.
  const openScope = () => {
    handingOff.current = true;
    // The sheet's own entry, the one whose pop the map has to wait out.
    const entry = layerEntryKey();
    close();
    const asked = performance.now();
    const handOff = () => {
      if (
        entry !== undefined &&
        layerEntryKey() === entry &&
        performance.now() - asked < PICKER_HANDOFF_LIMIT_MS
      ) {
        window.setTimeout(handOff, 20);
        return;
      }
      scope?.onOpen();
    };
    window.setTimeout(handOff, reduceMotion ? 0 : PICKER_HANDOFF_MS);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) {
          handingOff.current = false;
          onOpenChange(true);
        } else close();
      }}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent
        ref={contentRef}
        closeLabel={messages.close}
        className="flex max-h-[72dvh] flex-col gap-0 pt-1 [&>button]:pointer-coarse:size-11 short:max-h-[calc(100dvh-2rem)]"
        onCloseAutoFocus={(event) => {
          // The map is taking focus instead (handingOff above).
          if (!handingOff.current) return;
          handingOff.current = false;
          event.preventDefault();
        }}
      >
        <div
          data-slot="filter-sheet-header"
          data-scrolled={scrolled ? "" : undefined}
          className="shrink-0 border-b border-transparent px-5 pb-3 data-scrolled:border-border"
        >
          <div className={SHEET_BLOCK_CLASS}>
            <div className="mt-3 flex min-w-0 items-center gap-3 pe-12">
              <DrawerTitle className="text-base">
                {messages.filters}
              </DrawerTitle>
              {filters.species !== "all" && (
                <button
                  type="button"
                  data-slot="species-scope"
                  onClick={() => {
                    contentRef.current?.focus();
                    onSpeciesChange("all");
                  }}
                  aria-label={t("speciesScope", {
                    label: speciesScopeLabel(filters.species, locale),
                  })}
                  className="inline-flex h-8 min-w-0 touch-manipulation select-none items-center gap-1.5 rounded-ui bg-foreground px-2.5 text-sm text-background outline-none focus-visible:ring-3 focus-visible:ring-ring pointer-coarse:tap-target"
                >
                  <SpeciesGlyphIcon tab={filters.species} />
                  <span className="min-w-0 truncate">
                    {speciesScopeLabel(filters.species, locale)}
                  </span>
                  <X aria-hidden className="size-3.5 shrink-0 opacity-70" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          // The sheet's own scrolling box, marked for the same reason the
          // sidebar's is: a section opened in here pulls itself into this box
          // and not into the page behind it (lib/scroll-strip.ts).
          {...{ [SCROLL_BOX_MARK]: "" }}
          // A pick can grow a section above the tile that took it; the tile
          // stays under the finger (hooks/use-pressed-row-anchor.ts).
          {...pressedRowAnchor}
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          className={cn(
            "flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 scrollbar-thin",
            SHEET_BLOCK_CHILDREN_CLASS,
          )}
        >
          <div data-slot="sheet-sort" className={SORT_ROW_HIDDEN}>
            <div id={sortCaptionId} className={SORT_CAPTION_CLASS}>
              {messages.sortCaption}
            </div>
            <SortPicker
              value={sort}
              onChange={onSortChange}
              labelledBy={sortCaptionId}
              className={SORT_ROW_CLASS}
            />
          </div>

          {scope && (
            <LocationScopeRow
              options={scope.options}
              counts={scope.counts}
              offSite={scope.offSite}
              selected={scope.selected}
              onOpen={openScope}
              onReset={scope.onReset}
              layout="row"
            >
              <RemovableChips chips={scope.chips} className="mt-2" />
            </LocationScopeRow>
          )}

          <FilterGroupList
            filters={filters}
            groups={groups}
            counts={counts}
            toggles={toggles}
            toggleTally={toggleTally}
            goodWith={goodWith}
            care={care}
            unanswered={unanswered}
            onToggle={onToggle}
            onToggleMany={onToggleMany}
            onToggleProperty={onToggleProperty}
            onToggleManyProperties={onToggleManyProperties}
            layout="sheet"
          />
        </div>

        <div className="shrink-0 border-t bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className={cn("flex gap-3", SHEET_BLOCK_CLASS)}>
            <Button
              variant="ghost"
              className="h-11"
              disabled={activeCount === 0 && !undo}
              onClick={activeCount === 0 && undo ? undo : onClearAll}
              aria-label={
                activeCount === 0 && undo
                  ? messages.undoClearFilters
                  : undefined
              }
            >
              {activeCount === 0 && undo ? (
                <>
                  <Undo2 className="size-4" aria-hidden />
                  {messages.undoClear}
                </>
              ) : (
                messages.clearFilters
              )}
            </Button>
            <DrawerClose asChild>
              <Button className="h-11 flex-1">
                {messages.show}
                <ResultCount
                  count={resultCount}
                  locale={locale}
                  announce={false}
                  variant="inline"
                  className="justify-start text-current"
                />
              </Button>
            </DrawerClose>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
