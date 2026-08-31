import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  List,
  LoaderCircle,
  MapPin,
  Maximize2,
  Navigation,
  PawPrint,
  Search,
  X,
} from "lucide-react";
import { EmptyMarkerGlyph } from "@/components/filters/map-marker";
import { OriginGlyph } from "@/components/filters/map-callout";
import { MiniMap } from "@/components/filters/mini-map";
import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { ShelterMap } from "@/components/filters/shelter-map";
import { ShelterRows } from "@/components/filters/shelter-rows";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { animalCount } from "@/lib/labels";
import { DENSITY_STEPS } from "@/lib/map-layout";
import { readTypedLocation } from "@/lib/origin";
import { cn } from "@/lib/utils";
import type { LatLon } from "@/lib/geo";
import type { LocationPickerController } from "./controller";
import {
  MUNICIPALITY_AT,
  openedWithKeyboard,
  pickerText,
  sameValues,
  visibleTrigger,
} from "./model";
import {
  hasFinePointer,
  MAP_STAGE_TRANSITION_CLASS,
  PANEL_TRANSITION_CLASS,
} from "./motion";

const LEGEND_SWATCH_GROUND =
  "color-mix(in oklch, var(--muted) 40%, var(--background))";

// The map legend, one rendering at every width. It used to be two, a column
// floated into the plate's bottom-left corner from lg up and a wrapping row
// under the plate below that, on the bet that the letterbox always left paper
// in that corner. It does not: a plate limited by height fills its box, and
// the column sat on the country. The legend is a caption under the map now,
// which is one shape and one place, and a wrapping row is what a caption under
// a plate wants to be at any width.
//
// It explains what nobody can guess and nothing else. The density ramp is the
// one encoding with no other way in, so it is always here. Everything else
// waits for the thing it describes to exist: the hatch appears with the first
// partial selection, the origin ring with the first origin. The marker shapes
// and sizes explain themselves on hover, through the callout, so they say
// nothing here at all.
//
// One rendering, compacted by CSS below lg rather than replaced by a second
// one. The sheet used to take the whole caption away with it, which left a
// phone reading a density ramp, a hatch and an origin ring with nothing on
// screen to explain any of them. What a phone gets is the same set of rows in
// a tighter register: 10px instead of 11, half the gaps, and no hover
// affordance on the swatches, because the highlight they drive is gated on a
// mouse and a touch device has none. The empty-marker row is the one that is
// genuinely absent below md, and it says so itself.
function MapLegend({
  highlightedDensity,
  onHoverDensity,
  onLeaveDensity,
  hasSelectedRegion,
  hasMixedRegion,
  hasEmptyMarker,
  origin,
  messages,
}: {
  highlightedDensity: number | null;
  onHoverDensity: (index: number) => void;
  onLeaveDensity: () => void;
  /** At least one region is fully picked right now, so the solid selection
   *  green is on the map and needs telling apart from the density ramp. */
  hasSelectedRegion: boolean;
  /** At least one region is partly picked right now, so the hatch on the map
   *  is a state worth naming. */
  hasMixedRegion: boolean;
  /** At least one shelter with nothing listed is drawn as a hollow circle right
   *  now. The row itself decides at which widths that is worth saying: see it
   *  below. */
  hasEmptyMarker: boolean;
  origin: LatLon | undefined;
  messages: LocationPickerController["messages"];
}) {
  return (
    <div
      data-map-legend
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-3xs leading-none text-muted-foreground lg:gap-x-4 lg:gap-y-1.5 lg:text-2xs"
    >
      <span className="flex items-center gap-2">
        <span>{messages.fewerAnimals}</span>
        <span
          className="flex items-center gap-0.5"
          aria-hidden
          onPointerLeave={onLeaveDensity}
        >
          {DENSITY_STEPS.map((opacity, index) => (
            // The padded span, not the square, is the hover target: an 8px
            // square is too small to aim at on its own, so the hit area
            // grows without the visible swatch growing with it. cursor-help
            // rather than -default: this responds to hover with
            // information, closer to a tooltip than to inert decoration.
            // Both are lg-only, because both are about a pointer: below lg
            // the padding buys a touch device nothing but width it does not
            // have, and a help cursor advertises an answer it cannot get.
            //
            // Pointer events gated on a mouse, the idiom use-filter-motion.ts
            // already uses. A tap synthesizes a mouseenter with no mouseleave
            // after it, so the highlight latched and every unpicked region
            // stayed dimmed for the rest of the session.
            <span
              key={opacity}
              className="lg:cursor-help lg:p-0.5"
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                onHoverDensity(index);
              }}
            >
              {/* Two layers, not one. A region's fill composites over the
                  land it sits on, not over whatever happens to be behind the
                  legend; painting the ramp's alpha straight onto this panel
                  used its own near-black dark background as the ground
                  instead, which is darker than the land the map actually
                  uses and compressed all five steps into the same corner of
                  the scale. The underlay is LEGEND_SWATCH_GROUND, the
                  opaque stand-in for that land; the map's own ink and alpha
                  ride on top of it unchanged, --map-density-fill at the
                  DENSITY_STEPS opacity. */}
              <span
                className={cn(
                  "relative block size-2 overflow-hidden rounded-[2px] transition-shadow",
                  highlightedDensity === index && "ring-1 ring-foreground/30",
                )}
                style={{ backgroundColor: LEGEND_SWATCH_GROUND }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[var(--map-density-fill)]"
                  style={{ opacity }}
                />
              </span>
            </span>
          ))}
        </span>
        <span>{messages.moreAnimals}</span>
      </span>

      {/* The solid selection green, the moment a region first wears it. The
          ramp and the selected state share one hue on purpose, so the legend
          has to say which green is the answer the visitor gave: without this
          row a first-timer can read the darkest density step as "already
          picked" and nothing on the map corrects them. Both variants, because
          regions are selectable on phones too. */}
      {hasSelectedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            // --map-selected-fill, not --filter-accent-border: the legend has
            // to show the fill the map actually draws for a chosen region
            // (see shelter-map.tsx REGION_LOOK.selected and the token's own
            // comment in globals.css), or the swatch would teach a colour the
            // country never shows.
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)] bg-[var(--map-selected-fill)]"
          />
          {messages.selectedRegionLegend}
        </span>
      )}

      {/* The hatch a mixed/partly-selected region gets on the map, at legend
          size. Only while such a region exists, which is the moment the hatch
          first appears: the row teaches the pattern as it is made, rather than
          describing a state the map is not in. Both variants, because regions
          and their partial selection exist on phones too. */}
      {hasMixedRegion && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px] border border-[var(--filter-accent-strong)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--filter-accent-strong) 0 1px, var(--filter-accent) 1px 4px)",
            }}
          />
          {messages.mixedRegionLegend}
        </span>
      )}

      {/* The hollow circle a shelter with no animals listed gets. Every other
          mark on the map either answers on hover or earns a row here the
          moment it appears; this one is too small to aim a pointer at, so the
          callout never gets asked and the row is the only way to learn it.
          The glyph comes from map-marker.tsx, drawn from the same classes and
          the same radius-to-stroke proportion the real circle uses.

          This row follows the markers and not the docks, and it follows them
          through the map's own answer rather than through a breakpoint that
          guesses at it. max-md:hidden used to be what kept the row off a
          phone; it also kept it off a tablet that draws markers, and left it
          standing on a landscape phone that does not. */}
      {hasEmptyMarker && (
        <span className="flex items-center gap-1.5">
          <EmptyMarkerGlyph className="size-3.5 shrink-0" />
          {messages.emptyShelterLegend}
        </span>
      )}

      {/* Only once there is a point to explain. The ring repeats the dashed
          circle the map draws at the origin, at legend size. */}
      {origin && (
        <span className="flex items-center gap-1.5">
          <OriginGlyph className="size-4 shrink-0" />
          {messages.originLegend}
        </span>
      )}
    </div>
  );
}

