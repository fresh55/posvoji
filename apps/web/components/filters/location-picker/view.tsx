import { List, Map, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import { animalCount } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";
import { PickerFooter } from "./footer";
import { PickerMapStage } from "./picker-map-stage";
import { PickerDock } from "./picker-dock";
import { openedWithKeyboard, pickerText, sameValues, visibleTrigger } from "./model";
import { hasFinePointer } from "./motion";

export function LocationPickerView({
  controller,
}: {
  controller: LocationPickerController;
}) {
  const {
    selected, resultCount,
    locale, messages, open, setOpen, query, setQuery,
    expandedShelter, setExpandedShelter, dropNote, searchRef, label,
    searchNews, sheetOpen, setSheetOpen,
  } = controller;
  // Below lg the two views are one at a time, and the map view is the one
  // whose height its content decides. At lg the panel stands beside the map
  // and both fill the frame, which is what every lg: class below restores.
  const hugMap = !sheetOpen;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogContent
        className={cn(
          // 94vw counts the notch: a phone held sideways reserves 44px on
          // one edge, and the dialog's border and the first of the header's
          // padding sat under it. The insets come off the viewport share
          // before it is capped, and they are 0 everywhere else, so nothing
          // on a desktop or an emulator moves. The footer already does the
          // bottom one.
          "flex w-(--picker-w) flex-col [--picker-w:min(calc(94vw_-_env(safe-area-inset-left,0px)_-_env(safe-area-inset-right,0px)),84rem)] max-w-none gap-0 overflow-hidden p-0 shadow-xl",
          // Top-aligned below lg, where the height is no longer the same in
          // both views. Centred, a dialog that shrinks re-centres, and the
          // view switch the visitor just pressed would slide down the screen
          // under their finger. Pinned, only the bottom edge moves.
          "max-lg:top-4 max-lg:translate-y-0",
          // The map is width-bound: a 320 x 210 plate in a 341px column can
          // only be 224px tall, so reserving the full dialog height for it
          // left 141px of empty above it and 141 below (measured, 390x844).
          // Below lg the map view is sized by what it draws instead, and only
          // the list, which is as long as the roster, keeps the full height.
          hugMap
            ? "h-auto max-h-[94dvh] lg:h-[min(94dvh,52rem)] lg:max-h-none"
            : "h-[min(94dvh,52rem)] max-h-none",
        )}
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          } else if (expandedShelter && (window.matchMedia(DESKTOP_QUERY).matches || sheetOpen)) {
            // Focus on the link inside the panel would go down with it and
            // land on the dialog root; the row it belongs to takes it first.
            if (document.activeElement?.closest("[data-shelter-details-panel]")) {
              controller.rowRefs.current.get(expandedShelter)?.focus();
            }
            setExpandedShelter(null);
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (!hasFinePointer()) return;
          event.preventDefault();
          if (openedWithKeyboard()) {
            searchRef.current?.focus({ preventScroll: true });
            return;
          }
          (event.currentTarget as HTMLElement).focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          const trigger = visibleTrigger() ?? controller.triggerRef.current;
          if (!trigger) return;
          event.preventDefault();
          trigger.focus({ preventScroll: true });
        }}
      >
        {/* One region, one span per fact. As a single text node every
            keystroke replaced the whole string, so a search re-announced the
            selection and the running total with it; a screen reader reads the
            child that changed once the region has more than one. The spaces
            between them are written out, so the region's text still reads as
            separate facts however many of them there are. */}
        <p aria-live="polite" className="sr-only">
          {dropNote && sameValues(dropNote.after, selected) ? (
            <span>{dropNote.text}</span>
          ) : null}{" "}
          <span>{label}</span>{" "}
          <span>{`${pickerText[locale].showing}: ${animalCount(resultCount, locale)}`}</span>{" "}
          {searchNews ? <span>{searchNews}</span> : null}
        </p>
        {/* short:py-2 because on a screen with no height to spare this header
            takes a share of the dialog nothing else in it does: 133px of 414
            on a 390-wide phone with the keyboard up. The map is what pays for
            it, and on a phone held sideways at 844 by 390 those 8px are what
            carry the plate to 300px drawn, which is where
            map-region-names.tsx starts naming regions; under it the country
            is unlabelled. Every other block in the picker has a short: rule;
            this one had none. Only the padding: the close button is 44px tall
            and sets the row's height by itself. */}
        <div data-picker-header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b bg-background px-4 py-3 short:py-2 sm:px-6">
          <DialogHeader className="min-w-0 flex-1 gap-1 text-left">
            <DialogTitle className="text-lg font-semibold leading-tight sm:text-xl">
              {pickerText[locale].chooseShelters}
            </DialogTitle>
            {/* For assistive tech only. On screen it restated the title in
                grey, a second line nobody needed to read to use the dialog. */}
            <DialogDescription className="sr-only">
              {pickerText[locale].chooseSheltersHint}
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            data-picker-view-switch
            type="single"
            value={sheetOpen ? "list" : "map"}
            onValueChange={(value) => { if (value) setSheetOpen(value === "list"); }}
            aria-label={locale === "sl" ? "Pogled zavetišč" : "Shelter view"}
            spacing={1}
            // w-full and not a capped width: the cap is what keeps the switch
            // on a row of its own. A max-width clamps the hypothetical size
            // the flex line is measured with, and the title beside it is
            // flex-1, which contributes nothing to that measurement, so at 639
            // a 384px switch packs onto the title's row and the title breaks
            // into two lines with the close button between them (measured).
            className="order-last w-full rounded-ui bg-muted p-1 sm:order-none sm:w-auto lg:hidden"
          >
            <ToggleGroupItem value="list" data-picker-show-list aria-label={pickerText[locale].showList} className="h-11 min-w-0 flex-1 gap-2 text-sm data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-background data-[state=on]:hover:text-foreground sm:min-w-28 sm:flex-none">
              <List className="size-4" aria-hidden />
              {locale === "sl" ? "Seznam" : "List"}
            </ToggleGroupItem>
            <ToggleGroupItem value="map" data-picker-show-map aria-label={pickerText[locale].showMap} className="h-11 min-w-0 flex-1 gap-2 text-sm data-[state=on]:border-border data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-background data-[state=on]:hover:text-foreground sm:min-w-28 sm:flex-none">
              <Map className="size-4" aria-hidden />
              {locale === "sl" ? "Zemljevid" : "Map"}
            </ToggleGroupItem>
          </ToggleGroup>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="order-1 size-11 self-start sm:order-last">
              <X className="size-4" aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogClose>
        </div>
        <div
          data-picker-stage
          className={cn(
            "relative min-h-0 w-full flex-1 overflow-hidden bg-muted/30 [--picker-footer-h:calc(var(--picker-footer-base)_+_env(safe-area-inset-bottom,0px))]",
            // A column its two children stand in, rather than a box they are
            // pinned to the edges of. Only where the height comes from them.
            hugMap && "max-lg:flex max-lg:flex-col",
            resultCount === 0
              ? selected.length > 0 ? "[--picker-footer-base:10.5rem] sm:[--picker-footer-base:7rem]" : "[--picker-footer-base:8.5rem] sm:[--picker-footer-base:6rem]"
              : selected.length > 0 ? "[--picker-footer-base:7.25rem] sm:[--picker-footer-base:5rem]" : "[--picker-footer-base:4.75rem] sm:[--picker-footer-base:5rem]",
          )}
        >
          <PickerMapStage controller={controller} hug={hugMap} />
          <PickerDock controller={controller} />
          <PickerFooter controller={controller} hug={hugMap} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
