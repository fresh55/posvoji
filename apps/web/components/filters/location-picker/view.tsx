import { List, Map, Maximize2, X } from "lucide-react";
import { MiniMap } from "@/components/filters/mini-map";
import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
    options, counts, selected, onToggleMany, resultCount, offSite,
    deepLink, dress, locale, messages, t, open, setOpen, query, setQuery,
    expandedShelter, setExpandedShelter, dropNote, searchRef, pins, label,
    searchNews, sheetOpen, setSheetOpen, panelOpen,
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
      {dress === "sidebar" ? (
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
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={t("shelterPickerLabel", { label })}
            data-picker-trigger
            className={cn(
              "justify-between gap-2 font-normal",
              deepLink === "mobile"
                ? // The dock's trigger, and on the dock the frame is the
                  // whole of what says this is pressable: it stands on the
                  // plate's own ground with no fill of its own, and the
                  // outline variant's --border measured 1.26:1 light and
                  // 1.47:1 dark against it, with the plate's edge over a
                  // light card at 1.14:1. --control-border is the token for a
                  // frame that is the affordance (3.66:1 light, 3.77:1 dark,
                  // globals.css). The dark: term is not a repeat: the variant
                  // ships `dark:border-input` of its own, and twMerge keeps a
                  // dark:* border beside an unprefixed one, so without it the
                  // washed frame survives in dark mode.
                  "gap-1.5 border-control-border px-2 dark:border-control-border"
                : cn(
                    QUIET_TRIGGER_CLASS,
                    "max-w-[14rem] aria-expanded:border-border",
                  ),
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MiniMap
                pins={pins}
                selected={selected}
                className="hidden h-4 w-auto shrink-0 text-foreground opacity-60 min-[360px]:inline-block"
              />
              <span className="truncate">{label}</span>
            </span>
            <Maximize2 className="size-3.5 opacity-50" aria-hidden />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(
          "flex w-(--picker-w) flex-col [--picker-w:min(94vw,84rem)] max-w-none gap-0 overflow-hidden p-0 shadow-xl",
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
        closeLabel={messages.close}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          if (target === searchRef.current && query !== "") {
            setQuery("");
            event.preventDefault();
          } else if (expandedShelter && (window.matchMedia(DESKTOP_QUERY).matches ? panelOpen : sheetOpen)) {
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
          const trigger = visibleTrigger();
          if (!trigger) return;
          event.preventDefault();
          trigger.focus({ preventScroll: true });
        }}
      >
        <p aria-live="polite" className="sr-only">
          {[
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
        <div data-picker-header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b bg-background px-4 py-3 sm:px-6">
          <DialogHeader className="min-w-0 flex-1 gap-1 text-left">
            <DialogTitle className="text-lg font-semibold leading-tight sm:text-xl">
              {pickerText[locale].chooseShelters}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-snug">
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
