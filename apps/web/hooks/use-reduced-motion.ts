"use client";

import { useSyncExternalStore } from "react";
import { REDUCED_MOTION_QUERY } from "@/lib/viewport-queries";

function subscribe(notify: () => void) {
  const media = window.matchMedia?.(REDUCED_MOTION_QUERY);
  media?.addEventListener("change", notify);
  return () => media?.removeEventListener("change", notify);
}

/** CSS-driven galleries need the preference, not the animation library. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false,
    () => false,
  );
}
