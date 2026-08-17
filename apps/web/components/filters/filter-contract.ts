import type { MultiGroup, ToggleKey } from "@/lib/filters";

/** Shared actions passed through the filter UI frames. */
export type FilterActionContract = {
  onToggle: (group: MultiGroup, value: string) => void;
  onToggleMany: (group: MultiGroup, values: string[]) => void;
  onToggleProperty: (key: ToggleKey) => void;
  onToggleManyProperties: (values: ToggleKey[]) => void;
};
