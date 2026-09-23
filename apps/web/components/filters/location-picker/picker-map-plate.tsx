import { MapAttribution } from "@/components/filters/map-attribution";
import { MapLegend } from "@/components/filters/map-legend";
import { ShelterMap, type MapFacts } from "@/components/filters/shelter-map";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
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
    origin,
    expandedShelter,
    hoveredRow,
    searching,
    visibleRows,
    spotlitShelterId,
    setHoveredMarkerValues,
    summaries,
    municipalities,
    messages,
  } = controller;

  // Whether the map is drawing markers right now, as the map itself answers
  // it. Two things under the plate talk about markers, the instruction line and
  // the legend's filtered-out row, and both used to decide from a viewport
  // breakpoint while the map decided from the plate it had actually measured.
  // They disagreed wherever the two differ, which is most of the width of a
  // phone held sideways: the line told a visitor to click a marker on a plate
  // carrying none, and the legend explained a circle nothing had drawn.
  //
  // True to start with, which is what ShelterMap starts at too, so the two are
  // one answer from the first render rather than converging on the second.
  // Held here and not in the controller: the plate is the only reader.
  const [markersVisible, setMarkersVisible] = useState(true);
  const [{ hasSelected, hasMixed, hasFilteredEmpty }, setMapFacts] =
    useState<MapFacts>({
      hasSelected: false,
      hasMixed: false,
      hasFilteredEmpty: false,
    });

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
        {/* The country's own box. Where the height is what binds (from lg,
            and on a landscape phone) it takes the plate's 32:21 from the
            height and the map fills it exactly; where the width binds it is
            the column, and the plate letterboxes inside it. */}
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
              searching ? visibleRows.map((row) => row.value) : null
            }
            spotlightValues={spotlitShelterId ? [spotlitShelterId] : null}
            onHoverShelters={setHoveredMarkerValues}
            onMarkersVisible={setMarkersVisible}
            // The count on the marker, over the map's flat region tint. The
            // ramp ranked regions by animals, a total for a boundary no
            // visitor chooses, and drew the same fact the markers and the list
            // already carry a third time.
            countOnMarkers
            originRadiusKm={controller.ringKm}
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
        </div>
      </div>
      {/* Beside the map on a landscape phone rather than under it, which is
          the stage's flex-row there (picker-map-stage.tsx). A column of
          twelve rem: every legend row is whitespace-nowrap and the widest,
          "Delno izbrana regija" with its swatch, fits inside it. From lg it
          is centred under the country rather than stretched across the
          stage, so the line that says how to work the map, the key and the
          credit stand under the map they are about. */}
      <div className="z-10 w-full shrink-0 sm:short:w-48 sm:short:self-center lg:w-auto lg:self-center">
        <p className="mb-2 text-xs leading-snug text-muted-foreground">
          {markersVisible
            ? messages.mapInstructionsDesktop
            : messages.mapInstructionsMobile}
        </p>
        <MapLegend
          hasSelectedRegion={hasSelected}
          hasMixedRegion={hasMixed}
          hasFilteredMarker={hasFilteredEmpty && markersVisible}
          origin={origin}
          messages={messages}
        />
        <MapAttribution messages={messages} className="mt-2" />
      </div>
    </>
  );
}
