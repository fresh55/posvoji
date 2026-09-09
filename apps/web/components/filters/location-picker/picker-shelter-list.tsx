import { ShelterRows } from "@/components/filters/shelter-rows";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { filteredAnimalCount } from "@/lib/labels";
import { ChevronRight } from "lucide-react";
import type { LocationPickerController } from "./controller";

export function PickerShelterList({ controller }: { controller: LocationPickerController }) {
  const { visibleOffRows, detailBase, hoveredMarkerValues, hoverScrollTo, setHoveredRowValue, messages, offGroupId, listRef, visibleRows, query, setQuery, searchRef, counts, selected, onToggle, summaries, expandedShelter, toggleExpandedShelter, t, rowRefs, locale, offGroupHeading, offGroupOpen, setOffGroupOpen } = controller;
  const offGroupList = (
    <ShelterRows
      rows={visibleOffRows.map((row) => ({
        value: row.value,
        label: row.label,
        city: row.city,
        km: row.km,
        href: `${detailBase}/${row.value}`,
      }))}
      highlighted={hoveredMarkerValues ?? undefined}
      scrollTo={hoverScrollTo}
      onHoverRow={setHoveredRowValue}
      lessThanOneKm={messages.lessThanOneKm}
      labelledBy={offGroupId}
      className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
    />
  );
  return (
                <div
                  ref={listRef}
                  data-picker-list-scroll
                  className="mt-2 min-h-0 flex-1 overflow-y-auto max-lg:min-h-20 [scrollbar-width:thin]"
                >
                  {visibleRows.length === 0 &&
                  visibleOffRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        {messages.noSheltersFound} »{query.trim()}«
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          searchRef.current?.focus();
                        }}
                        className="max-lg:min-h-11"
                      >
                        {messages.clearSearch}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <ShelterRows
                        rows={visibleRows}
                        counts={counts}
                        selected={selected}
                        onToggle={onToggle}
                        summaries={summaries}
                        expanded={expandedShelter}
                        onToggleExpanded={toggleExpandedShelter}
                        infoLabel={(rowLabel) =>
                          t("showShelterDetails", { label: rowLabel })
                        }
                        hideInfoLabel={(rowLabel) =>
                          t("hideShelterDetailsFor", { label: rowLabel })
                        }
                        infoText={messages.showShelterDetailsShort}
                        hideInfoText={messages.hideShelterDetails}
                        refs={rowRefs}
                        highlighted={hoveredMarkerValues ?? undefined}
                        scrollTo={hoverScrollTo}
                        onHoverRow={setHoveredRowValue}
                        onExitTop={() => searchRef.current?.focus()}
                        lessThanOneKm={messages.lessThanOneKm}
                        waitLabel={(duration) => locale === "sl" ? `Najdlje čaka: ${duration}` : `Longest wait: ${duration}`}
                        countLabel={(count) => filteredAnimalCount(count, locale)}
                        className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
                      />
                      {visibleOffRows.length > 0 &&
                        (visibleRows.length === 0 ? (
                          <div className="mt-3">
                            <p
                              id={offGroupId}
                              className="px-2 pb-2 text-xs font-medium text-muted-foreground"
                            >
                              {offGroupHeading}
                            </p>
                            {offGroupList}
                          </div>
                        ) : (
                          <Collapsible
                            open={offGroupOpen}
                            onOpenChange={setOffGroupOpen}
                            className="mt-3"
                          >
                            <CollapsibleTrigger
                              id={offGroupId}
                              className="group flex min-h-11 w-full items-center gap-2 rounded-ui px-2 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                            >
                              <ChevronRight
                                className="size-3 shrink-0 transition-transform group-data-open:rotate-90 motion-reduce:transition-none"
                                aria-hidden
                              />
                              {offGroupHeading}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-1">
                              {offGroupList}
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                    </>
                  )}
                </div>
  );
}
