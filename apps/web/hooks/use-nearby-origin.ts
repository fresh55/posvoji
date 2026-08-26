"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { LatLon } from "@/lib/geo";
import type { ResolvedOrigin } from "@/lib/origin";

/** Where the visitor is measuring from, once something has said. */
export type NearbyOrigin = {
  at: LatLon;
  /** Whether the browser handed the point over or the visitor typed a place. */
  source: "geolocation" | "typed";
  /** The place name, for a typed origin only. Geolocation returns coordinates
   *  and no words, and nothing here reverse-geocodes them. */
  place?: string;
};

// In memory, for this page load, and deliberately not in sessionStorage.
//
// The writer is the location picker's nearby control, and neither half of it
// survives a reload: hooks/use-nearby.ts starts every page load "off", and the
// typed place box starts empty. A stored origin would come back to a picker
// showing no origin at all, so the grid would sort by a distance nothing on
// screen admits to and the visitor would have no way to take it back. A
// geolocation fix is also the visitor's own position, which is not something to
// write down on their machine for the sake of a sort order. Asking again costs
// one press of the control that asked the first time.
//
// The store is a module singleton rather than context because the writer and
// the readers are in different subtrees: the picker is mounted inside the
// toolbar and the dock, the sort picker in two other places, and the grid above
// all of them.
const listeners = new Set<() => void>();
let current: NearbyOrigin | null = null;
// Which publisher put `current` there. The picker is mounted more than once at
// a time (desktop toolbar or sidebar, mobile dock) and every instance resolves
// an origin of its own, so the instances the visitor never touched are all
// publishing nothing. Only the one that granted the origin may take it away.
let owner: object | null = null;

function same(a: NearbyOrigin | null, b: NearbyOrigin | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.at.lat === b.at.lat &&
    a.at.lon === b.at.lon &&
    a.source === b.source &&
    a.place === b.place
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NearbyOrigin | null {
  return current;
}

// Nothing on the server has an origin, and neither does the first client
// render: React reads this snapshot while hydrating, so the markup the server
// wrote and the markup hydration produces agree by construction and the real
// origin arrives in the commit after. Same idiom as
// components/filters/use-filter-sections.ts.
function getServerSnapshot(): NearbyOrigin | null {
  return null;
}

function publish(key: object, next: NearbyOrigin | null): void {
  if (next === null) {
    if (owner !== key) return;
    owner = null;
  } else {
    owner = key;
  }
  if (same(current, next)) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Test-only. The store outlives a render, so a test that granted an origin
    would hand it to the next one. */
export function resetNearbyOriginStore(): void {
  current = null;
  owner = null;
  for (const listener of listeners) listener();
}

/** The point every "from here" reader measures from, or null while nobody has
    granted one. */
export function useNearbyOrigin(): NearbyOrigin | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The writer's side. Hand it whatever resolveOrigin() worked out for this
    picker; an origin with no point is the same as no origin at all. */
export function usePublishNearbyOrigin(resolved: ResolvedOrigin): void {
  // One identity per mounted picker. It is never read, only compared: it is how
  // the store knows whose origin it is holding. A lazy useState rather than a
  // ref, because the value is wanted during render and a ref read there is
  // exactly what react-hooks/refs is right to object to.
  const [key] = useState<object>(() => ({}));
  const lat = resolved.at?.lat;
  const lon = resolved.at?.lon;
  const source = resolved.source;
  const place = resolved.label;

  useEffect(() => {
    publish(
      key,
      lat === undefined || lon === undefined || source === "none"
        ? null
        : { at: { lat, lon }, source, place },
    );
  }, [key, lat, lon, source, place]);

  // An unmounting picker takes its own origin with it, and only its own.
  useEffect(() => () => publish(key, null), [key]);
}
