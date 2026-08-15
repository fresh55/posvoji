"use client";

import { useCallback, useRef, useState } from "react";
import type { LatLon } from "@/lib/geo";

export type NearbyState =
  | { status: "off" }
  | { status: "locating" }
  | { status: "on"; at: LatLon }
  | { status: "error"; message: string };

const TIMEOUT_MS = 10000;
const MAX_AGE_MS = 300000;

// GeolocationPositionError codes, in the order the spec numbers them.
const MESSAGES: Record<number, string> = {
  1: "Dostop do lokacije je zavrnjen.",
  2: "Lokacije ni bilo mogoče določiti.",
  3: "Iskanje lokacije je trajalo predolgo.",
};

// A permission prompt is not a filter. Sorting by distance is an extra the
// panel offers once a fix arrives; until then, and if it never does, the
// shelters stay listed and selectable exactly as before.
export function useNearby() {
  const [state, setState] = useState<NearbyState>({ status: "off" });
  // Bumped on every press, so a fix that resolves after the user switched the
  // sort back off is discarded instead of reordering the list under them.
  const attempt = useRef(0);

  const toggle = useCallback(() => {
    attempt.current += 1;

    if (state.status === "on" || state.status === "locating") {
      setState({ status: "off" });
      return;
    }

    if (!navigator.geolocation) {
      setState({ status: "error", message: "Brskalnik ne pozna lokacije." });
      return;
    }

    const current = attempt.current;
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (current !== attempt.current) return;
        setState({
          status: "on",
          at: { lat: coords.latitude, lon: coords.longitude },
        });
      },
      (error) => {
        if (current !== attempt.current) return;
        setState({
          status: "error",
          message: MESSAGES[error.code] ?? "Lokacije ni bilo mogoče določiti.",
        });
      },
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }, [state.status]);

  return { state, toggle };
}
