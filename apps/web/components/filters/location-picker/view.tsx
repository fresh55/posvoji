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
                ?
                  "gap-1.5 px-2"
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
        className="flex h-[min(94dvh,52rem)] w-(--picker-w) flex-col [--picker-w:min(94vw,84rem)] max-h-none max-w-none gap-0 overflow-hidden p-0 shadow-xl"
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
            resultCount === 0
              ? selected.length > 0 ? "[--picker-footer-base:10.5rem] sm:[--picker-footer-base:7rem]" : "[--picker-footer-base:8.5rem] sm:[--picker-footer-base:6rem]"
              : selected.length > 0 ? "[--picker-footer-base:7.25rem] sm:[--picker-footer-base:5rem]" : "[--picker-footer-base:4.75rem] sm:[--picker-footer-base:5rem]",
          )}
        >
          <PickerMapStage controller={controller} />
          <PickerDock controller={controller} />
          <PickerFooter controller={controller} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
