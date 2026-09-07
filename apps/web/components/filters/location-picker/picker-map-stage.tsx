import { MapAttribution } from "@/components/filters/map-attribution";
import { MapLegend } from "@/components/filters/map-legend";
import { ShelterMap } from "@/components/filters/shelter-map";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { MAP_STAGE_TRANSITION_CLASS } from "./motion";

export function PickerMapStage({
  selected,
  summaries,
  messages,
  expandedShelter,
  spotlitShelterId,
  panelOpen,
  sheetOpen,
  searching,
  origin,
  hoveredRowValue,
  setHoveredMarkerValues,
  highlightedDensity,
  setHighlightedDensity,
  regionShelterNames,
  markersVisible,
  setMarkersVisible,
  setMapFacts,
  pins,
  handlePick,
  visibleRows,
  visibleOffRows,
  hasSelected,
  hasMixed,
  hasEmpty,
}: Pick<
  LocationPickerController,
  | "selected"
  | "summaries"
  | "messages"
  | "expandedShelter"
  | "spotlitShelterId"
  | "panelOpen"
  | "sheetOpen"
  | "searching"
  | "origin"
  | "hoveredRowValue"
  | "setHoveredMarkerValues"
  | "highlightedDensity"
  | "setHighlightedDensity"
  | "regionShelterNames"
  | "markersVisible"
  | "setMarkersVisible"
  | "setMapFacts"
  | "pins"
  | "handlePick"
  | "visibleRows"
  | "visibleOffRows"
  | "hasSelected"
  | "hasMixed"
  | "hasEmpty"
>) {
  return (
    <div
      data-map-stage={panelOpen ? "panel" : "rail"}
      className={cn(
        // One stack at every width: the plate, then the caption under
        // it. The caption used to float into the plate's own bottom-left
        // corner from lg up, which only works while the letterbox
        // happens to leave paper there; a plate limited by height leaves
        // none and the legend ended up on the country. In flow the plate
        // is given what the caption does not take, so an overlap is not
        // something to tune away, it is something that cannot be
        // expressed.
        //
        // The credit is the one exemption, and it floats in that corner
        // now. The legend is what made the rule: a key is read against
        // the map it explains, so a key drawn on the country is a key
        // that cannot be read. The credit is read against itself. It
        // carries its own opaque plate, it takes no pointer, and below
        // lg it is one line where the caption was three rows, so the
        // worst corner the letterbox can hand it costs legibility
        // nothing and costs a tap nothing. See the paragraph on the
        // plate for the rest.
        "absolute inset-x-0 top-0 flex flex-col gap-2 p-2 sm:p-3",
        // Named, so the paw layer in map-marker.tsx can ask how wide the
        // plate is actually drawn rather than guessing from the viewport.
        // This element is the right one to ask: its width is the width
        // the SVG fills, and it is the box that changes width when the
        // panel folds to a rail. The container query is about width
        // alone, so the caption sharing this column costs it nothing.
        "@container/map-stage",
        // p-3 and not p-4 at lg: every other edge in this dialog is
        // inset by three, the title chip, the close, the pill and the
        // panel alike, and the plate was the one thing keeping a
        // different gutter.
        "lg:right-auto lg:bottom-0 lg:p-3",
        MAP_STAGE_TRANSITION_CLASS,
        // Below lg the sheet takes height instead of width, so the same
        // recentering happens on the other axis: the container gives up
        // exactly what the sheet takes and the plate recentres in what
        // is left. Nothing is ever drawn under the sheet either.
        //
        // The inset is the sheet's own height, read from --sheet-h
        // rather than written out a second time. The two used to be twin
        // arbitrary expressions, base and short-viewport, kept in step
        // by a note; they are one declaration on the stage now (see it
        // above), so there is nothing left to drift.
        sheetOpen ? "bottom-(--sheet-h)" : "bottom-13",
        panelOpen ? "lg:w-[calc(100%-25.5rem)]" : "lg:w-[calc(100%-4.5rem)]",
      )}
    >
      {/* The plate gets what the caption leaves and no more. min-h-0 is
                what lets a flex item give way at all, and the SVG letterboxes
                inside whatever height it ends up with, so the map shrinks
                rather than the caption being pushed off the stage. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <ShelterMap
          pins={pins}
          selected={selected}
          onPick={handlePick}
          onFacts={setMapFacts}
          origin={origin}
          // This shelter's open details in the list are already carrying
          // its count and species line, so the marker under the pointer
          // says its name and stops there.
          describedElsewhere={expandedShelter}
          highlightedValue={hoveredRowValue}
          matchedValues={
            // Only a name narrows anything, so only a name has matches
            // to dim the rest of the country against. A place leaves
            // every row in the list and would have dimmed nothing while
            // claiming to have searched.
            searching
              ? [...visibleRows, ...visibleOffRows].map((row) => row.value)
              : null
          }
          // The ring and named card that answer "so where is that?",
          // asked by an animal card's shelter name. Stronger than the
          // hover highlight on purpose, and the only signal phones get.
          //
          // No note under the name. A shelter named on an animal card is
          // not "the responsible shelter" for anywhere; that caption
          // belongs to the found-animal page, which asks the other
          // question (found-animal-atlas.tsx). The ring and the name are
          // the whole answer here.
          spotlightValues={spotlitShelterId ? [spotlitShelterId] : null}
          onHoverShelters={setHoveredMarkerValues}
          // The plate says whether it is drawing markers, and this
          // dialog's instruction line and legend answer to that rather
          // than to a breakpoint of their own. See markersVisible above.
          onMarkersVisible={setMarkersVisible}
          highlightedDensity={highlightedDensity}
          // The same breakdown the shelter details read. On the plate it is
          // a line of species glyphs under the name of one hovered
          // shelter, so the map answers "who lives here" without
          // waiting for a click.
          summaries={summaries}
          // What an empty region has to say for itself. Computed here
          // because this is where the coverage table already is.
          regionShelterNames={regionShelterNames}
          // lg+: the SVG takes the whole row above and lets its own
          // preserveAspectRatio letterbox the viewBox inside it. That is
          // the letterboxing: no aspect-ratio arithmetic on this side,
          // and the paper it leaves showing is the dialog's ground.
          // Below lg it keeps the component's own h-auto instead, so the
          // plate is exactly as tall as 320:210 makes it and no taller,
          // capped at the row so a raised sheet shrinks it rather than
          // pushing it out of the frame.
          className="max-h-full lg:h-full"
        />

        {/* The credit, floated on the plate rather than set under it. CC
                  BY 4.0 still requires it visible and it still is: it left the
                  caption's flow, not the dialog, and nothing on the path from
                  it up to the dialog hides it. What it stopped doing is
                  charging the caption 36px for three lines of prose, which on
                  a 320px phone is a fifth of the plate standing above it.

                  Opaque, unlike the /80 the title chip and the close button
                  wear. Those are chrome and can afford to let the map through.
                  This is 10px type that has to clear 4.5:1, and the ratio the
                  size was chosen against was measured on the paper; over a
                  hillshade that varies underneath it the ratio would vary with
                  it, so the paper travels with the text.

                  pointer-events-none on the paragraph and auto on the links
                  alone: the box sits over a corner of the country that can be
                  picked, and a credit is not allowed to eat a region's taps.

                  Bottom-left because that is the emptiest corner the plate
                  has, sea and the Italian border, and because it is where the
                  letterbox leaves bare paper when the viewBox does not fill
                  the row. */}
        <MapAttribution messages={messages} />
      </div>

      {/* The caption: the legend, under the plate, which is where a
                printed sheet puts a key and the one place it can be that no
                aspect ratio can turn into an overlap. It is the
                stage's last row, so the plate's bottom edge is always above
                it, whatever the sheet is doing to the height they share.

                The plate's own furniture keeps its own corners inside the
                viewBox and never meets this; the confirm pill takes the
                dialog's bottom-right, which at lg is outside this column
                entirely (the stage stops where the panel begins) and below lg
                floats in the same band this sits in, as it did before.

                Nothing in it folds any more. The legend used to be taken away
                with the sheet, on the reasoning that an open sheet leaves the
                map nothing worth explaining; measured, it leaves a plate, and
                the density ramp, the selection green, the hatch and the origin
                ring are all still drawn on it. What a phone gets is the
                compact register MapLegend writes for itself, not a smaller
                share of the same rows. The stage's floor pays for it: see the
                sheet's ceiling term below.

                The credit used to sit under the legend here and floats on the
                plate now, so this row holds one item: nothing to space it
                against, and no pointer-events pair, the legend being the only
                thing in the band that can be reached. 10px, where the two of
                them together took 49. */}
      <div className="z-10 w-full shrink-0">
        <MapLegend
          showDensity={pins.some((pin) => pin.count > 0)}
          highlightedDensity={highlightedDensity}
          onHoverDensity={setHighlightedDensity}
          onLeaveDensity={() => setHighlightedDensity(null)}
          hasSelectedRegion={hasSelected}
          hasMixedRegion={hasMixed}
          // Both halves of the same question: there is a hollow circle
          // to explain only where the roster draws one and the plate
          // is drawing markers at all.
          hasEmptyMarker={hasEmpty && markersVisible}
          origin={origin}
          messages={messages}
        />
      </div>
    </div>
  );
}
