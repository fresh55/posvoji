"use client";

import { useEffect, useState } from "react";
import { DeferredStatus } from "@/components/deferred-status";
import { useDeferredModule, preloadModule } from "@/hooks/use-deferred-module";
import {
  useDesktopBreakpoint,
  useDesktopBreakpointClose,
} from "@/hooks/use-desktop-breakpoint-close";
import { usePickerHistory } from "@/hooks/use-picker-history";
import { FilterSheetTrigger } from "./filter-sheet-trigger";
import type { FilterSheetProps } from "./filter-sheet-contract";

export {
  filterSheetReason,
  SORT_ROW_HIDDEN,
  SORT_TOOLBAR_HIDDEN,
} from "./filter-sheet-contract";
export type { ShelterScope } from "./filter-sheet-contract";

const loadSheet = () => import("./filter-sheet-content");

export function FilterSheet(props: FilterSheetProps) {
  const [open, setOpen] = useState(false);
  const desktop = useDesktopBreakpoint();
  const {
    module: sheet,
    error,
    retry,
  } = useDeferredModule(loadSheet, open, { warmOnIdle: true });
  const { onOpenChange } = props;
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  useDesktopBreakpointClose(open, () => setOpen(false));
  // Own history before the chunk arrives, so Back also cancels a slow open.
  usePickerHistory(open, () => setOpen(false));
  useEffect(() => {
    if (!open || sheet) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [open, sheet]);
  const trigger = (
    <FilterSheetTrigger
      activeCount={props.activeCount}
      className={props.className}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-busy={(open && !sheet && !error) || undefined}
      onClick={() => {
        if (!desktop) setOpen(true);
      }}
      onPointerEnter={() => {
        void preloadModule(loadSheet).catch(() => {});
      }}
      onFocus={() => {
        void preloadModule(loadSheet).catch(() => {});
      }}
    />
  );
  // Keep history/breakpoint cleanup above this boundary, but discard the
  // visited mobile panel on desktop. Returning to mobile starts a fresh panel
  // that retains its DOM only after another open.
  return sheet && !desktop ? (
    <sheet.FilterSheetContent
      {...props}
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
    />
  ) : (
    <>
      {trigger}
      {open && !sheet && <DeferredStatus error={error} retry={retry} />}
    </>
  );
}
