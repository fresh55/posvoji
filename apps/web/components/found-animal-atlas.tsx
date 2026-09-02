"use client";

import { useMemo, useState } from "react";
import { MapAttribution } from "@/components/filters/map-attribution";
import { MapLegend } from "@/components/filters/map-legend";
import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import {
  MUNICIPALITY_AT,
  shelterNamesByRegion,
} from "@/components/filters/location-picker/model";
import { ShelterMap, type MapFacts } from "@/components/filters/shelter-map";
import { useI18n } from "@/components/i18n-provider";
import type { ShelterPin } from "@/lib/map-layout";
import type { LookupEntry } from "@/lib/municipality-coverage";

const NO_SELECTION: string[] = [];
const IGNORE = () => undefined;

/**
 * The found-animal lookup with the map beside it, on its own page.
 *
 * This is the whole of the flow now. It used to be a tab of the homepage's
 * shelter picker, and the page rendered the finder alone and answered every
 * map callback with silence; the map is the better half of the answer, so the
 * page draws it too and the dialog has gone back to picking shelters.
 *
 * Composed from the same two components the dialog still uses for its own
 * question, not from the dialog. That view is a modal: a sheet, a peek bar,
 * docks and motion, all of which exist to put a map and a list inside one
 * frame; this page has the whole viewport. What the map needs to answer
 * "where was it found" is four things, and they are the four wires below:
 * which shelters the finder just named, which municipality it named them for,
 * what to call the ring, and the pins. Everything the picker's controller does
 * on top of that is filter state this page does not have.
 *
 * Two columns at lg, the map taking what the finder leaves, which is the
 * dialog's own split. Below lg the plate comes first and the finder under it,
 * as the dialog's phone layout stacks them, but in the document's own flow:
 * there is no sheet here, and nothing to hold the finder to a height.
 */
export function FoundAnimalAtlas({
  entries,
  pins,
}: {
  entries: LookupEntry[];
  pins: ShelterPin[];
}) {
  const { messages } = useI18n();
  const [shelterIds, setShelterIds] = useState<string[] | null>(null);
  const [municipality, setMunicipality] = useState<string | null>(null);
  const [facts, setFacts] = useState<MapFacts>({
    hasSelected: false,
    hasMixed: false,
    hasEmpty: false,
  });
  const [markersVisible, setMarkersVisible] = useState(true);
  const [highlightedDensity, setHighlightedDensity] = useState<number | null>(
    null,
  );
  const regionShelterNames = useMemo(
    () => shelterNamesByRegion(entries),
    [entries],
  );
  const from = municipality ? (MUNICIPALITY_AT.get(municipality) ?? null) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-column-gap">
      <div className="flex min-w-0 flex-col gap-2">
        {/* The plate: the map's paper ground with the credit floated on its
            corner, the same two things the dialog's stage draws around the
            SVG. relative for the credit, overflow-hidden so the chip's
            backdrop blur and the credit's rounded corner stay inside the
            frame. */}
        <div className="relative overflow-hidden rounded-ui border bg-muted/40 p-2 sm:p-3">
          <ShelterMap
            pins={pins}
            // Nothing on this page is ever picked: the map here is the answer,
            // not a filter, so it gets an empty selection and a pick handler
            // that does nothing. Module-scope constants, so the map sees the
            // same references every render.
            selected={NO_SELECTION}
            onPick={IGNORE}
            onFacts={setFacts}
            onMarkersVisible={setMarkersVisible}
            // The map dims the country against the finder's answer and rings
            // it, both together: a dimmed-versus-darker marker alone was not
            // readable, and on phones markers are not drawn at all, so the
            // ring and its named card are what make the answer visible there.
            matchedValues={shelterIds}
            spotlightValues={shelterIds}
            spotlightNote={messages.muniResponsible}
            // The other half of that answer: where it was asked from. Only
            // when the občina is one we hold a centroid for.
            spotlightFrom={from}
            highlightedDensity={highlightedDensity}
            regionShelterNames={regionShelterNames}
          />
          {/* One line, floated on the paper where the dialog floats its
              title chip. The page's h1 already asks the question, so only
              the part the map alone has to say is here: what it does with
              the answer. Nothing in it is a control, so it takes no pointer
              and cannot swallow the taps meant for the regions under it. */}
          <p className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(17rem,65%)] rounded-ui border bg-background/80 px-2.5 py-1.5 text-xs leading-tight shadow-xs backdrop-blur sm:left-4 sm:top-4">
            {messages.mapInstructionsMuni}
          </p>
          <MapAttribution messages={messages} />
        </div>
        <MapLegend
          highlightedDensity={highlightedDensity}
          onHoverDensity={setHighlightedDensity}
          onLeaveDensity={() => setHighlightedDensity(null)}
          hasSelectedRegion={facts.hasSelected}
          hasMixedRegion={facts.hasMixed}
          hasEmptyMarker={facts.hasEmpty && markersVisible}
          origin={undefined}
          messages={messages}
        />
      </div>

      {/* The finder, and its two onActive callbacks are the wires to the map
          above. It used to take a selection and an onToggle as well, for the
          "select this shelter as a filter" button it drew inside the dialog;
          this page has no filter, and the coverage card already links to the
          shelter's own page and its animals. */}
      <div className="flex min-w-0 flex-col">
        <MunicipalityFinder
          entries={entries}
          onActiveShelters={setShelterIds}
          onActiveMunicipality={setMunicipality}
        />
      </div>
    </div>
  );
}
