import { Maximize2 } from "lucide-react";
import { MiniMap } from "@/components/filters/mini-map";
import { LocationScopeRow } from "@/components/filters/location-scope-row";
import { QUIET_TRIGGER_CLASS } from "@/components/filters/toolbar-trigger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LocationPickerController } from "./controller";

export function LocationPickerTrigger({
  controller,
  warm,
}: {
  controller: LocationPickerController;
  warm: () => void;
}) {
  const {
    options,
    counts,
    offSite,
    selected,
    open,
    setOpen,
    onToggleMany,
    deepLink,
    dress,
    t,
    pins,
    label,
    triggerRef,
  } = controller;
  return dress === "sidebar" ? (
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
    <Button
      ref={triggerRef}
      onPointerEnter={warm}
      onFocus={warm}
      onClick={() => setOpen(true)}
      variant="outline"
      size="sm"
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={t("shelterPickerLabel", { label })}
      data-picker-trigger
      className={cn(
        "justify-between gap-2 font-normal",
        deepLink === "mobile"
          ? "gap-1.5 px-2"
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
  );
}
