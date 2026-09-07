import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, ChevronUp, List } from "lucide-react";
import type { ReactNode } from "react";
import type { LocationPickerController } from "./controller";
import { PANEL_TRANSITION_CLASS } from "./motion";
import { COUNT_PILL_CLASS } from "./picker-scope";

export function PickerDock({
  selected,
  messages,
  panelOpen,
  setPanelOpen,
  sheetOpen,
  setSheetOpen,
  missing,
  doneLabel,
  scopeHeadLabel,
  searchContent,
  listContent,
}: Pick<
  LocationPickerController,
  | "selected"
  | "messages"
  | "panelOpen"
  | "setPanelOpen"
  | "sheetOpen"
  | "setSheetOpen"
  | "missing"
  | "doneLabel"
> & {
  scopeHeadLabel: ReactNode;
  searchContent: ReactNode;
  listContent: ReactNode;
}) {
  return (
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

                It says the current answer, not the name of what is behind it.
                A strip reading "Zavetišča" over a sheet whose first control
                already said so was a label standing where a fact belonged.
                What a collapsed sheet has to carry is what the picking added
                up to, which is the same sentence the toolbar trigger wears,
                computed once as `label` above and read here. The count badge
                stays beside it as the at-a-glance form of the same thing. */}
      <button
        type="button"
        data-picker-peek
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen((current) => !current)}
        className="flex h-13 shrink-0 items-center gap-2 px-4 text-left lg:hidden"
      >
        {scopeHeadLabel}
        <ChevronUp
          className={cn(
            "ml-auto size-4 text-muted-foreground transition-transform motion-reduce:transition-none",
            sheetOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* The rail: everything the folded panel still has to say, which is
                that there is a list behind it and how much has been picked.
                One control, so the whole rail head takes the click. */}
      <div
        data-picker-panel-head={panelOpen || undefined}
        className={cn(
          "hidden shrink-0 lg:flex",
          panelOpen
            ? "items-center justify-between gap-2 px-4 pt-4 pb-2"
            : "flex-col items-center p-2",
        )}
      >
        {panelOpen && (
          <span className="flex min-w-0 items-center gap-2">
            {scopeHeadLabel}
          </span>
        )}
        <button
          type="button"
          data-picker-rail={!panelOpen || undefined}
          data-picker-collapse={panelOpen || undefined}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? messages.collapsePanel : messages.expandPanel}
          onClick={() => setPanelOpen((current) => !current)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {panelOpen ? (
            <ChevronRight className="size-4" aria-hidden />
          ) : (
            <ChevronLeft className="size-4" aria-hidden />
          )}
          {!panelOpen && selected.length > 0 && (
            <span aria-hidden className={COUNT_PILL_CLASS}>
              {selected.length}
            </span>
          )}
        </button>
        {!panelOpen && (
          <List className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>

      {/* Mounted while either dock is out, and hidden at the breakpoint
                whose dock is folded. One copy of the list and one search box,
                whichever way the panel is currently drawn. */}
      {(panelOpen || sheetOpen) && (
        <div
          className={cn(
            // pt-1 and no more at lg. The head row above already ends
            // with pb-2, and anything larger here made the gap under it
            // two different gaps, so this 4px is not spacing: it is
            // clearance. A scroller clips at its padding box, and the
            // search box flush against the top edge loses the outer 3px
            // of its focus ring to that clip. Nothing reserved at the
            // bottom either: every child of this column, the footer
            // included, takes its own height in flow.
            //
            // Below lg there is no head row to be clear of, only the peek
            // bar, so this column pays the gap itself: pt-3, which is
            // what the vanished tab row used to leave between the strip
            // and the field.
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
            // flow has to mean on a screen that short. The peek bar sits
            // outside it, so the fold never scrolls away from under the
            // thumb.
            //
            // Plain, not fade-scroll: that utility takes the scrollbar
            // away and puts a mask in its place, and this is a last
            // resort that should say so in the platform's own hand.
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-1 pb-4 max-lg:pt-3",
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
          {searchContent}

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
          {listContent}

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
          <div className="sticky bottom-0 z-10 -mx-4 mt-3 shrink-0 border-t bg-background px-4 pt-3">
            <DialogClose asChild>
              {/* 44px below lg. The default button height is 36,
                        which is the size the sheet's own budget wanted of
                        the rows in its header; this one is the primary act
                        of the whole dialog and the last control a thumb
                        travels to, so it takes the full target the close
                        button already takes. */}
              <Button className="w-full max-lg:min-h-11">{doneLabel}</Button>
            </DialogClose>
          </div>
        </div>
      )}
    </div>
  );
}
