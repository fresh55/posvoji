import { useCallback, useEffect, useRef, useState } from "react";

import { SHORT_VIEWPORT_QUERY } from "@/lib/viewport-queries";

export { SHORT_VIEWPORT_QUERY };

/** A pointer that can aim and hover, which is what decides where an open puts
 *  focus. Named rather than written out at the call site, the same as NO_HOVER
 *  in shelter-map.tsx: the test stubs matchMedia and has to answer the exact
 *  string the component asks for, and a literal in both files drifts silently.
 */
export const FINE_POINTER = "(pointer: fine)";

export function hasHeightToSpare(): boolean {
  if (typeof window === "undefined") return true;
  return !window.matchMedia?.(SHORT_VIEWPORT_QUERY).matches;
}

export function hasFinePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(FINE_POINTER).matches ?? false;
}

/** Owns the phone sheet and the once-per-open landing decision. From lg the
 *  list always stands beside the map, so there is no dock state there. */
export function useLocationPickerMotion(open: boolean) {
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

  const landSpotlight = useCallback(() => {
    landedRef.current = true;
    setSheetOpen(true);
  }, []);

  const revealSelection = useCallback(() => {
    if (hasHeightToSpare()) setSheetOpen(true);
  }, []);

  const resetDocks = useCallback(() => {
    setSheetOpen(true);
  }, []);

  return {
    sheetOpen,
    setSheetOpen,
    landSpotlight,
    revealSelection,
    resetDocks,
  };
}
