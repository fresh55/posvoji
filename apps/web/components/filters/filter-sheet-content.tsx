"use client";

import { Undo2, X } from "lucide-react";
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

import { speciesScopeLabel } from "@/lib/labels";
import { SCROLL_BOX_MARK } from "@/lib/scroll-strip";
import { cn } from "@/lib/utils";
import {
  SORT_ROW_HIDDEN,
  type FilterSheetProps,
} from "./filter-sheet-contract";

// Vaul holds the scroll lock until its close animation finishes.
const DRAWER_CLOSE_MS = 500;

const SORT_CAPTION_CLASS = cn(SECTION_LABEL_CLASS, "mt-3", SORT_ROW_HIDDEN);
const SORT_ROW_CLASS = cn("mt-1.5 h-11 w-full text-sm", SORT_ROW_HIDDEN);

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
  home,
  care,
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

  const sortCaptionId = useId();

  // Keep focus in the drawer when a filter removes its own control.
  const contentRef = useRef<HTMLDivElement>(null);

  const close = () => {
    onOpenChange(false);
    setScrolled(false);
  };

  // Open the map after the drawer releases its scroll lock and focus trap.
  const openScope = () => {
    close();
    window.setTimeout(() => scope?.onOpen(), DRAWER_CLOSE_MS);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
        } else close();
      }}
    >
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent
        ref={contentRef}
        closeLabel={messages.close}
        className="flex max-h-[72dvh] flex-col gap-0 pt-1 [&>button]:pointer-coarse:size-11 short:max-h-[calc(100dvh-2rem)]"
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
        </div>

        <div
          // The sheet's own scrolling box, marked for the same reason the
          // sidebar's is: a section opened in here pulls itself into this box
          // and not into the page behind it (lib/scroll-strip.ts).
          {...{ [SCROLL_BOX_MARK]: "" }}
          onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          className={cn(
            "flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 scrollbar-thin",
            SHEET_BLOCK_CHILDREN_CLASS,
          )}
        >
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
            home={home}
            care={care}
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
