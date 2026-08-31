import { useCallback, useEffect, useRef, useState } from "react";

/** The same cutoff as globals.css's `short` variant. */
export const SHORT_VIEWPORT_QUERY = "(max-height: 32rem)";

/** A pointer that can aim and hover, which is what decides where an open puts
 *  focus. Named rather than written out at the call site, the same as NO_HOVER
 *  in shelter-map.tsx: the test stubs matchMedia and has to answer the exact
 *  string the component asks for, and a literal in both files drifts silently.
 */
export const FINE_POINTER = "(pointer: fine)";

/** The map and dock transition together; keeping both timings here prevents
 * one half of the recentering animation from drifting away from the other. */
export const MAP_STAGE_TRANSITION_CLASS =
  "transition-[width,bottom] duration-500 ease-out motion-reduce:transition-none";
export const PANEL_TRANSITION_CLASS =
  "transition-[height,width] duration-500 ease-out motion-reduce:transition-none";

export function hasHeightToSpare(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia?.(SHORT_VIEWPORT_QUERY).matches;
}

export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(FINE_POINTER).matches ?? false;
}

/** Owns the two responsive docks and the once-per-open landing decision. */
export function useLocationPickerMotion(open: boolean) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(true);
  const landedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      landedRef.current = false;
      return;
    }
    if (landedRef.current) return;
    landedRef.current = true;
    setSheetOpen(hasHeightToSpare());
  }, [open]);

  const landSheet = useCallback(() => {
    landedRef.current = true;
    setSheetOpen(true);
  }, []);

  const landSpotlight = useCallback(() => {
    landedRef.current = true;
    setPanelOpen(true);
    setSheetOpen(true);
  }, []);

  const revealSelection = useCallback(() => {
    setPanelOpen(true);
    if (hasHeightToSpare()) setSheetOpen(true);
  }, []);

  const resetDocks = useCallback(() => {
    setPanelOpen(true);
    setSheetOpen(true);
  }, []);

  return {
    panelOpen,
    setPanelOpen,
    sheetOpen,
    setSheetOpen,
    landSheet,
    landSpotlight,
    revealSelection,
    resetDocks,
  };
}
