import { useRef, useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { animalCount } from "@/lib/labels";
import { CONTROL_FRAME } from "@/lib/link-styles";
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
  const { selectedRows, selected, onToggle, onToggleMany, onClearFilters, onShowAllSpecies, resultCount, counts, doneLabel, locale, messages } = controller;
  const copy = pickerText[locale];
  const [summaryOpen, setSummaryOpen] = useState(false);
  const firstSelectionRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const summaryTriggerRef = useRef<HTMLButtonElement>(null);
  const summaryInteractedOutsideRef = useRef(false);
  const summaryRowsRef = useRef(new Map<string, HTMLButtonElement>());
  // The panel above reads alphabetically; the selection arrives in URL order.
  // Sorted once, so the chip, the rows and the index the removal focus walks
  // are all the same list: the chip naming one shelter while the list a press
  // away opened on another was the half of this the sort had not reached.
  const summaryRows = [...selectedRows].sort((a, b) => a.label.localeCompare(b.label, locale));
  const firstSelected = summaryRows[0];
  const summaryLabel = locale === "sl"
    ? `Pokaži izbrana zavetišča (${selectedRows.length})`
    : `Show selected shelters (${selectedRows.length})`;
  const canWidenShelters = selected.length > 0 && [...counts.values()].some((count) => count > 0);
  // One way out of a zero, the nearest first: the shelters where something is,
  // then the filters, then the species, which no clear touches
  // (pickerRecoveryActions). Built once rather than spelled as three ladders,
  // which is what let the label say one thing while the press did another.
  const recovery = canWidenShelters
    ? { run: () => onToggleMany(selected), label: copy.showAllShelters }
    : onClearFilters
      ? { run: onClearFilters, label: messages.clearFilters }
      : onShowAllSpecies
        ? { run: onShowAllSpecies, label: messages.showAllSpecies }
        : null;
  return (
    <div
      data-picker-footer
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex h-(--picker-footer-h) flex-col justify-center gap-1 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        // shrink-0 with it: in flow on a short screen the stage above yields
        // its height to a scroller, and this row must not be the thing that
        // gives way instead, because the primary action stands in it.
        hug && "max-lg:static max-lg:shrink-0",
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
                <span className="max-w-64 truncate">{firstSelected.label}</span>
                <X className="size-3.5 shrink-0" aria-hidden />
              </Button>
              {/* Offered from one selection, not two: at 320 a long name
                  truncates in the chip, and title is nothing a finger can
                  read. */}
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
                      <span className="tabular-nums">{selectedRows.length > 1 ? `+ ${selectedRows.length - 1}` : "1"}</span>
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
                            const next = summaryRows[index + 1] ?? summaryRows[index - 1];
                            if (!next) {
                              setSummaryOpen(false);
                              resultRef.current?.focus();
                            }
                            onToggle(row.value);
                            if (next) requestAnimationFrame(() => summaryRowsRef.current.get(next.value)?.focus());
                          }}
                          aria-label={`${copy.removeSelection}: ${row.label}`}
                          className="h-auto min-h-11 w-full justify-between gap-3 px-2 py-2 text-left whitespace-normal"
                        >
                          <span className="min-w-0">{row.label}</span>
                          <X className="size-4 text-muted-foreground" aria-hidden />
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
            </div>
          )}
          {resultCount === 0 && (
            // No role="status" here: the dialog already has one live region
            // (view.tsx) that carries the result count, and two regions
            // announcing the same zero talked over each other.
            <p className="text-sm leading-snug">
              <strong>{animalCount(0, locale)}.</strong> {copy.zeroMatches}
            </p>
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        {resultCount === 0 && recovery && (
          <Button
            variant="outline"
            // The one control in this row that is a frame and nothing else:
            // no fill, no ink of its own, standing beside the filled primary.
            // --border measures 1.26:1 light and 1.47:1 dark on this ground,
            // which is a divider's strength and not a component's; the grid's
            // empty state answers the same case with the same token.
            className={cn(
              "min-h-11 flex-1 shadow-none sm:flex-none",
              CONTROL_FRAME,
            )}
            onClick={recovery.run}
          >
            {recovery.label}
          </Button>
        )}
        <DialogClose asChild>
          <Button ref={resultRef} className="min-h-11 flex-1 sm:min-w-52 sm:flex-none">{doneLabel}</Button>
        </DialogClose>
      </div>
    </div>
  );
}
