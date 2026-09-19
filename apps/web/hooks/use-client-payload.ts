"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type Snapshot = { data?: unknown; error?: boolean; pending?: boolean };
type PayloadValidator = (data: unknown[]) => boolean;
type Entry = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  request?: Promise<unknown>;
};

const entries = new Map<string, Entry>();
const empty: Snapshot = {};

function getEntry(url: string): Entry {
  let entry = entries.get(url);
  if (!entry) {
    entry = { snapshot: empty, listeners: new Set() };
    entries.set(url, entry);
  }
  return entry;
}

function publish(entry: Entry, snapshot: Snapshot) {
  entry.snapshot = snapshot;
  for (const listener of entry.listeners) listener();
}

export function loadClientPayload(
  url: string,
  validate?: PayloadValidator,
): Promise<unknown> {
  const entry = getEntry(url);
  if (entry.snapshot.data !== undefined) {
    return Promise.resolve(entry.snapshot.data);
  }
  if (entry.request) return entry.request;

  publish(entry, { pending: true });
  entry.request = fetch(url, { signal: AbortSignal.timeout(15_000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Payload: ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data) || (validate && !validate(data))) {
        throw new Error("Invalid payload");
      }
      publish(entry, { data });
      return data;
    })
    .catch((error: unknown) => {
      publish(entry, { error: true });
      throw error;
    })
    .finally(() => {
      entry.request = undefined;
    });
  return entry.request;
}

export function useClientPayload<T>(
  url: string | undefined,
  active = false,
  validate?: PayloadValidator,
) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!url) return () => {};
      const entry = getEntry(url);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [url],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (url ? getEntry(url).snapshot : empty),
    () => empty,
  );
  const load = useCallback(
    () => (url ? loadClientPayload(url, validate) : Promise.resolve(undefined)),
    [url, validate],
  );
  useEffect(() => {
    if (active) void load().catch(() => {});
  }, [active, load]);

  return {
    data: snapshot.data as T | undefined,
    pending: snapshot.pending,
    error: snapshot.error,
    load,
    retry: () => {
      void load().catch(() => {});
    },
  };
}
