"use client";

import { useEffect } from "react";
import { DeferredStatus } from "@/components/deferred-status";
import { useDeferredModule, preloadModule } from "@/hooks/use-deferred-module";
import { LocationPickerTrigger } from "./location-picker/trigger";
import { useLocationPickerController } from "./location-picker/controller";
import type { LocationPickerProps } from "./location-picker/contracts";

const loadPicker = () => import("./location-picker/view");

/** Stable public facade for the shelter location picker. */
export function LocationPicker(props: LocationPickerProps) {
  const controller = useLocationPickerController(props);
  const { open, setOpen } = controller;
  const {
    module: picker,
    error,
    retry,
  } = useDeferredModule(loadPicker, open, { warmOnIdle: true });
  useEffect(() => {
    if (!open || picker) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [open, setOpen, picker]);
  return (
    <>
      <LocationPickerTrigger
        controller={controller}
        warm={() => {
          void preloadModule(loadPicker).catch(() => {});
        }}
      />
      {open && !picker && <DeferredStatus error={error} retry={retry} />}
      {picker && <picker.LocationPickerView controller={controller} />}
    </>
  );
}
