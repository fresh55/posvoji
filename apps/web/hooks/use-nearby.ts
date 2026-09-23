"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n-context";
import type { LatLon } from "@/lib/geo";
import type { TypedLocation } from "@/lib/origin";

export type NearbyState =
  | { status: "off" }
  | { status: "locating" }
  | { status: "on"; at: LatLon; accuracy: number }
  | { status: "error"; message: string };

export type NearbyChosenPlace = {
  location: Extract<TypedLocation, { status: "matched" }>;
  query: string;
} | null;

const TIMEOUT_MS = 10000;
const MAX_AGE_MS = 300000;
const OFF: NearbyState = { status: "off" };
// Both responsive pickers control one page-session location. The geolocated
// position is never persisted; a place the visitor typed and chose is, below.
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
    // Either read may be the page's first, and the restore sets both values,
    // so both ask for it before answering.
    () => {
      restoreChosenPlace();
      return query;
    },
    () => "",
  );
  return [value, setQuery] as const;
}
// The town or postcode a visitor chose, kept in their own browser so the next
// visit opens the picker already measuring from it and the grid's Najbližje
// sort already has somewhere to sort from. Only a place they typed and
// confirmed: a position from geolocation stays with the page it was asked on.
// Every read and write is guarded, because storage can be missing, full or
// refused, and the picker has to work the same without it.
export const CHOSEN_PLACE_KEY = "posvoji:chosen-place";
let restored = false;

function isChosenPlace(value: unknown): value is Exclude<NearbyChosenPlace, null> {
  if (!value || typeof value !== "object") return false;
  const { location, query: text } = value as Record<string, unknown>;
  if (typeof text !== "string" || !location || typeof location !== "object") return false;
  const { status, at, label } = location as Record<string, unknown>;
  if (status !== "matched" || typeof label !== "string" || !at || typeof at !== "object") return false;
  const { lat, lon } = at as Record<string, unknown>;
  return typeof lat === "number" && typeof lon === "number";
}

// Once per page, on the first client read. The server and the hydrating render
// read null, so a stored place arrives as an ordinary update after hydration.
function restoreChosenPlace() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(CHOSEN_PLACE_KEY) ?? "null");
    if (isChosenPlace(stored)) {
      chosenPlace = stored;
      query = stored.query;
    }
  } catch {
    // Unreadable or refused: start without a place, as before.
  }
}

function setChosenPlace(next: NearbyChosenPlace) {
  chosenPlace = next;
  try {
    if (next) window.localStorage.setItem(CHOSEN_PLACE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(CHOSEN_PLACE_KEY);
  } catch {
    // Not remembered this time; the page session still has it.
  }
  emit();
}
export function useNearbyChosenPlace() {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      restoreChosenPlace();
      return chosenPlace;
    },
    () => null,
  );
  return [value, setChosenPlace] as const;
}
/** Test-only: the session is shared across component lifetimes. */
export function resetNearbyStore() {
  cancel();
  query = "";
  chosenPlace = null;
  restored = false;
  try {
    window.localStorage.removeItem(CHOSEN_PLACE_KEY);
  } catch {
    // Nothing stored to clear.
  }
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
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (current !== attempt) return;
          if (
            !Number.isFinite(coords.latitude) ||
            !Number.isFinite(coords.longitude) ||
            Math.abs(coords.latitude) > 90 ||
            Math.abs(coords.longitude) > 180
          ) {
            fail(messages.geolocationUnavailable);
            return;
          }
          cancel();
          setState({
            status: "on",
            at: { lat: coords.latitude, lon: coords.longitude },
            accuracy: coords.accuracy,
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
    } catch {
      // Restricted/embedded browsers may throw before invoking either
      // callback. Keep the manual location input available in that case.
      fail(messages.geolocationUnavailable);
    }
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
