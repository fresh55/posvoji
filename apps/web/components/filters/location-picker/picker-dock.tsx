import { ChevronLeft, ChevronRight, List, LoaderCircle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PANEL_TRANSITION_CLASS } from "./motion";
import { pickerText } from "./model";
import { COUNT_PILL_CLASS } from "./picker-scope";
import { PickerSearch } from "./picker-search";
import { PickerShelterList } from "./picker-shelter-list";
import type { LocationPickerController } from "./controller";

export function PickerDock({ controller }: { controller: LocationPickerController }) {
  const { panelOpen, sheetOpen, setPanelOpen, messages, selected, label, filterSummary, locale, resolved, toggleNearby, nearbyOn, state, onToggleMany, missing } = controller;
  const scopeHeadLabel = <span className="min-w-0 truncate text-sm font-medium">{label}</span>;
  return (
          <div
            data-picker-panel={panelOpen ? "open" : "collapsed"}
            data-picker-sheet={sheetOpen ? "open" : "collapsed"}
            className={cn(
              "absolute inset-x-0 top-0 bottom-(--picker-footer-h) z-20 flex flex-col overflow-hidden bg-background",
              PANEL_TRANSITION_CLASS,
              !sheetOpen && "max-lg:hidden",
              "lg:inset-x-auto lg:right-0 lg:border-l",
              panelOpen ? "lg:w-96" : "lg:w-12 lg:justify-center",
            )}
          >
              <div
                data-picker-panel-head={panelOpen || undefined}
                className={cn("hidden shrink-0 items-center lg:flex", panelOpen ? "h-14 justify-between gap-2 px-4" : "justify-center")}
              >
                {panelOpen && (
                <span className="flex min-w-0 items-center gap-2">
                  {scopeHeadLabel}
                </span>
                )}
                <Button
                  variant="ghost"
                  data-picker-collapse={panelOpen || undefined}
                  data-picker-rail={!panelOpen || undefined}
                  aria-expanded={panelOpen}
                  aria-label={panelOpen ? messages.collapsePanel : messages.expandPanel}
                  onClick={() => setPanelOpen((current) => !current)}
                  className={cn("shrink-0 text-muted-foreground", panelOpen ? "size-11 p-0" : "h-auto min-h-28 w-full flex-col gap-3 rounded-none px-1 py-4")}
                >
                  {panelOpen ? <ChevronRight className="size-4" aria-hidden /> : <>
                    <ChevronLeft className="size-4" aria-hidden />
                    <List className="size-4" aria-hidden />
                    {selected.length > 0 && <span className={COUNT_PILL_CLASS}>{selected.length}</span>}
                  </>}
                </Button>
              </div>
            {(panelOpen || sheetOpen) && (
              <div
                data-picker-panel-content
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 lg:pt-0",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
                <p data-picker-filter-context className="mb-3 shrink-0 text-xs leading-snug text-muted-foreground">
                  {filterSummary ? `${filterSummary}. ` : ""}{pickerText[locale].countsMatch}
                </p>
                <PickerSearch controller={controller} />
                <div className="mt-2 flex shrink-0 items-center justify-between gap-1 border-b pb-2">
                  {resolved.source !== "typed" && (
                    <Button
                      variant="ghost"
                      onClick={toggleNearby}
                      aria-pressed={nearbyOn}
                      className={cn(
                        "h-11 w-fit gap-1.5 px-2 text-xs",
                        nearbyOn
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {state.status === "locating" ? (
                        <LoaderCircle
                          className="size-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : (
                        <Navigation className="size-3.5" aria-hidden />
                      )}
                      {state.status === "locating"
                        ? messages.locating
                        : messages.nearestFirst}
                    </Button>
                  )}
                  {selected.length > 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => onToggleMany(selected)}
                      className="ml-auto h-11 px-2 text-xs text-muted-foreground"
                    >
                      {pickerText[locale].clearSelection} ({selected.length}
                      )
                    </Button>
                  )}
                </div>
                <PickerShelterList controller={controller} />
                <p className="mt-3 shrink-0 text-xs leading-snug text-muted-foreground empty:hidden">
                  {missing}
                </p>
              </div>
            )}
          </div>
  );
}
