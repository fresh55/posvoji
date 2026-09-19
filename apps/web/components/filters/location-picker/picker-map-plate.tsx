import { MapAttribution } from "@/components/filters/map-attribution";
import { MapLegend } from "@/components/filters/map-legend";
import { ShelterMap } from "@/components/filters/shelter-map";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { LocationPickerController } from "./controller";
import regionShelterNamesData from "@/lib/region-shelter-names.json";
import { shelterNamesByRegion } from "./municipality-places";
import { useClientPayload } from "@/hooks/use-client-payload";
import { DeferredStatus } from "@/components/deferred-status";
import type { LookupEntry } from "@/lib/municipality-coverage";

// What the stage puts on its plate: the country map, its credit, the line that
// says how to work it, and the legend under it. Split from the box it stands
// in (picker-map-stage.tsx) so all of it, the map's geography and relief and
// the municipality centroid table below, is fetched by the press that opens
// the picker rather than by the home page's first paint.
//
// Only ever mounted while the dialog is open, which is what lets the region
// names below be computed unconditionally: the memo used to live in the
// controller with an `open` guard on it, and the guard is now the mount.
export function PickerMapPlate({
  controller,
}: {
  controller: LocationPickerController;
}) {
  const {
    pins,
    selected,
    handlePick,
    setMapFacts,
    origin,
    expandedShelter,
    hoveredRow,
    searching,
    visibleRows,
    visibleOffRows,
    spotlitShelterId,
    setHoveredMarkerValues,
    setMarkersVisible,
    highlightedDensity,
    summaries,
    municipalities,
    messages,
    markersVisible,
    setHighlightedDensity,
    hasSelected,
    hasMixed,
    hasEmpty,
    hasFilteredEmpty,
    hasDensityRank,
  } = controller;

  // Which shelters answer for the municipalities inside each region, by region
  // id. An empty region on this map is not an empty part of the country:
  // somebody is still responsible for a stray found there, and the coverage
  // table already knows who, so the map can say it instead of stopping at "no
  // shelters here". How a municipality is placed in a region is with the
  // helper, in municipality-places.ts, which the found-animal page shares.
  const coverage = useClientPayload<LookupEntry[]>(controller.municipalitiesUrl, true);
  const entries = municipalities ?? coverage.data;
  const regionShelterNames = useMemo(
    () => entries
      ? shelterNamesByRegion(entries)
      : new Map(regionShelterNamesData as [number, string[]][]),
    [entries],
  );

  return (
    <>
      {controller.municipalitiesUrl && !entries && <DeferredStatus error={coverage.error} retry={coverage.retry} />}
      {/* flex-col so the map's height is its main size and shrinking it is
          what gives way when the box runs out (a landscape phone, or a
          portrait one with the keyboard up). As a row this column was the
          map's cross axis, so shrink had nothing to take: the plate held the
          498px its aspect ratio asked for inside 123px of box and the crop
          ate the coast and the south, with no way to scroll to them.
          overflow-hidden stays as the backstop it always was. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        {/* The box the credit is pinned to, and it has to be the country and
            not the column the country is centred in. The plate letterboxes
            inside whatever it is given, so wherever the box is the wrong
            shape the credit used to sit on bare paper beside the map: 179px
            to its left at 1440 with the panel collapsed, 132px on a phone
            held sideways. Where the height is what binds (from lg, and on a
            landscape phone) this box takes the plate's own 32:21 from the
            height and the map fills it exactly, so the credit is on the
            country. Where the width binds instead the box is the column, the
            plate letterboxes inside it, and the credit sits under the map
            with that band between them, which is what 1024 with the panel
            open still looks like. */}
        <div
          className={cn(
            "relative flex min-h-0 w-full shrink flex-col justify-center",
            "sm:short:h-full sm:short:w-auto sm:short:max-w-full sm:short:aspect-[32/21]",
            "lg:h-full lg:w-auto lg:max-w-full lg:aspect-[32/21]",
          )}
        >
          <ShelterMap
            pins={pins}
            selected={selected}
            onPick={handlePick}
            onFacts={setMapFacts}
            origin={origin}
            describedElsewhere={expandedShelter}
            highlightedValue={hoveredRow}
            matchedValues={
              searching
                ? [...visibleRows, ...visibleOffRows].map((row) => row.value)
                : null
            }
            spotlightValues={spotlitShelterId ? [spotlitShelterId] : null}
            onHoverShelters={setHoveredMarkerValues}
            onMarkersVisible={setMarkersVisible}
            highlightedDensity={highlightedDensity}
            summaries={summaries}
            regionShelterNames={regionShelterNames}
            // shrink, against the map's own shrink-0: this is the one caller
            // that hands it a box whose height can run out (a landscape phone,
            // or a portrait one with the keyboard up). Holding its
            // aspect-derived height there, it painted straight over the legend
            // and the instruction line under it. Allowed to shrink along the
            // column above, the viewBox letterboxes inside whatever height is
            // left. max-h-full does not do this on its own: the dialog is
            // h-auto under a max-height below lg, so the percentage has no
            // definite height to resolve against and drops out.
            className="min-h-0 shrink max-h-full sm:short:h-full lg:h-full"
          />
          <MapAttribution messages={messages} />
        </div>
      </div>
      {/* Beside the map on a landscape phone rather than under it, which is
          the stage's flex-row there (picker-map-stage.tsx). A column of
          twelve rem: every item in the legend is whitespace-nowrap and the
          density strip is the widest of them at 187px, so that is what the
          column is cut to and the rest stack under it. */}
      {/* From lg it is centred under the country rather than stretched
          across the stage. Collapsing the panel gains a height-bound plate
          no pixels, it only re-centres it, and a full-width block left the
          line that says how to work the map and the key that explains it
          pinned 179px to the left of the map they are about. */}
      <div className="z-10 w-full shrink-0 sm:short:w-48 sm:short:self-center lg:w-auto lg:self-center">
        <p className="mb-2 text-xs leading-snug text-muted-foreground">
          {markersVisible
            ? messages.mapInstructionsDesktop
            : messages.mapInstructionsMobile}
        </p>
        <MapLegend
          showDensity={hasDensityRank}
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
    </>
  );
}
