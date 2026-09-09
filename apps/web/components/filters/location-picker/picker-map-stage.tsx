import { MapAttribution } from "@/components/filters/map-attribution";
import { MapLegend } from "@/components/filters/map-legend";
import { ShelterMap } from "@/components/filters/shelter-map";
import { cn } from "@/lib/utils";
import { MAP_STAGE_TRANSITION_CLASS } from "./motion";
import type { LocationPickerController } from "./controller";

export function PickerMapStage({ controller }: { controller: LocationPickerController }) {
  const { panelOpen, sheetOpen, pins, selected, handlePick, setMapFacts, origin, expandedShelter, hoveredRowValue, searching, visibleRows, visibleOffRows, spotlitShelterId, setHoveredMarkerValues, setMarkersVisible, highlightedDensity, summaries, regionShelterNames, messages, markersVisible, setHighlightedDensity, hasSelected, hasMixed, hasEmpty, hasFilteredEmpty } = controller;
  return (
          <div
            data-map-stage={panelOpen ? "panel" : "rail"}
            className={cn(
              "absolute inset-x-0 top-0 bottom-(--picker-footer-h) flex flex-col gap-3 p-3 sm:p-4",
              "@container/map-stage",
              sheetOpen && "max-lg:hidden",
              "lg:right-auto",
              MAP_STAGE_TRANSITION_CLASS,
              panelOpen
                ? "lg:w-[calc(100%-24rem)]"
                : "lg:w-[calc(100%-3rem)]",
            )}
          >
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <ShelterMap
                pins={pins}
                selected={selected}
                onPick={handlePick}
                onFacts={setMapFacts}
                origin={origin}
                describedElsewhere={expandedShelter}
                highlightedValue={hoveredRowValue}
                matchedValues={
                  searching
                    ? [...visibleRows, ...visibleOffRows].map(
                        (row) => row.value,
                      )
                    : null
                }
                spotlightValues={spotlitShelterId ? [spotlitShelterId] : null}
                onHoverShelters={setHoveredMarkerValues}
                onMarkersVisible={setMarkersVisible}
                highlightedDensity={highlightedDensity}
                summaries={summaries}
                regionShelterNames={regionShelterNames}
                className="max-h-full lg:h-full"
              />
              <MapAttribution messages={messages} />
            </div>
            <div className="z-10 w-full shrink-0">
                <p className="mb-2 text-xs leading-snug text-muted-foreground">
                  {markersVisible ? messages.mapInstructionsDesktop : messages.mapInstructionsMobile}
                </p>
                <MapLegend
                  showDensity={pins.some((pin) => pin.count > 0)}
                  highlightedDensity={highlightedDensity}
                  onHoverDensity={setHighlightedDensity}
                  onLeaveDensity={() => setHighlightedDensity(null)}
                  hasSelectedRegion={hasSelected}
                  hasMixedRegion={hasMixed}
                  hasEmptyMarker={hasEmpty && markersVisible}
                  hasFilteredMarker={Boolean(hasFilteredEmpty) && markersVisible}
                  origin={origin}
                  messages={messages}
                />
            </div>
          </div>
  );
}
