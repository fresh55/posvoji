import { MapAttribution } from "@/components/filters/map-attribution";
import { ShelterMap } from "@/components/filters/shelter-map";
import { cityAt } from "@/lib/geo";
import { regionIdAt } from "@/lib/map-layout";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { LocationPickerController } from "./controller";
import regionShelterNamesData from "@/lib/region-shelter-names.json";
import { shelterNamesByRegion } from "./municipality-places";
import { useClientPayload } from "@/hooks/use-client-payload";
import { DeferredStatus } from "@/components/deferred-status";
import type { LookupEntry } from "@/lib/municipality-coverage";

// What the stage puts on its plate: the country map and its credit. Split
// from the box it stands in (picker-map-stage.tsx) so all of it, the map's
// geography and relief and the municipality centroid table below, is fetched
// by the press that opens the picker rather than by the home page's first
// paint.
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
    resolved,
    setMarkersVisible,
    offSite,
  } = controller;

  // The regions a registry shelter with nothing listed stands in. Those
  // shelters are no pins (there is nothing in them to pick), so without this
  // the map could not tell such a region from one with no shelter at all, and
  // Goriška said "Ni zavetišč v tej regiji" over a line naming the two
  // shelters in it. Worked out here, in the plate's own chunk, because the
  // region shapes it needs are what that chunk keeps off the home page, and
  // by the lookup the map groups its own towns by.
  const unlistedRegionIds = useMemo(
    () =>
      new Set(
        (offSite ?? []).flatMap((option) => {
          const at = option.city ? cityAt(option.city) : undefined;
          const id = at ? regionIdAt(at) : undefined;
          return id === undefined ? [] : [id];
        }),
      ),
    [offSite],
  );

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
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        {/* The country's own box. Where the height is what binds, which is
            wherever the list stands beside the map (picker-split in
            globals.css), it takes the plate's 32:21 from the height and the
            map fills it exactly; where the width binds it is the column, and
            the plate letterboxes inside it.

            Nothing under the map changes with what is picked. A legend grew a
            row there on the first pick of a shelter, and from lg the map is
            sized by the height left over, so every pick that changed the
            legend shrank the country and slid it sideways under the pointer.
            The states it explained are written on the plate now, where they
            happen: the picked coin names itself, the ring prints its distance
            and the origin its town. */}
        <div
          className={cn(
            "relative flex min-h-0 w-full shrink flex-col justify-center",
            "picker-split:h-full picker-split:w-auto picker-split:max-w-full picker-split:aspect-[32/21]",
          )}
        >
          <ShelterMap
            pins={pins}
            selected={selected}
            onPick={handlePick}
            origin={origin}
            originLabel={resolved.label ?? messages.myLocation}
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
            unlistedRegionIds={unlistedRegionIds}
            // shrink, against the map's own shrink-0: this is the one caller
            // that hands it a box whose height can run out (a landscape phone,
            // or a portrait one with the keyboard up). Holding its
            // aspect-derived height there, it painted straight over the credit
            // under it. Allowed to shrink along the column above, the viewBox
            // letterboxes inside whatever height is left. max-h-full does not
            // do this on its own: the dialog is h-auto under a max-height
            // when stacked, so the percentage has no definite height to
            // resolve against and drops out.
            className="min-h-0 shrink max-h-full picker-split:h-full"
          />
          {/* From lg the credit stands in the plate's own corner rather than
              under it, where it cost the country its height: the box is the
              plate exactly there, so the corner is the map's. See the corner
              variant for why that corner. */}
          <MapAttribution
            messages={messages}
            variant="corner"
            className="absolute right-1.5 bottom-1 hidden lg:block"
          />
        </div>
        {/* A phone held sideways: the plate is bound by a height of about
            190px and centred in a column three times its width, so the corner
            of that column is ground nothing stands on. The credit had a
            column of its own beside the map there, twelve rem of nothing
            once the legend and the instruction line had left it. */}
        <MapAttribution
          messages={messages}
          variant="corner"
          className="absolute right-0 bottom-0 hidden max-lg:sm:short:block"
        />
      </div>
      {/* Stacked, the credit keeps its line under the map. The map is sized
          by the width there, so the line costs it nothing, and a phone's
          plate is too small a corner to hold it. */}
      <div className="z-10 w-full shrink-0 picker-split:hidden">
        <MapAttribution messages={messages} />
      </div>
    </>
  );
}
