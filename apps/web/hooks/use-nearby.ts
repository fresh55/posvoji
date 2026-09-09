"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { LatLon } from "@/lib/geo";
import type { TypedLocation } from "@/lib/origin";

export type NearbyState =
  | { status: "off" }
  | { status: "locating" }
  | { status: "on"; at: LatLon }
  | { status: "error"; message: string };

export type NearbyChosenPlace = {
  location: Extract<TypedLocation, { status: "matched" }>;
  query: string;
} | null;

const TIMEOUT_MS = 10000;
const MAX_AGE_MS = 300000;
const OFF: NearbyState = { status: "off" };
// Both responsive pickers control one page-session location. Never persisted.
let state: NearbyState = OFF;
let query = "";
let chosenPlace: NearbyChosenPlace = null;
let attempt = 0;
let deadline: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => {
  for (const listener of listeners) listener();
};
function cancel() {
  attempt += 1;
  clearTimeout(deadline);
  deadline = undefined;
}
function setState(next: NearbyState) {
  state = next;
  emit();
}
function setQuery(next: string) {
  query = next;
  emit();
}
export function useNearbyQuery() {
  const value = useSyncExternalStore(
    subscribe,
    () => query,
    () => "",
  );
  return [value, setQuery] as const;
}
function setChosenPlace(next: NearbyChosenPlace) {
  chosenPlace = next;
  emit();
}
export function useNearbyChosenPlace() {
  const value = useSyncExternalStore(
    subscribe,
    () => chosenPlace,
    () => null,
  );
  return [value, setChosenPlace] as const;
}
/** Test-only: the session is shared across component lifetimes. */
export function resetNearbyStore() {
  cancel();
  query = "";
  chosenPlace = null;
  setState(OFF);
}

export function useNearby() {
  const { messages } = useI18n();
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => OFF,
  );
  const toggle = useCallback(() => {
    cancel();
    if (state.status === "on" || state.status === "locating") {
      setState(OFF);
      return;
    }
    if (!navigator.geolocation) {
      setState({ status: "error", message: messages.geolocationUnsupported });
      return;
    }
    const current = attempt;
    setState({ status: "locating" });
    const fail = (message: string) => {
      if (current !== attempt) return;
      cancel();
      setState({ status: "error", message });
    };
    // The browser timeout excludes time waiting for permission. Bound that
    // wait too, and invalidate late callbacks after timeout or cancellation.
    deadline = setTimeout(() => fail(messages.geolocationTimeout), TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (current !== attempt) return;
        cancel();
        setState({
          status: "on",
          at: { lat: coords.latitude, lon: coords.longitude },
        });
      },
      (error) =>
        fail(
          {
            1: messages.geolocationDenied,
            2: messages.geolocationUnavailable,
            3: messages.geolocationTimeout,
          }[error.code] ?? messages.geolocationUnavailable,
        ),
      { timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }, [messages]);
  const dismissError = useCallback(() => {
    if (state.status === "error") setState(OFF);
  }, []);
  const turnOff = useCallback(() => {
    cancel();
    if (state.status !== "off") setState(OFF);
  }, []);
  return { state: snapshot, toggle, dismissError, turnOff };
}
