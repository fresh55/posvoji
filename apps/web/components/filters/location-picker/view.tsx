import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { MiniMap } from "@/components/filters/mini-map";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Maximize2, X } from "lucide-react";
import type { LocationPickerController } from "./controller";
import {
  openedWithKeyboard,
  pickerText,
  sameValues,
  visibleTrigger,
} from "./model";
import { hasFinePointer } from "./motion";
import { PickerDock } from "./picker-dock";
import { PickerMapStage } from "./picker-map-stage";
import { COUNT_PILL_CLASS } from "./picker-scope";
import { PickerSearch } from "./picker-search";
import { PickerShelterList } from "./picker-shelter-list";

export function LocationPickerView({
  controller,
}: {
  controller: LocationPickerController;
}) {
  const {
    options,
    counts,
    selected,
    onToggleMany,
    resultCount,
    offSite,
    deepLink,
    dress,
    locale,
    messages,
    t,
    open,
    setOpen,
    query,
    setQuery,
    expandedShelter,
    setExpandedShelter,
    dropNote,
    panelOpen,
    sheetOpen,
    searchRef,
    markersVisible,
    pins,
    searchNews,
    label,
  } = controller;

  // What is in scope, and how many shelters that is. Both head rows print it:
  // the peek bar below lg and the panel head from lg. They cannot share an
  // element, because one is the button that folds the sheet and the other
  // stands beside a button that folds the panel, but there is no reason for
  // them to hold two copies of what goes inside. A fragment adds no node, so
  // each head keeps its own box exactly as it was.
  const scopeHeadLabel = (
    <>
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
      {selected.length > 0 && (
        <span
          aria-hidden
          className={cn(COUNT_PILL_CLASS, "shrink-0 text-muted-foreground")}
        >
          {selected.length}
        </span>
      )}
    </>
  );

  const listContent = (
    <PickerShelterList
      counts={controller.counts}
      selected={controller.selected}
      onToggle={controller.onToggle}
      summaries={controller.summaries}
      locale={controller.locale}
      messages={controller.messages}
      t={controller.t}
      query={controller.query}
      setQuery={controller.setQuery}
      expandedShelter={controller.expandedShelter}
      offGroupOpen={controller.offGroupOpen}
      setOffGroupOpen={controller.setOffGroupOpen}
      listRef={controller.listRef}
      searchRef={controller.searchRef}
      offGroupId={controller.offGroupId}
      rowRefs={controller.rowRefs}
      setHoveredRowValue={controller.setHoveredRowValue}
      hoveredMarkerValues={controller.hoveredMarkerValues}
      hoverScrollTo={controller.hoverScrollTo}
      toggleExpandedShelter={controller.toggleExpandedShelter}
      visibleRows={controller.visibleRows}
      visibleOffRows={controller.visibleOffRows}
      detailBase={controller.detailBase}
      offGroupHeading={controller.offGroupHeading}
    />
  );

  const searchContent = (
    <PickerSearch
      selected={controller.selected}
      onToggle={controller.onToggle}
      onToggleMany={controller.onToggleMany}
      locale={controller.locale}
      messages={controller.messages}
      query={controller.query}
      setQuery={controller.setQuery}
      searchRef={controller.searchRef}
      placeMode={controller.placeMode}
      searching={controller.searching}
      statusId={controller.statusId}
      state={controller.state}
      toggleNearby={controller.toggleNearby}
      dismissError={controller.dismissError}
      turnOffNearby={controller.turnOffNearby}
      resolved={controller.resolved}
      rowRefs={controller.rowRefs}
      visibleRows={controller.visibleRows}
      visibleOffRows={controller.visibleOffRows}
      nearbyOn={controller.nearbyOn}
      status={controller.status}
    />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          } else if (
            expandedShelter &&
            (window.matchMedia(DESKTOP_QUERY).matches ? panelOpen : sheetOpen)
          ) {
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

            Search changes have their own live region so typing does not
            repeat the selection and animal totals. */}
        <p aria-live="polite" className="sr-only">
          {[
            dropNote && sameValues(dropNote.after, selected)
              ? dropNote.text
              : undefined,
            label,
            `${pickerText[locale].showing}: ${animalCount(resultCount, locale)}`,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>

        <p data-picker-search-news aria-live="polite" className="sr-only">
          {searchNews}
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
          <PickerMapStage
            selected={controller.selected}
            summaries={controller.summaries}
            messages={controller.messages}
            expandedShelter={controller.expandedShelter}
            spotlitShelterId={controller.spotlitShelterId}
            panelOpen={controller.panelOpen}
            sheetOpen={controller.sheetOpen}
            searching={controller.searching}
            origin={controller.origin}
            hoveredRowValue={controller.hoveredRowValue}
            setHoveredMarkerValues={controller.setHoveredMarkerValues}
            highlightedDensity={controller.highlightedDensity}
            setHighlightedDensity={controller.setHighlightedDensity}
            regionShelterNames={controller.regionShelterNames}
            markersVisible={controller.markersVisible}
            setMarkersVisible={controller.setMarkersVisible}
            setMapFacts={controller.setMapFacts}
            pins={controller.pins}
            handlePick={controller.handlePick}
            visibleRows={controller.visibleRows}
            visibleOffRows={controller.visibleOffRows}
            hasSelected={controller.hasSelected}
            hasMixed={controller.hasMixed}
            hasEmpty={controller.hasEmpty}
          />

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
              {/* The one question this dialog asks. It used to ask two and the
                  chip followed whichever tab was open; the found-animal lookup
                  has a page of its own now (found-animal-page.tsx), so the
                  title is the picker's own and does not move. */}
              <DialogTitle className="text-sm leading-tight">
                {messages.whereSearching}
              </DialogTitle>
              {/* One line, and short enough to stay one line at the widths
                  this chip is given. The instruction used to name the list as
                  a third way in, which cost it a second and a third line over
                  a list that is already on screen in both docks. What is left
                  is the part only the map has to say.
                  The two lines differ in whether a single shelter can be
                  clicked on the map, which is a question about markers, so the
                  map's own answer is what picks between them.
                  It used to be a pair of spans behind md:, one drawn and one
                  hidden. A breakpoint is the wrong instrument for this: the
                  plate is limited by whichever of its two axes runs out first,
                  so a phone held sideways is well past md with no markers on it
                  and was being told to click one. See markersVisible above, and
                  onMarkersVisible in shelter-map.tsx for who measures it. */}
              <DialogDescription className="text-xs leading-tight">
                {options.length === 0
                  ? messages.noAnimalsListed
                  : markersVisible
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
          <PickerDock
            selected={controller.selected}
            messages={controller.messages}
            panelOpen={controller.panelOpen}
            setPanelOpen={controller.setPanelOpen}
            sheetOpen={controller.sheetOpen}
            setSheetOpen={controller.setSheetOpen}
            missing={controller.missing}
            doneLabel={controller.doneLabel}
            scopeHeadLabel={scopeHeadLabel}
            searchContent={searchContent}
            listContent={listContent}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
