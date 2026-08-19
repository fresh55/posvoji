"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { LatLon } from "@/lib/geo";

export type NearbyState =
  | { status: "off" }
  | { status: "locating" }
  | { status: "on"; at: LatLon }
  | { status: "error"; message: string };

const TIMEOUT_MS = 10000;
const MAX_AGE_MS = 300000;

// A permission prompt is not a filter. Sorting by distance is an extra the
// panel offers once a fix arrives; until then, and if it never does, the
// shelters stay listed and selectable exactly as before.
export function useNearby() {
  const { messages } = useI18n();
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
      setState({ status: "error", message: messages.geolocationUnsupported });
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
          message:
            {
              1: messages.geolocationDenied,
              2: messages.geolocationUnavailable,
              3: messages.geolocationTimeout,
            }[error.code] ?? messages.geolocationUnavailable,
        });
      },
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }, [messages, state.status]);

  // An error is news until the user does something newer. Typing a place is
  // that newer thing, so the picker can put the error away instead of letting
  // it sit on top of the typed sort's own feedback.
  const dismissError = useCallback(() => {
    setState((current) =>
      current.status === "error" ? { status: "off" } : current,
    );
  }, []);

  // The most recent act wins. Typing a place that resolves is a newer answer to
  // "where are you" than a fix the user asked for before, so the picker can
  // switch this off outright, including while a fix is still in flight: bumping
  // the attempt is what makes the pending callback land on nothing.
  const turnOff = useCallback(() => {
    attempt.current += 1;
    setState((current) => (current.status === "off" ? current : { status: "off" }));
  }, []);

  return { state, toggle, dismissError, turnOff };
}
