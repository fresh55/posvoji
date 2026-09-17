import { ChevronLeft, ChevronRight, List, LoaderCircle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PANEL_TRANSITION_CLASS } from "./motion";
import { pickerText } from "./model";
import { COUNT_PILL_CLASS } from "./picker-scope";
import { PickerSearch } from "./picker-search";
import { PickerShelterList } from "./picker-shelter-list";
import type { LocationPickerController } from "./controller";

export function PickerDock({ controller }: { controller: LocationPickerController }) {
  const { panelOpen, sheetOpen, setPanelOpen, messages, selected, label, filterSummary, locale, resolved, toggleNearby, nearbyOn, state, onToggleMany, missing, searchRef } = controller;
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
                {/* The provider and the trigger are mounted in both states, so
                    folding the panel keeps the same DOM node and the keyboard
                    focus that pressed it. Only the words come and go: the rail
                    is icon-only and 47px wide, so it is named the way every
                    other icon-only control in this picker is, while the open
                    panel states its scope in words beside the chevron. */}
                <TooltipProvider>
                <Tooltip>
                <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  data-picker-collapse={panelOpen || undefined}
                  data-picker-rail={!panelOpen || undefined}
                  aria-expanded={panelOpen}
                  aria-label={panelOpen ? messages.collapsePanel : messages.expandPanel}
                  onClick={() => setPanelOpen((current) => !current)}
                  className={cn(
                    "shrink-0 text-muted-foreground",
                    panelOpen
                      // The shared ghost variant fills any aria-expanded
                      // control, and this one sat in a permanent grey square at
                      // 1.09:1 against the panel. The attribute is what says
                      // the panel is open, so it stays and the fill is beaten
                      // instead; hover gets the fill back.
                      ? "size-11 p-0 aria-expanded:bg-transparent aria-expanded:text-muted-foreground hover:aria-expanded:bg-muted hover:aria-expanded:text-foreground"
                      : "h-auto min-h-28 w-full flex-col gap-3 rounded-none px-1 py-4",
                  )}
                >
                  {panelOpen ? <ChevronRight className="size-4" aria-hidden /> : <>
                    <ChevronLeft className="size-4" aria-hidden />
                    <List className="size-4" aria-hidden />
                    {/* bg-background, not the pill's own bg-muted: the rail
                        brightens to that same muted token on hover, and the
                        pill vanished into it leaving a bare digit. */}
                    {selected.length > 0 && <span className={cn(COUNT_PILL_CLASS, "bg-background")}>{selected.length}</span>}
                  </>}
                </Button>
                </TooltipTrigger>
                {!panelOpen && (
                  <TooltipContent side="left" sideOffset={6}>{messages.expandPanel}</TooltipContent>
                )}
                </Tooltip>
                </TooltipProvider>
              </div>
            {(panelOpen || sheetOpen) && (
              <div
                data-picker-panel-content
                className={cn(
                  // short:py-2 keeps the whole column inside its box on a
                  // landscape phone. Without it the surplus fell to this
                  // scroller, and a finger on the search field dragged the
                  // panel instead of the list, sliding the field under the
                  // header.
                  "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 short:py-2 lg:pt-0",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
                <p data-picker-filter-context className="mb-3 shrink-0 text-xs leading-snug text-muted-foreground short:mb-1">
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
                      // The button unmounts with the selection it clears, so it
                      // hands focus to the search field first; otherwise the
                      // next Tab restarts at the dialog root, past the map.
                      onClick={() => {
                        searchRef.current?.focus({ preventScroll: true });
                        onToggleMany(selected);
                      }}
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
