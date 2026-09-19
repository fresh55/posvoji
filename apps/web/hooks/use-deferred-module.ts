"use client";

import { useEffect, useState } from "react";

const requests = new WeakMap<() => Promise<unknown>, Promise<unknown>>();
const resolved = new WeakMap<() => Promise<unknown>, unknown>();

/** Cache successful loads across instances; a failed download can be retried. */
export function preloadModule<T>(load: () => Promise<T>): Promise<T> {
  const existing = requests.get(load);
  if (existing) return existing as Promise<T>;
  const pending = load()
    .then((value) => {
      resolved.set(load, value);
      return value;
    })
    .catch((error: unknown) => {
      requests.delete(load);
      throw error;
    });
  requests.set(load, pending);
  return pending;
}

export function useDeferredModule<T>(
  load: () => Promise<T>,
  active: boolean,
  { warmOnIdle = false }: { warmOnIdle?: boolean } = {},
) {
  const [module, setModule] = useState<T | undefined>(
    () => resolved.get(load) as T | undefined,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!warmOnIdle) return;
    const warm = () => {
      void preloadModule(load).catch(() => {});
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(handle);
  }, [load, warmOnIdle]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    preloadModule(load).then(
      (loaded) => {
        if (!cancelled) setModule(() => loaded);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, attempt, load]);
  return {
    module,
    error,
    retry: () => {
      setError(false);
      setAttempt((value) => value + 1);
    },
  };
}
