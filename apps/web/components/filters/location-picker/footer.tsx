import { useRef, useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { animalCount } from "@/lib/labels";
import type { LocationPickerController } from "./controller";
import { pickerText } from "./model";

export function PickerFooter({ controller }: { controller: LocationPickerController }) {
  const { selectedRows, selected, onToggle, onToggleMany, onClearFilters, resultCount, counts, doneLabel, locale } = controller;
  const copy = pickerText[locale];
  const [summaryOpen, setSummaryOpen] = useState(false);
  const firstSelectionRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const summaryTriggerRef = useRef<HTMLButtonElement>(null);
  const summaryInteractedOutsideRef = useRef(false);
  const summaryRowsRef = useRef(new Map<string, HTMLButtonElement>());
  const firstSelected = selectedRows[0];
  const summaryLabel = locale === "sl"
    ? `Pokaži izbrana zavetišča (${selectedRows.length})`
    : `Show selected shelters (${selectedRows.length})`;
  const canWidenShelters = selected.length > 0 && [...counts.values()].some((count) => count > 0);
  return (
    <div
      data-picker-footer
      className="absolute inset-x-0 bottom-0 z-30 flex h-(--picker-footer-h) flex-col justify-center gap-1 border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      {(selectedRows.length > 0 || resultCount === 0) && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-1">
          {firstSelected && (
            <div aria-label={copy.selected} className="flex min-h-11 min-w-0 items-center gap-2">
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
                className="h-11 min-w-0 shrink gap-2 border-[var(--filter-accent-border)] bg-[var(--filter-accent)] px-3 text-[var(--filter-accent-foreground)] shadow-none hover:bg-[var(--filter-accent)] hover:text-[var(--filter-accent-foreground)]"
              >
                <span className="max-w-64 truncate">{firstSelected.label}</span>
                <X className="size-3.5 shrink-0" aria-hidden />
              </Button>
              {(selectedRows.length > 1 || summaryOpen) && (
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
                      {selectedRows.map((row, index) => (
                        <Button
                          key={row.value}
                          ref={(node) => {
                            if (node) summaryRowsRef.current.set(row.value, node);
                            else summaryRowsRef.current.delete(row.value);
                          }}
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            const next = selectedRows[index + 1] ?? selectedRows[index - 1];
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
              )}
            </div>
          )}
          {resultCount === 0 && (
            <p role="status" className="text-sm leading-snug">
              <strong>{animalCount(0, locale)}.</strong> {copy.zeroMatches}
            </p>
          )}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        {resultCount === 0 && (canWidenShelters || onClearFilters) && (
          <Button
            variant="outline"
            className="min-h-11 flex-1 shadow-none sm:flex-none"
            onClick={() => canWidenShelters ? onToggleMany(selected) : onClearFilters?.()}
          >
            {canWidenShelters ? copy.allShelters : copy.clearFilters}
          </Button>
        )}
        <DialogClose asChild>
          <Button ref={resultRef} className="min-h-11 flex-1 sm:min-w-52 sm:flex-none">{doneLabel}</Button>
        </DialogClose>
      </div>
    </div>
  );
}
