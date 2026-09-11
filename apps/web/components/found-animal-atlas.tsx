"use client";

import { useState } from "react";
import { MapAttribution } from "@/components/filters/map-attribution";
import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import { MUNICIPALITY_AT } from "@/components/filters/location-picker/municipality-places";
import { ShelterMap } from "@/components/filters/shelter-map";
import { useI18n } from "@/components/i18n-provider";
import type { ShelterPin } from "@/lib/map-layout";
import type { LookupEntry } from "@/lib/municipality-coverage";

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
 * "where was it found" is three things, and they are the three wires below:
 * which shelters the finder just named, which municipality it named them for,
 * and what to call the ring. Everything the picker's controller does on top of
 * that is filter state this page does not have.
 *
 * Nothing on the plate but the map and its credit. The dialog floats a title
 * chip over its map and draws a legend under it, because its regions carry a
 * density ramp and a selection state that need naming; here the regions are
 * flat (shading="flat"), there is nothing to select, the page's h1 has already
 * asked the question, and the ring with its named card is the whole of what
 * the map has to say once there is an answer.
 *
 * Two columns at lg, the finder on the left and the map taking what it
 * leaves. The finder is the task and the map is the picture of its answer, so
 * the finder sits where reading starts, and the same order holds on a phone
 * and in the document: the box is the first thing under the h1, the ring on
 * the map appears beside or below the card it explains.
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
  const from = municipality ? (MUNICIPALITY_AT.get(municipality) ?? null) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start lg:gap-column-gap">
      <div className="min-w-0">
        <MunicipalityFinder
          entries={entries}
          onActiveShelters={setShelterIds}
          onActiveMunicipality={setMunicipality}
        />
      </div>

      {/* The plate: the map's paper ground with the credit floated on its
          corner, the same two things the dialog's stage draws around the
          SVG. relative for the credit, overflow-hidden so its rounded corner
          stays inside the frame.

          At lg it keeps to the viewport and stays put while the finder
          scrolls: the SVG is capped a little under the viewport's height and
          letterboxes inside the plate, and the plate is sticky, so the ring
          around the answer is on screen for as long as the card it explains
          is. Without the cap a wide window drew a map taller than the screen
          and the answer's ring could sit below the fold of its own page. */}
      <div className="relative min-w-0 overflow-hidden rounded-ui border bg-muted/40 p-2 sm:p-3 lg:sticky lg:top-6">
        <ShelterMap
          interactive={false}
          className="lg:max-h-[calc(100dvh-6rem)]"
          shading="flat"
          pins={pins}
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
        />
        <MapAttribution messages={messages} />
      </div>
    </div>
  );
}