export function LocationPickerView({
  controller,
}: {
  controller: LocationPickerController;
}) {
  const {
    options,
    counts,
    selected,
    onToggle,
    onToggleMany,
    resultCount,
    municipalities,
    offSite,
    summaries,
    deepLink,
    dress,
    locale,
    messages,
    t,
    open,
    setOpen,
    query,
    setQuery,
    muniMode,
    setMuniMode,
    muniShelterIds,
    setMuniShelterIds,
    muniName,
    setMuniName,
    expandedShelter,
    setExpandedShelter,
    offGroupOpen,
    setOffGroupOpen,
    listRef,
    dropNote,
    spotlitShelterId,
    setSpotlitShelterId,
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    resetDocks,
    searchRef,
    placeMode,
    searching,
    statusId,
    offGroupId,
    state,
    toggleNearby,
    dismissError,
    turnOffNearby,
    resolved,
    origin,
    rowRefs,
    hoveredRowValue,
    setHoveredRowValue,
    hoveredMarkerValues,
    setHoveredMarkerValues,
    highlightedDensity,
    setHighlightedDensity,
    regionShelterNames,
    markersVisible,
    setMarkersVisible,
    setMapFacts,
    selectableIds,
    pins,
    handlePick,
    hoverScrollTo,
    toggleExpandedShelter,
    visibleRows,
    visibleOffRows,
    searchNews,
    hasSelected,
    hasMixed,
    hasEmpty,
    nearbyOn,
    status,
    missing,
    detailBase,
    offGroupHeading,
    label,
    doneLabel,
  } = controller;

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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // The box empties on the way out, unless what is in it resolved to a
          // place. A half-typed shelter name is scratch from one visit and has
          // no business narrowing the next one's list; a town is not, because
          // it is the origin the whole page measures from. The grid's
          // Najbližje sort reads it through the nearby-origin store (see
          // usePublishNearbyOrigin), so clearing it here would quietly take the
          // sort order away from a page the visitor is on their way back to,
          // with nothing on screen admitting it had gone.
          //
          // One field, one rule, and the rule is the same one the field itself
          // keeps: what the text is decides what happens to it.
          if (!placeMode) setQuery("");
          // Reopening lands in the shelter picker, whatever question the
          // dialog closed on.
          setMuniMode(false);
          setMuniShelterIds(null);
          setMuniName(null);
          setExpandedShelter(null);
          setSpotlitShelterId(null);
          // The off-roster fold goes back to shut with everything else here.
          // It is the same kind of state as the query and the open shelter,
          // something the last visit did rather than something about the
          // filter, and a reopened picker that kept one visit's fold while
          // dropping that visit's search is remembering half a session.
          setOffGroupOpen(false);
          // Neither dock's fold survives a close: reopening always lands with
          // both docks out, the panel beside the map at lg and the sheet over
          // it below lg.
          resetDocks();
        }
      }}
    >
      {dress === "sidebar" ? (
        // The panel's own way in, and no DialogTrigger: the row is a header, a
        // reset and a press target, and only the last of the three opens
        // anything. Radix returns focus to whatever was focused when the
        // dialog opened, which is that press target, so the trigger buys
        // nothing the plain button below does not already carry.
        <LocationScopeRow
          options={options}
          counts={counts}
          offSite={offSite}
          selected={selected}
          expanded={open}
          onOpen={() => setOpen(true)}
          onReset={() => onToggleMany(selected)}
          isPickerTrigger
        />
      ) : (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            // A plain button, which is what it is. It used to report
            // role="combobox", and a combobox promises a value and a listbox to
            // pick it from; this one opens a dialog with a map in it and owns
            // neither, so the promise was one no screen reader could collect on.
            // aria-haspopup says what actually happens and aria-expanded says
            // whether it has happened yet, which is the whole of the contract.
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={t("shelterPickerLabel", { label })}
            // The browser tests' way in. Every other element in this dialog is
            // found by a data-* attribute the component promises to keep, and
            // this one was the exception: the specs located it by implicit role,
            // which is derived from aria-haspopup above and moved when that
            // attribute did. One line changed here turned the whole e2e suite
            // red at once, which reads as a product failure rather than as a
            // selector that needs updating. The role and the label stay worth
            // asserting, but as one explicit a11y check that fails loudly on its
            // own, not as the way seven other tests reach the dialog.
            data-picker-trigger
            // The quiet dress belongs to the toolbar, where the species tabs
            // anchor the row and this control can afford to be only text at
            // rest. The dock has no such anchor: floating on its own plate next
            // to the filled Filtri button, a borderless "Vsa zavetišča" read as
            // a caption, not as something to press. There the button keeps the
            // outline variant's own frame, shadow and dark ground.
            className={cn(
              "justify-between gap-2 font-normal",
              deepLink === "mobile"
                ? // A touch tighter than the size-sm defaults: the frame's two
                  // border pixels were exactly what pushed "Vsa zavetišča" into
                  // an ellipsis on a 390px dock.
                  "gap-1.5 px-2"
                : cn(
                    QUIET_TRIGGER_CLASS,
                    "max-w-[14rem] aria-expanded:border-border",
                  ),
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {/* A live preview, not a stand-in icon: the same region shapes and
                  the same density computation the dialog's map draws from
                  (lib/map-layout.ts), so the trigger already shows what is
                  behind it before it is ever clicked. aria-hidden because the
                  label carries the meaning; a screen reader has nothing to gain
                  from a tiny country shape. */}
              <MiniMap
                pins={pins}
                selected={selected}
                // Hidden below 360px rather than left to truncate: on the
                // dock the label and the icon already lose ground to the
                // Filtri button, and the decorative preview is the thing to
                // give up before the shelter name starts eating an ellipsis.
                className="hidden h-4 w-auto shrink-0 text-foreground opacity-60 min-[360px]:inline-block"
              />
              <span className="truncate">{label}</span>
            </span>
            {/* Not a chevron. Everywhere else in this app a chevron down is a
                fold opening in place: the health row, a filter section, the
                off-roster list, a real select. This control opens a full-screen
                map, which is why the ARIA above had to stop saying combobox,
                and the glyph was the other half of the same promise. Maximize
                says what the tap does, and paired with the MiniMap on the left
                the whole button reads as "the small map, made big". */}
            <Maximize2 className="size-3.5 opacity-50" aria-hidden />
          </Button>
        </DialogTrigger>
      )}

      <DialogContent
        // Near the whole viewport, and the map is what fills it. The plate is
        // no longer a column of the dialog; it is the dialog, and the list,
        // the title, the credits and the confirm button float on it. p-0 and
        // gap-0 because nothing here is in flow: every piece is placed against
        // an edge of the stage below.
        //
        // The dialog's own border is the map's neatline now. The plate used to
        // carry its own hairline to say where the map ended; full bleed leaves
        // that job to the frame the dialog already draws.
        //
        // Capped at 84rem rather than 110rem, and 52rem rather than 60rem. A
        // border and a corner radius only read as a frame if there is ground
        // visible outside them; at 110rem the dialog ran to 1760px on a wide
        // monitor, where the backdrop was a sliver and the frame said nothing.
        // The viewport-relative terms are what still decide it on a laptop, so
        // nothing narrower than about 1400px moves at all.
        //
        // The width is declared as --picker-w and then worn, rather than
        // written into w-[…] directly, because the stage below has arithmetic
        // to do on it: the plate is 320:210, so how much height the map needs
        // is a fact about how wide this dialog is, and a second writing of
        // min(94vw,84rem) down there would be a second thing to keep in step.
        className="h-[min(94dvh,52rem)] w-(--picker-w) [--picker-w:min(94vw,84rem)] max-h-none max-w-none gap-0 overflow-hidden p-0"
        showCloseButton={false}
        closeLabel={messages.close}
        onEscapeKeyDown={(event) => {
          // A ladder, one rung per press, innermost first. Escape empties the
          // box it is pressed in before anything else: clearing a search
          // should not cost the whole map. With the box settled, a shelter's
          // open details are the next thing to go. The dialog itself goes on
          // the press after that.
          //
          // The details rung asks nothing about the breakpoint. The card this
          // replaces was drawn from lg up and nowhere else, so below lg the
          // press would have spent itself on state with nothing on screen
          // behind it and read as Escape doing nothing; details render at every
          // width, so at every width this rung takes down something visible,
          // which is what makes the press legible.
          //
          // It collapses and stops there. The selection is not Escape's to
          // touch: the shelter stays picked or unpicked exactly as it was, and
          // the way out of a selection is the row's own toggle or its marker.
          // Focus is left where the press found it, for the reasons on
          // toggleExpandedShelter above.
          //
          // It has to be handled here rather than on the inputs, because the
          // dialog listens for the key on the document in the capture phase,
          // before it ever reaches the field.
          const target = event.target;
          if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          } else if (expandedShelter) {
            setExpandedShelter(null);
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          // Where focus lands depends on who opened the dialog. A keyboard
          // opener lands in the field, ready to type a place or a name,
          // which is what a keyboard came here to do. A mouse opener came
          // to click the map, and a text input wears its focus ring however
          // focus arrived, so landing there would open every visit with a
          // ring around an untouched box; the dialog's own container takes
          // the focus instead, ringless, with the field one Tab away. The
          // trigger still holds focus when this runs, so its :focus-visible
          // is what says which of the two just happened; see
          // openedWithKeyboard. Touch devices keep radix's default so the
          // soft keyboard stays down until the box is asked for.
          //
          // preventScroll on both, which is what radix's own FocusScope passes
          // and what this handler takes over from. The column below scrolls,
          // and focusing a control inside a scroller is enough to scroll it:
          // the same move bringIntoList exists to keep off the outer panel.
          if (!hasFinePointer()) return;
          event.preventDefault();
          if (openedWithKeyboard()) {
            searchRef.current?.focus({ preventScroll: true });
            return;
          }
          (event.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          // Focus goes back to the trigger that is on screen, which is not
          // always the trigger that was pressed: this dialog is mounted twice
          // and the pair swap places at lg, so a device rotated past that
          // width while the dialog is open closes onto a display:none control
          // and drops focus on the body. See visibleTrigger, which is also
          // what makes this a no-op wherever nothing is laid out.
          const trigger = visibleTrigger();
          if (!trigger) return;
          event.preventDefault();
          trigger.focus();
        }}
      >
        {/* Selection changes narrate themselves: a region click can toggle
            several shelters at once, and aria-pressed alone does not say how
            many. The label is the one already on the trigger, so the wording
            cannot drift.
            A bulk drop gets a line in front of it, because the label is a
            running total and a total cannot say that twelve shelters just came
            off.

            The search result follows it in the same region rather than in a
            third one: this region is already the dialog's answer to "what does
            the list hold now", and a live region per fact would have three of
            them competing for the same moment. The clauses are assembled in
            reading order, and every one of them can be absent.

            The running result count is the third clause, because filtering is
            live: a click on a region changes the URL on that click, and this
            is the only place the consequence is spoken. It reads as a
            statement rather than as the promise the footer button used to
            carry.

            Silent in found-animal mode, all of it. Every clause here is about
            the adoption filter, and somebody who came in holding a stray does
            not need their shelter selection read out at them. */}
        <p aria-live="polite" className="sr-only">
          {muniMode
            ? ""
            : [
                dropNote && sameValues(dropNote.after, selected)
                  ? dropNote.text
                  : undefined,
                label,
                `${pickerText[locale].showing}: ${animalCount(resultCount, locale)}`,
                searchNews,
              ]
                .filter(Boolean)
                .join(" ")}
        </p>

        {/* The stage. Everything below is absolutely placed against one of its
            edges; the map's paper ground is the dialog's own background, so
            the letterbox a fixed-aspect SVG leaves has something to land on
            whatever the viewport's shape.

            It is also where the sheet's height is declared, once. Two
            elements need that number: the sheet below wears it as its own
            height, and the map stage wears it as a bottom inset so nothing is
            ever drawn under the sheet. They have to agree exactly, or the map
            is drawn behind the sheet or leaves a band of bare paper above it,
            and Tailwind reads class names out of the source text, so it
            cannot be a shared JS constant. A custom property is the shared
            constant CSS has, and this element is the one both consumers
            inherit from.

            The percentage inside it stays honest under that move. var()
            substitutes tokens rather than values, so the 100% is resolved by
            the property it lands in, on the element it lands on; both
            consumers are absolutely positioned children of this box, so both
            resolve it against this box, which is what they resolved against
            when each wrote the expression out for itself.

            --sheet-reserve is the only term that changes with the viewport:
            it is what the map stage keeps for the map and its caption. See
            the panel below for what the terms are for, and for why a short
            wide viewport reserves a flat 6rem instead. */}
        <div
          data-picker-stage
          className="relative h-full w-full overflow-hidden bg-muted/40 [--plate-h:calc(0.65625*var(--picker-w))] [--sheet-reserve:min(calc(var(--plate-h)_+_2.5rem),50%)] [--sheet-h:min(max(55dvh,27.5rem),calc(100%_-_var(--sheet-reserve)))] max-lg:sm:short:[--sheet-reserve:6rem]"
        >
          {/* The recenter container, and the whole of the recentering. The map
              is given only the space the panel leaves, and the SVG letterboxes
              inside it (preserveAspectRatio, the browser's default), so no
              label and no marker can ever end up under the
              panel: not because a transform was tuned to miss it, but because
              the picture is never drawn there in the first place.

              Panel out: the full width less the panel, its right inset and the
              gutter before it, which is 24 + 0.75 + 0.75 rem. Folded: the same
              two gutters around a 3rem rail. Below lg the panel is a bottom
              sheet instead, so what the map gives up is height above the peek
              bar and the width stays whole.

              lg and not md, everywhere the two-column stage is described here
              and below. At 768 the old md dock gave the map 295px beside a
              408px list, which is a map nobody can aim at next to a list that
              still had to scroll. A tablet now gets the same full-width plate a
              phone does, roughly 2.2px per viewBox unit, and the list comes up
              over it in the sheet.

              width is what transitions, not a transform: a transform would
              scale the plate's type and hairlines mid-flight, and this SVG's
              hairlines are a quarter of a unit wide. Checked live at 1280,
              1440 and 1920 and it runs clean, because the only work per frame
              is one SVG relayout of paths that are already computed. */}
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
              panelOpen
                ? "lg:w-[calc(100%-25.5rem)]"
                : "lg:w-[calc(100%-4.5rem)]",
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
                highlightedValue={muniMode ? null : hoveredRowValue}
                matchedValues={
                  // Only a name narrows anything, so only a name has matches
                  // to dim the rest of the country against. A place leaves
                  // every row in the list and would have dimmed nothing while
                  // claiming to have searched.
                  muniMode
                    ? muniShelterIds
                    : searching
                      ? [...visibleRows, ...visibleOffRows].map(
                          (row) => row.value,
                        )
                      : null
                }
                // The ring and named card that answer "so where is that?".
                // Two questions land here: which shelters answer for a picked
                // municipality, and where the one named on an animal card is.
                // Stronger than the hover highlight on purpose, and the only
                // signal phones get.
                spotlightValues={
                  muniMode
                    ? muniShelterIds
                    : spotlitShelterId
                      ? [spotlitShelterId]
                      : null
                }
                // The caption belongs to the municipality answer alone. A
                // shelter named on an animal card is not "the responsible
                // shelter" for anywhere, and an unconditional note said it
                // was; the ring and the name are the whole answer there.
                spotlightNote={muniMode ? messages.muniResponsible : undefined}
                // The other half of that answer: which place is being
                // answered for. Only in municipality mode, and only when the
                // občina is one we hold a centroid for.
                spotlightFrom={
                  muniMode && muniName
                    ? (MUNICIPALITY_AT.get(muniName) ?? null)
                    : null
                }
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
              <p
                // Named, because the licence depends on it staying visible: a
                // test finds this paragraph and walks its ancestors rather
                // than matching on the classes it happens to wear.
                data-slot="map-attribution"
                className="pointer-events-none absolute bottom-0 left-0 max-w-[26rem] rounded-ui bg-background px-1.5 py-0.5 text-3xs leading-tight text-muted-foreground"
              >
                {/* The prose halves are description, not licence. CC BY 4.0
                    asks for the creator, the licence and a link, and those
                    three stay at every width; the sentence they sit in is what
                    a phone can do without. Hidden by CSS rather than dropped
                    from the tree, so the markup is one paragraph and the
                    licence has one home. */}
                <span className="max-lg:hidden">
                  {messages.regionBoundaries}:{" "}
                </span>
                <a
                  href="https://www.gov.si/drzavni-organi/organi-v-sestavi/geodetska-uprava/"
                  className="pointer-events-auto underline underline-offset-2 hover:text-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  GURS
                </a>
                , CC BY 4.0.{" "}
                <span className="max-lg:hidden">
                  {messages.reliefSource}:{" "}
                </span>
                <a
                  href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md"
                  className="pointer-events-auto underline underline-offset-2 hover:text-foreground"
                  target="_blank"
                  rel="noreferrer"
                >
                  Terrain Tiles
                </a>
                <span className="max-lg:hidden"> (AWS Open Data)</span>, SRTM /
                NASA.
              </p>
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

          {/* The title, floated on the paper rather than stacked above the
              map. DialogHeader stays whole because radix names the dialog off
              the title and describes it off the description; only where they
              are drawn has changed. The subtitle stays in the chip: it is the
              one line that says the map is clickable, and a title attribute
              would have said it to nobody with a touch screen. */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(17rem,65%)]">
            {/* Nothing in the chip is a control, so it takes no pointer: on a
                phone it covers the top-left corner of the plate, and with
                pointer-events-auto it swallowed the taps meant for the two
                regions under it. */}
            <DialogHeader className="pointer-events-none gap-0.5 rounded-ui border bg-background/80 px-2.5 py-1.5 shadow-xs backdrop-blur">
              {/* The chip follows the question the dialog is currently
                  asking. One dialog answers two of them, and the found-animal
                  mode used to be titled "Kje iščeš?" over instructions to pick
                  a region: the deep link from the found-animal strip landed on
                  copy about a filter the visitor had not come to set. The
                  municipality mode says what it is and what the map is doing
                  for it; the instruction is one line at both breakpoints,
                  because the answer arrives in the panel either way. */}
              <DialogTitle className="text-sm leading-tight">
                {muniMode ? messages.muniTab : messages.whereSearching}
              </DialogTitle>
              {/* One line, and short enough to stay one line at the widths
                  this chip is given. The instruction used to name the list as
                  a third way in, which cost it a second and a third line over
                  a list that is already on screen in both docks. What is left
                  is the part only the map has to say. */}
              <DialogDescription className="text-xs leading-tight">
                {muniMode
                  ? messages.mapInstructionsMuni
                  : // The two lines differ in whether a single shelter can be
                    // clicked on the map, which is a question about markers,
                    // so the map's own answer is what picks between them.
                    //
                    // It used to be a pair of spans behind md:, one drawn and
                    // one hidden. A breakpoint is the wrong instrument for
                    // this: the plate is limited by whichever of its two axes
                    // runs out first, so a phone held sideways is well past md
                    // with no markers on it and was being told to click one.
                    // See markersVisible above, and onMarkersVisible in
                    // shelter-map.tsx for who measures it.
                    markersVisible
                    ? messages.mapInstructionsDesktop
                    : messages.mapInstructionsMobile}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* The dialog's own close, drawn here instead of by DialogContent:
              the built-in one is pinned to the top-right corner, which is
              where the panel now docks. Over the paper on the opposite side of
              the title, in the same quiet register as the rest of the floating
              chrome. */}
          <DialogClose asChild>
            <Button
              variant="outline"
              size="icon-sm"
              // size-11 below lg is the 44px touch target the mobile
              // hardening asks of every control in this dialog; lg and up gets
              // the smaller square back. Touch targets gate at lg across this
              // dialog because that is where the mobile layout actually ends:
              // the panel is a bottom sheet below lg and a side panel from lg
              // on, so a tablet on the sheet stage still needs a thumb-sized
              // control. The other touch-target sites below follow the same
              // rule without restating it.
              className="absolute right-3 top-3 z-30 size-11 bg-background/85 shadow-xs backdrop-blur lg:size-8"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogClose>

          {/* The panel, one element in two docks. At lg it is a card floated
              against the right edge of the stage, folding to a rail; below lg
              the same card is a bottom sheet, folding to a peek bar. Both
              folds are the same DOM with different classes, so the list, the
              search and whichever shelter is open inside it keep their state
              and their scroll position across either move. */}
          <div
            data-picker-panel={panelOpen ? "open" : "collapsed"}
            data-picker-sheet={sheetOpen ? "open" : "collapsed"}
            className={cn(
              "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t bg-background/95 shadow-lg backdrop-blur",
              PANEL_TRANSITION_CLASS,
              // The sheet used to be a flat 55dvh, which is a fraction of the
              // screen picked for a tall phone and then charged to every
              // short one. Its chrome does not shrink with the viewport: the
              // peek bar, the tab row, the two 44px inputs, the sort row and
              // the pill's reserve come to about 320px whatever the screen
              // is, so at 375x667 the list scroller was left 18px and at
              // 320x568 it was left none at all, with the confirm pill
              // sitting where the first row should have been.
              //
              // Three terms, innermost first:
              //
              //   55dvh          what a tall phone gets, unchanged. At 390x844
              //                  this is still the term that wins, so that
              //                  layout is exactly what it was.
              //   max(…,27.5rem) the floor: 320px of chrome plus three rows of
              //                  about 40px. This is what a short viewport
              //                  gets instead of a fraction, and it is why the
              //                  sheet is sized by what it holds rather than
              //                  by how tall the screen happens to be.
              //   min(…,100%-…) the ceiling, against the stage rather than the
              //                  viewport, so the floor can never push the
              //                  sheet past the dialog it lives in. What it
              //                  subtracts is --sheet-reserve, the map stage's
              //                  own floor.
              //
              // That reserve used to be a flat 9rem, on the reasoning that
              // what the stage has to keep is room for its caption. It is not:
              // it is room for the map and its caption, and the caption was
              // the only half being counted. Measured with the sheet open, the
              // plate came out 335x122 at 375x667, 283x69 at 320x568 and
              // 696x192 on a 768 tablet, which is a 320:210 country drawn at a
              // third of its own proportions in a band of paper. Nothing in
              // the dialog said so, because the SVG letterboxes politely.
              //
              // So the reserve is what the plate needs plus what the caption
              // costs:
              //
              //   --plate-h  the height a whole plate takes at this dialog's
              //              width, which is 210/320 of it (MAP_WIDTH and
              //              MAP_HEIGHT in lib/geo.ts). It reads --picker-w,
              //              declared once on DialogContent and worn there, so
              //              the width is not written twice.
              //   + 2.5rem   the caption under the plate and the stage's own
              //              gap. It was 4rem while the CC BY paragraph shared
              //              that row and ran to two or three lines: 63px at
              //              375 wide, 76px at 320. The credit floats on the
              //              plate now and the row is the legend by itself,
              //              measured at 10px, so the term is the legend and
              //              the gap and nothing else. Measuring the plate
              //              against the whole dialog rather than the padded
              //              stage already covers the edges, so 2.5rem is the
              //              rest.
              //   min(…,50%) and never more than half the stage. Past about
              //              730px of width a whole plate wants more height
              //              than the dialog has, and an uncapped reserve
              //              would go on taking it: at 1000x800 it asked for
              //              697 of a 750px stage and left the list 53. Half
              //              is where the two stop bidding, and it only binds
              //              on a screen wide enough for the map to have won
              //              anyway.
              //
              // A phone is tall and narrow, so the plate term wins there and
              // the cap never comes into it: at 390x844 the reserve is 305 of
              // a 791px stage, the 55dvh term is still under the ceiling, and
              // that layout is untouched. At 375x667 and 320x568 the ceiling
              // is what decides, the sheet gives up the hundred or so pixels
              // the map was missing, and the column below scrolls for the
              // rest.
              //
              // The flat 6rem stands on a viewport that is short and at least
              // sm wide, which is every phone held sideways. There the plate
              // wants 520px of a 365px stage and no split is worth having, so
              // the sheet lands folded instead (see the landing effect above)
              // and this reserve is only what a visitor who raises it anyway
              // is charged: the caption, and nothing for a map they have just
              // said they are not looking at.
              //
              // Both terms live on the stage as --sheet-h and --sheet-reserve,
              // so the height here and the stage's own bottom inset are one
              // expression read twice rather than two written twice.
              sheetOpen ? "h-(--sheet-h) rounded-ui-top" : "h-13",
              "lg:inset-x-auto lg:right-3 lg:top-16 lg:bottom-16 lg:h-auto lg:rounded-ui lg:border",
              panelOpen ? "lg:w-96" : "lg:w-12 lg:justify-center",
            )}
          >
            {/* The peek bar, below lg. The whole strip is the control, because
                on a sheet the strip is the affordance.

                It says the current answer, not the open tab. The tab row inside
                the sheet names the tab and switches it, so a strip repeating
                that word was a label standing where a fact belonged: "Zavetišča"
                over a sheet whose first control already said "Zavetišča". What
                a collapsed sheet has to carry is what the picking added up to,
                which is the same sentence the toolbar trigger wears, computed
                once as `label` above and read here. The count badge stays
                beside it as the at-a-glance form of the same thing.

                Except in found-animal mode, where there is no picking and the
                adoption selection is not the current answer to anything on
                screen. A strip reading "2 od 17 zavetišč" over a form asking
                where a stray was found is that selection riding along under a
                question it has nothing to do with. There the strip names the
                question instead, which is the one case where the tab's own
                word is the fact. */}
            <button
              type="button"
              data-picker-peek
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((current) => !current)}
              className="flex h-13 shrink-0 items-center gap-2 px-4 text-left lg:hidden"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {muniMode ? messages.muniTab : label}
              </span>
              {!muniMode && selected.length > 0 && (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
                  {selected.length}
                </span>
              )}
              <ChevronUp
                className={cn(
                  "ml-auto size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
                  sheetOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            {/* The rail: everything the folded panel still has to say, which is
                which question is open and how much has been picked. One
                control, so the whole rail head takes the click.
                The badge follows the same rule the peek bar does: it counts
                the adoption selection, so it is not shown beside the paw that
                stands for the found-animal question. */}
            {!panelOpen && (
              <button
                type="button"
                data-picker-rail
                aria-expanded={false}
                aria-label={messages.expandPanel}
                onClick={() => setPanelOpen(true)}
                className="hidden shrink-0 flex-col items-center gap-2 p-2 text-muted-foreground transition-colors hover:text-foreground lg:flex"
              >
                <ChevronLeft className="size-4" aria-hidden />
                {muniMode ? (
                  <PawPrint className="size-4" aria-hidden />
                ) : (
                  <List className="size-4" aria-hidden />
                )}
                {!muniMode && selected.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-2xs tabular-nums">
                    {selected.length}
                  </span>
                )}
              </button>
            )}

            {/* The tabs, in both docks. They used to be md:flex only, which
                left the second question unreachable on a phone: the found-
                animal mode could be entered from the strip on the page and
                never from inside the dialog, and once in it the only way back
                to the shelter list was to tap a region and hope. The peek bar
                names the open tab but does not switch it, so a phone had a
                label where the control should be.

                Same fold idiom as the list block below: the row is a flex row,
                and each breakpoint hides it when its own dock is folded, so
                neither a lg:hidden nor a max-lg:hidden ever has to outrank a
                display utility written beside it. */}
            {(panelOpen || sheetOpen) && (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1 px-4 pt-4 pb-2 max-lg:pt-2",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
                {municipalities && municipalities.length > 0 && (
                  // Two questions, two tabs: filter by shelter, or start from a
                  // found animal's občina. Labeled and always visible, so the
                  // second mode is discoverable instead of a footnote. Same
                  // shape as the species tabs, so the site has one tab.
                  <div className="flex min-w-0 shrink gap-1">
                    {(
                      [
                        { mode: false, label: messages.shelters },
                        { mode: true, label: messages.muniTab },
                      ] as const
                    ).map(({ mode, label }) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={muniMode === mode}
                        onClick={() => {
                          setMuniMode(mode);
                          // Either direction: the open details answered a
                          // question asked on the tab being left, and coming
                          // back should not replay it as if just asked.
                          setExpandedShelter(null);
                          if (!mode) {
                            setMuniShelterIds(null);
                            setMuniName(null);
                          }
                        }}
                        data-picker-tab={mode ? "municipality" : "shelters"}
                        className={cn(
                          // 44px of height below lg, the touch target the rest
                          // of this dialog's mobile chrome already keeps. See
                          // the close button above for why this dialog's
                          // touch-target gates sit at lg rather than at md.
                          "inline-flex shrink-0 items-center justify-center rounded-ui px-2.5 py-1 text-sm transition-colors max-lg:min-h-11 max-lg:px-3.5",
                          muniMode === mode
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  data-picker-collapse
                  aria-expanded
                  aria-label={messages.collapsePanel}
                  onClick={() => setPanelOpen(false)}
                  // lg only: below it the peek bar is what folds the dock, and
                  // a second fold control in the sheet would be two answers to
                  // one question.
                  className="ml-auto hidden size-8 shrink-0 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            )}

            {/* Mounted while either dock is out, and hidden at the breakpoint
                whose dock is folded. One copy of the list and one search box,
                whichever way the panel is currently drawn. */}
            {(panelOpen || sheetOpen) && (
              <div
                className={cn(
                  // pt-1 and no more. The tab row above already ends with
                  // pb-2, and anything larger here made the gap under the tabs
                  // two different gaps, so this 4px is not spacing: it is
                  // clearance. A scroller clips at its padding box, and a
                  // control flush against the top edge loses the outer 3px of
                  // its focus ring to that clip. Both branches below open with
                  // an Input, the search box and MunicipalityFinder's own, so
                  // it is paid once here rather than on whichever field the
                  // mode happens to draw. Nothing reserved at the bottom
                  // either: every child of this column, the footer
                  // included, takes its own height in flow.
                  //
                  // overflow-y-auto is the floor under all of that. Everything
                  // above sizes the sheet to what it holds, and on a screen
                  // short enough no size is enough: a 390px viewport held
                  // sideways leaves this column about 160px to seat 300px of
                  // chrome, and while the panel clipped what did not fit, the
                  // list and the confirm button were not on screen at all and
                  // nothing scrolled to reach them. The list is still the one
                  // child that gives way, so this scroller only takes over once
                  // the list has given everything it has; when it does, the
                  // footer is scrolled to rather than cut off, which is what in
                  // flow has to mean on a screen that short. The peek bar and
                  // the tab row sit outside it, so the fold and the tabs never
                  // scroll away from under the thumb.
                  //
                  // Plain, not fade-scroll: that utility takes the scrollbar
                  // away and puts a mask in its place, and this is a last
                  // resort that should say so in the platform's own hand.
                  "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1 pb-4",
                  // And below lg, whatever the home indicator asks for on top
                  // of that. The sheet is the bottom edge of the dialog and
                  // the dialog is nearly the bottom edge of the screen, so on
                  // a phone with a gesture bar the last thing in this column,
                  // which is the way out, sits under it. Only what the dialog
                  // is not already clear of: 94dvh leaves 3dvh below the
                  // frame, which is 12px on a 390px landscape screen against
                  // an inset of 34, so the sum would pad twice for the same
                  // strip of glass and charge a short viewport for it.
                  "max-lg:pb-[calc(1rem+max(0px,env(safe-area-inset-bottom,0px)-3dvh))]",
                  !panelOpen && "lg:hidden",
                  !sheetOpen && "max-lg:hidden",
                )}
              >
                {muniMode && municipalities ? (
                  <MunicipalityFinder
                    entries={municipalities}
                    selectableIds={selectableIds}
                    selected={selected}
                    onToggle={onToggle}
                    onActiveShelters={setMuniShelterIds}
                    onActiveMunicipality={setMuniName}
                  />
                ) : (
                  <>
                    {/* One box, and it takes both ways of narrowing a country:
                where you are, and which shelter you are after. It used to be
                two, stacked, and the visitor had to sort their own sentence
                into the right one before typing it. "Maribor" belonged in
                both.

                What the text is, the text decides. The postal table either
                recognises it, in which case it is a place and the whole list
                sorts to it, or it does not, in which case it is a name and the
                list narrows to the rows carrying it. Typing runs the one into
                the other: "Mari" leaves the Maribor rows, "Maribor" gives them
                all back in order of distance from there. See placeMode and
                searching in the controller, which is where the switch lives.

                The typed origin is still the sort that always works: no
                permission prompt, no fix to wait for, and it answers "which
                shelter is near the town I am moving to" as well as it answers
                "near me". */}
                    <div className="relative shrink-0">
                      {/* The mark tells the visitor which of the two the box
                          has just become, which nothing else on screen does
                          before the list moves under it. Two glyphs and not one
                          tinted glyph, because this is a change of subject, not
                          a change of state: the pin is the place the list is
                          sorting from, the magnifier is the text it is
                          filtering by. */}
                      {placeMode ? (
                        <MapPin
                          data-picker-field-mode="place"
                          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground"
                          aria-hidden
                        />
                      ) : (
                        <Search
                          data-picker-field-mode="name"
                          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <Input
                        ref={searchRef}
                        // Not type="search". WebKit draws that type its own
                        // clear button, and this field already carries one that
                        // puts the focus back where the visitor left it; two
                        // crosses in one box is one too many.
                        type="text"
                        // Both halves of what this takes are words, so the
                        // plain keyboard is right even though half the answers
                        // are four digits: a numeric pad cannot spell Maribor.
                        // And no autofill, because the browser has nothing
                        // stored that fits a box holding either a postcode or a
                        // shelter's name; postal-code, which the place field
                        // used to claim, would offer the visitor's own address
                        // to a field that is as likely to want "Mala hiša".
                        inputMode="text"
                        autoComplete="off"
                        value={query}
                        onChange={(event) => {
                          const next = event.target.value;
                          setQuery(next);
                          // The most recent act wins. Typing a place that resolves is
                          // a newer answer than any fix, so geolocation goes off
                          // rather than quietly outranking what was just typed.
                          // Anything else only clears a stale error, which would
                          // otherwise sit on top of this input's own feedback and make
                          // typing look inert.
                          if (readTypedLocation(next).status === "matched") {
                            turnOffNearby();
                          } else {
                            dismissError();
                          }
                        }}
                        onKeyDown={(event) => {
                          // The top row a key may act on: the first match that has
                          // something to toggle. Both branches below mean the same
                          // row, so it is found once.
                          const first = visibleRows.find(
                            (row) =>
                              (counts.get(row.value) ?? 0) > 0 ||
                              selected.includes(row.value),
                          );
                          if (event.key === "Enter") {
                            event.preventDefault();
                            // Enter means the same thing in both modes, "I am
                            // done with this box", and the modes differ in what
                            // that leaves to do. On a name there is a list of
                            // matches and the top one is what was being aimed
                            // at, so Enter takes it and search-and-pick stays
                            // one gesture; selection and nothing else, the same
                            // as clicking the row, because a row click asks
                            // about nothing. On a place there is nothing to
                            // submit, the sort having already followed the
                            // typing, so the focus comes off the field and the
                            // dialog is left alone. An empty box is the second
                            // case with less in it.
                            if (searching) {
                              if (first) onToggle(first.value);
                            } else {
                              event.currentTarget.blur();
                            }
                            return;
                          }
                          // ArrowDown walks into the list, whichever mode put
                          // the rows there.
                          if (event.key === "ArrowDown" && first) {
                            rowRefs.current.get(first.value)?.focus();
                            event.preventDefault();
                          }
                          // Escape is the dialog's to hear first, so what it does in
                          // this field is decided on DialogContent above.
                        }}
                        // The box holds one answer at a time, so coming back to it
                        // means replacing, not appending. Selecting on focus makes
                        // typing a new postcode over an old one just work.
                        onFocus={(event) => event.currentTarget.select()}
                        enterKeyHint="done"
                        placeholder={messages.placeOrShelter}
                        aria-label={messages.placeOrShelter}
                        aria-describedby={statusId}
                        // 44px tall below lg, the same touch-target rule the rest of
                        // this dialog's mobile chrome keeps; lg and up gets the
                        // denser h-8 back. text-base below lg because iOS Safari
                        // zooms the page whenever a focused input sets type under
                        // 16px, and this dialog is a map: a zoom leaves it unaimable.
                        className="h-11 pl-8 pr-8 text-base lg:h-8 lg:text-sm"
                      />
                      {query !== "" && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            searchRef.current?.focus();
                          }}
                          aria-label={messages.clearField}
                          // The icon stays size-6, but below lg the button's own box
                          // grows to the 44px touch target and re-centers on the same
                          // spot the smaller icon sits at, so the field does not have
                          // to widen for it.
                          className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:text-foreground lg:size-6"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>

                    {/* Directly under the field it is about, where the eye already is
                after typing. Stays mounted so a denied permission is
                announced, not just drawn. */}
                    <p
                      id={statusId}
                      aria-live="polite"
                      className="mt-1 shrink-0 text-2xs leading-tight text-muted-foreground empty:hidden"
                    >
                      {status}
                    </p>

                    <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
                      {/* This changes sort order, not filter state. The icon is a
                  crosshair rather than the sort arrow the sort picker owns:
                  with a typed box above it, this button's job is "use where I
                  am", and sorting is what both of them cause. It steps aside
                  while a typed place drives the sort: the list is already
                  nearest-first, and pressing it then would silently swap the
                  typed origin for the visitor's own. */}
                      {resolved.source !== "typed" && (
                        <button
                          type="button"
                          onClick={toggleNearby}
                          aria-pressed={nearbyOn}
                          className={cn(
                            // max-lg:min-h-9 rather than the full 44px: this row sits
                            // beside the Clear button and a full min-h-11 on both
                            // would force the row itself taller than the layout
                            // wants. 36px still clears the WCAG 2.5.8 minimum and
                            // is a real improvement on the old py-0.5 (about 22px).
                            "inline-flex w-fit items-center gap-1.5 rounded-ui py-0.5 text-xs transition-colors max-lg:min-h-9",
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
                        </button>
                      )}

                      {/* The way back to no shelter at all, and the only reset in the
                  dialog. Named for what it clears rather than with the bare
                  "Počisti" every other sheet in the site uses: this one sits
                  beside a search box and a place box that both have a clear of
                  their own, and the word alone did not say which of the three
                  it meant. Ghost weight, because live filtering means the
                  primary act is picking, not undoing it. */}
                      {selected.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onToggleMany(selected)}
                          // Same max-lg:min-h-9 as the nearest-me toggle beside it.
                          // px-2 and a hover surface give the press a body to land on,
                          // so it reads as a button rather than a stray line of text.
                          className="ml-auto inline-flex items-center rounded-ui px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:min-h-9"
                        >
                          {pickerText[locale].clearSelection} ({selected.length}
                          )
                        </button>
                      )}
                    </div>

                    {/* The list scrolls inside the panel at every size. In the sheet it
                used to be the dialog that scrolled; the sheet's height is
                bounded, so the scrolling has to happen here or the peek bar
                gets pushed off the top of its own sheet.

                min-h-0 is what lets it give way to the fixed rows above it.
                Below lg it may only give way so far: this is the one child of
                the column that is allowed to shrink, so every pixel the chrome
                wants comes out of here, and with a hard zero as the limit the
                list is what disappears first. 5rem is the last resort, not the
                normal case, and it only bites if something above grows past
                what the sheet's own floor budgeted for it, a two-line status
                line under the place field being the likely one, and a landscape
                phone being the certain one. When it does, the overflow lands in
                the column's own scroll rather than in the list, which is the
                right thing to spend: a row that has to be scrolled to can still
                be read, a row that was never given a height cannot. */}
                    <div
                      ref={listRef}
                      // fade-scroll rather than a scrollbar. The group of
                      // shelters with nothing listed sits below the fold at
                      // every height this panel takes, so the list always has
                      // more under it than it shows, and a bare overflow-y-auto
                      // left that to a scrollbar the platform may draw as
                      // nothing at all until it is scrolled. The mask says it
                      // without taking a gutter, which is also why pr-1 goes:
                      // it was insetting the rows off a scrollbar that is no
                      // longer drawn.
                      className="fade-scroll mt-2 min-h-0 flex-1 overflow-y-auto max-lg:min-h-20"
                    >
                      {visibleRows.length === 0 &&
                      visibleOffRows.length === 0 ? (
                        // The one state in this panel that had a bare
                        // underline for a control. Centred in the space the
                        // list is not using, with the reset as a real button:
                        // an empty list is the one moment the panel has room
                        // to spare, and the way out of it should look like
                        // something to press.
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
                            // size-sm draws 32px, and this is the only way out
                            // of a list with nothing in it: the one control on
                            // screen at that moment is the one that can least
                            // afford to be missed by a thumb. The dialog's own
                            // lg gate, as everywhere else here.
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
                            // The parent's own toggle, unwrapped: a row click is a
                            // selection and nothing more, exactly like a marker click.
                            onToggle={onToggle}
                            // What a shelter is, for the one shelter being asked
                            // about. Only the live list needs them: an off-site row
                            // leads to that shelter's own page, which is where its
                            // details already are.
                            summaries={summaries}
                            // Asking about a shelter without touching what is picked.
                            // The row itself cannot carry this: it reports
                            // aria-pressed, so its click has to toggle, and a picked
                            // shelter could never be asked about from its own row. The
                            // two verbs stay apart in both directions, so this handler
                            // goes nowhere near onToggle and onToggle goes nowhere
                            // near this.
                            //
                            // One shelter at a time, decided here because the rows see
                            // one row each and this sees the list.
                            expanded={expandedShelter}
                            onToggleExpanded={toggleExpandedShelter}
                            // The words, from here, because the rows take every word
                            // they show as a prop. Two names for one control, one per
                            // state, and each tooltip's string sits inside the
                            // accessible name that adds the shelter to it (WCAG 2.5.3).
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
                            // What the count pill is counting, said only to a
                            // screen reader: the digits are the row's own mark
                            // and the noun beside "· 113 km" is what stopped
                            // two numbers in one row from reading alike.
                            countLabel={(count) => animalCount(count, locale)}
                            // Two columns from sm up to lg, one column from lg: the
                            // single column is the narrow panel's shape, and the panel
                            // only exists from lg now. In the sheet the list has the
                            // width of the screen and two columns is what fits it.
                            className="sm:grid sm:grid-cols-2 sm:gap-x-3 sm:space-y-0 lg:grid-cols-1 lg:gap-x-0"
                          />

                          {/* Registry shelters without animals, under their own
                      heading so the zeroes read as "not here yet" rather
                      than as empty search results. There is nothing to
                      filter by, but there is a page for each of them, so
                      the rows are links out rather than dead toggles:
                      ShelterRows renders a row with an href as an <a>
                      instead of a toggle button, so the two lists share
                      their layout, their columns and their map-hover
                      scroll echo instead of one copying the other by hand. */}
                          {visibleOffRows.length > 0 &&
                            (visibleRows.length === 0 ? (
                              // Nothing live left for the query, so this group
                              // is not a group, it is the answer. No trigger: a
                              // control that cannot be closed without hiding
                              // the only rows on screen is a dead control, and
                              // a fold over the sole match reads as "not
                              // found" on a list that found it.
                              //
                              // Swapping the trigger for a paragraph unmounts a
                              // focusable element, which would drop focus to
                              // the body if it held it. It cannot here: the
                              // only thing that moves visibleRows is the query,
                              // and the query only moves while focus is in the
                              // search box.
                              <div className="mt-3">
                                <p
                                  id={offGroupId}
                                  className="px-2 pb-1 text-2xs font-medium text-muted-foreground"
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
                                {/* The chevron turns off the trigger's own
                            data-state, which Radix writes and the repo's
                            data-open variant matches, so the open state has one
                            home rather than a copy handed down as a prop. */}
                                <CollapsibleTrigger
                                  id={offGroupId}
                                  className="group flex w-full items-center gap-1 rounded-ui px-2 py-1 text-left text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] max-lg:min-h-9"
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

                    {/* This one is about the map, not about the input, so it stays at
                the bottom of the column. No wrapper: the margin belongs on the
                paragraph itself, so empty:hidden takes the gap away with the
                line. Wrapped, the note cost the list 8px of height on every
                screen where there was no note to read. */}
                    <p className="mt-2 shrink-0 text-2xs leading-tight text-muted-foreground empty:hidden">
                      {missing}
                    </p>

                    {/* The way out, at the foot of the panel it belongs to,
                rather than floating over the map with a shadow under it.

                -mx-4 against the column's px-4 so the rule runs the full width
                of the panel rather than stopping at the text. Full width
                because there is nothing to sit beside it: the reset lives up
                by the search box, with the other two clears.

                A folded panel draws no footer, because the whole column is
                hidden at that breakpoint. The X on the map is a plain
                DialogClose and stays where it is, so folding the list costs
                the count on this button and not the way out. */}
                    {!muniMode && (
                      <div className="sticky bottom-0 z-10 -mx-4 mt-3 shrink-0 border-t bg-background px-4 pt-3">
                        <DialogClose asChild>
                          {/* 44px below lg. The default button height is 36,
                              which is the size the sheet's own budget wanted
                              of the rows in its header; this one is the
                              primary act of the whole dialog and the last
                              control a thumb travels to, so it takes the full
                              target the close and the tabs already take. */}
                          <Button className="w-full max-lg:min-h-11">
                            {doneLabel}
                          </Button>
                        </DialogClose>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
