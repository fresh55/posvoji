import { useLayoutEffect, useRef, useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { interpolate } from "@/lib/i18n-format";
import { animalCount, shelterChipLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerFooter({ controller, hug = false }: {
  controller: LocationPickerController;
  /** Whether the stage above is in flow rather than pinned to the dialog's
   *  edges (view.tsx). The footer follows it: pinned to a box the map no
   *  longer fills, it would sit under a band of nothing. */
  hug?: boolean;
}) {
  const { selectedRows, selected, onToggle, onToggleMany, onClearFilters, onShowAllSpecies, resultCount, counts, doneLabel, locale, messages, markersVisible, sheetOpen, zeroSuggestions } = controller;
  const copy = pickerText[locale];
  const [summaryOpen, setSummaryOpen] = useState(false);
  const firstSelectionRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const summaryTriggerRef = useRef<HTMLButtonElement>(null);
  const summaryInteractedOutsideRef = useRef(false);
  const summaryRowsRef = useRef(new Map<string, HTMLButtonElement>());
  // In the order the panel above reads (byShelterName, in the controller), so
  // the chip, the rows and the index the removal focus walks are all the same
  // list: the chip naming one shelter while the list a press away opened on
  // another was the half of this the sort had not reached.
  const summaryRows = selectedRows;
  const firstSelected = summaryRows[0];
  // The list is only there from two selections (see its trigger below). Shut
  // with it when a selection goes some other way, so the next second pick
  // does not bring it back open.
  if (summaryOpen && summaryRows.length < 2) setSummaryOpen(false);
  const summaryLabel = locale === "sl"
    ? `Pokaži izbrana zavetišča (${selectedRows.length})`
    : `Show selected shelters (${selectedRows.length})`;
  // One way out of a zero, the nearest first: a shelter the filters do find
  // animals in, then the filters, then the species, which no clear touches
  // (pickerRecoveryActions). Built once rather than spelled as three ladders,
  // which is what let the label say one thing while the press did another.
  //
  // The shelter is added beside the pick, not in place of it. The "Pokaži vsa
  // zavetišča" that stood first here threw the visitor's choice away to find
  // what one more shelter would have given them, and it has no case left: a
  // picked shelter with a count would not leave the result at nought, so a
  // nought with animals anywhere always has a shelter to offer. The others are
  // named in the sentence beside it and lead the list (matchesFirst in
  // model.ts). One button and not one per shelter, because from lg a taller
  // footer is a shorter map.
  const suggestion = zeroSuggestions[0];
  // Three by name, with their counts, and how many more after that.
  const named = zeroSuggestions
    .slice(0, 3)
    .map((row) => `${shelterChipLabel(row.label)} (${counts.get(row.value) ?? 0})`)
    .join(", ");
  const more = zeroSuggestions.length - 3;
  const zeroLine = suggestion
    ? `${copy.matchesElsewhere}: ${named}${more > 0 ? ` ${interpolate(copy.andMore, { n: more })}` : ""}.`
    : copy.zeroMatches;

  // The footer's height, handed to the stage it is pinned in, which is what
  // the map and the list stop above (bottom-(--picker-footer-h)). Measured, not
  // tabled: the rows it holds come and go with the state, and the sentence of
  // an empty result is as long as the shelters it names, so a height written
  // in rem for each state was wrong for the long ones and spilled over the
  // map. A layout effect and then the observer, both before paint, so no frame
  // is drawn at a stale height. view.tsx carries a stand-in for the first
  // layout and for a browser with no observer.
  const footerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const footer = footerRef.current;
    const stage = footer?.parentElement;
    if (!footer || !stage || typeof ResizeObserver === "undefined") return;
    const report = () =>
      stage.style.setProperty("--picker-footer-h", `${footer.offsetHeight}px`);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      stage.style.removeProperty("--picker-footer-h");
    };
  }, []);
  const recovery = suggestion
    ? {
        run: () => onToggle(suggestion.value),
        label: `${copy.add} ${shelterChipLabel(suggestion.label)}`,
      }
    : onClearFilters
      ? { run: onClearFilters, label: messages.clearFilters }
      : onShowAllSpecies
        ? { run: onShowAllSpecies, label: messages.showAllSpecies }
        : null;
  return (
    <div
      ref={footerRef}
      data-picker-footer
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex flex-col gap-1 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        // shrink-0 with it: in flow on a short screen the stage above yields
        // its height to a scroller, and this row must not be the thing that
        // gives way instead, because the primary action stands in it.
        hug && "picker-stacked:static picker-stacked:shrink-0",
      )}
    >
      {(selectedRows.length > 0 || resultCount === 0) && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-1">
          {firstSelected && (
            <div role="group" aria-label={copy.selected} className="flex min-h-11 min-w-0 items-center gap-2">
              <Button
                ref={firstSelectionRef}
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedRows.length === 1) resultRef.current?.focus();
                  onToggle(firstSelected.value);
                }}
                aria-label={`${copy.removeSelection}: ${firstSelected.label}`}
                title={firstSelected.label}
                className="h-11 min-w-0 shrink gap-2 border-brand-border bg-brand px-3 text-brand-foreground shadow-none hover:bg-brand hover:text-brand-foreground"
              >
                {/* The short name the rows, the map and the zero line under it
                    already print (shelterChipLabel). "Zavetišče Maribor
                    (Snaga)" beside a list reading "Maribor" was the one place
                    the dialog named a shelter differently, and on a phone it
                    took most of the row. The full name stays in the label and
                    the title. */}
                <span className="max-w-64 truncate">{shelterChipLabel(firstSelected.label)}</span>
                <X className="size-3.5 shrink-0" aria-hidden />
              </Button>
              {/* From two selections, where there is somebody the chip does
                  not name. With one, the button beside the chip read "1" and
                  opened a list of that same one shelter. It used to be offered
                  there too because the long name truncated at 320px and a
                  title is nothing a finger can read; the short name fits. */}
              {summaryRows.length > 1 && (
                <Popover
                  open={summaryOpen}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) summaryInteractedOutsideRef.current = false;
                    setSummaryOpen(nextOpen);
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      ref={summaryTriggerRef}
                      type="button"
                      variant="outline"
                      aria-label={summaryLabel}
                      className="h-11 gap-1.5 px-3 shadow-none"
                    >
                      <span className="tabular-nums">+ {selectedRows.length - 1}</span>
                      <ChevronUp className="size-3.5" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="top"
                    sideOffset={8}
                    collisionPadding={16}
                    aria-label={`${copy.selected}: ${selectedRows.length}`}
                    className="w-80 max-w-[calc(100vw-2rem)] p-2"
                    onInteractOutside={() => { summaryInteractedOutsideRef.current = true; }}
                    onCloseAutoFocus={(event) => {
                      // Let a click on search or the map keep its new focus.
                      // Keyboard dismissal returns to the summary or the
                      // surviving chip when only one selection remains.
                      if (summaryInteractedOutsideRef.current) return;
                      event.preventDefault();
                      (summaryTriggerRef.current ?? firstSelectionRef.current ?? resultRef.current)?.focus();
                    }}
                  >
                    <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
                      {copy.selected}: {selectedRows.length}
                    </p>
                    <div className="max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain">
                      {summaryRows.map((row, index) => (
                        <Button
                          key={row.value}
                          ref={(node) => {
                            if (node) summaryRowsRef.current.set(row.value, node);
                            else summaryRowsRef.current.delete(row.value);
                          }}
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            // Down to one, the list goes with its trigger (the
                            // chip is the whole selection then), and the close
                            // hands focus to that chip (onCloseAutoFocus
                            // above), the trigger it would return to being gone.
                            if (summaryRows.length === 2) {
                              setSummaryOpen(false);
                              onToggle(row.value);
                              return;
                            }
                            const next = summaryRows[index + 1] ?? summaryRows[index - 1];
                            onToggle(row.value);
                            requestAnimationFrame(() => summaryRowsRef.current.get(next.value)?.focus());
                          }}
                          aria-label={`${copy.removeSelection}: ${row.label}`}
                          className="h-auto min-h-11 w-full justify-between gap-3 px-2 py-2 text-left whitespace-normal"
                        >
                          <span className="min-w-0">{row.label}</span>
                          <X className="size-4 text-muted-foreground" aria-hidden />
                        </Button>
                      ))}
                    </div>
                    {/* Everything at once, from the one place that lists
                        everything. Last and not beside the heading: the
                        popover opens with focus on its first control, and a
                        keyboard opening it must land on one shelter's removal,
                        never on the press that empties the lot. It lived in a
                        row above the shelter list once, which appeared with
                        the first pick and pushed the list down under the
                        pointer that made it. */}
                    <div className="mt-1 flex justify-end border-t pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          // The summary and the chips unmount with the
                          // selection, so focus goes to the result button
                          // here and the popover's own close hand-off stands
                          // down rather than aiming at a trigger that is gone.
                          summaryInteractedOutsideRef.current = true;
                          setSummaryOpen(false);
                          resultRef.current?.focus();
                          onToggleMany(selected);
                        }}
                        className="h-11 px-2 text-xs text-muted-foreground"
                      >
                        {copy.clearSelection}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}
          {resultCount === 0 && (
            // No role="status" here: the dialog already has one live region
            // (view.tsx) that carries the result count, and two regions
            // announcing the same zero talked over each other.
            <p data-picker-zero className="text-sm leading-snug">
              <strong>{animalCount(0, locale)}.</strong>{" "}
              {zeroLine}
            </p>
          )}
        </div>
      )}
      {/* How to work the map, in the slot the first pick's chip then takes,
          at the chip row's own height, so the pick swaps one for the other and
          the footer, measured above, keeps its height. It used to stand under the map, where from lg it was
          a line of the map's own height. Only while the map is on screen:
          stacked, the list view has no map to instruct about. */}
      {selectedRows.length === 0 && resultCount > 0 && (
        <p
          data-picker-instruction
          className={cn(
            "flex min-h-11 min-w-0 items-center text-xs leading-snug text-muted-foreground sm:flex-1",
            sheetOpen && "picker-stacked:hidden",
          )}
        >
          {markersVisible
            ? messages.mapInstructionsDesktop
            : messages.mapInstructionsMobile}
        </p>
      )}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto sm:flex-nowrap">
        {resultCount === 0 && recovery && (
          <Button
            variant="outline"
            className={cn(
              "min-h-11 min-w-0 flex-1 shadow-none sm:flex-none",
              // A row of its own on a phone when it names a shelter: beside
              // "Nazaj k rezultatom" at 320px it had 112px and cut the name,
              // the one word the button is there to say.
              suggestion && "basis-full sm:basis-auto",
            )}
            onClick={() => {
              // The button leaves with the empty result it answers, so focus
              // goes to the one that stays rather than to the page.
              resultRef.current?.focus();
              recovery.run();
            }}
          >
            <span className="truncate">{recovery.label}</span>
          </Button>
        )}
        <DialogClose asChild>
          <Button ref={resultRef} className="min-h-11 flex-1 sm:min-w-52 sm:flex-none">{doneLabel}</Button>
        </DialogClose>
      </div>
    </div>
  );
}
