"use client";

import { LocationPickerView } from "./location-picker/view";
import { useLocationPickerController } from "./location-picker/controller";
import type { LocationPickerProps } from "./location-picker/contracts";

/** Stable public facade for the shelter location picker. */
export function LocationPicker(props: LocationPickerProps) {
  const controller = useLocationPickerController(props);
  return <LocationPickerView controller={controller} />;
}
