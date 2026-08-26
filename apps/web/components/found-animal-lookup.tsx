"use client";

import { MunicipalityFinder } from "@/components/filters/municipality-finder";
import type { LookupEntry } from "@/lib/municipality-coverage";

// Module scope, so the finder's effect sees the same references every render.
const NO_SELECTABLE = new Set<string>();
const NO_SELECTION: string[] = [];
const IGNORE = () => undefined;

// The municipality lookup standing on its own page, outside the map dialog.
//
// A thin client boundary and nothing else: the page above it is a server
// component and MunicipalityFinder takes function props, which cannot cross
// that line. The finder's dialog-only hooks are answered with silence here.
// No selectableIds and no onToggle, so the "select this shelter as a filter"
// button never renders: there is no filter on this page, and the coverage
// card already links to the shelter's own page and its animals on its own.
// The onActive* callbacks fed the dialog's map highlight, and there is no map
// here to light up.
//
// The finder itself needed no changes to live here. Its results list is
// overflow-y-auto behind min-h-0 flex-1, which inside the dialog's fixed
// panel scrolls, and inside a normal document just grows with its content.
export function FoundAnimalLookup({ entries }: { entries: LookupEntry[] }) {
  return (
    <MunicipalityFinder
      entries={entries}
      selectableIds={NO_SELECTABLE}
      selected={NO_SELECTION}
      onToggle={IGNORE}
      onActiveShelters={IGNORE}
    />
  );
}
