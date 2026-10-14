"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ClientAnimalSource } from "@/lib/animal";

/** Dialog-only fields omitted from the grid payload. Standalone pages have them already. */
type AnimalDetail = { description?: string; source?: ClientAnimalSource };
type AnimalDetails = Readonly<Record<string, AnimalDetail>>;

const SOURCE = "/generated/animal-details.json";
const EMPTY: AnimalDetails = {};
export const ANIMAL_DETAILS_TIMEOUT_MS = 10_000;
export const ANIMAL_DETAILS_RETRY_COOLDOWN_MS = 30_000;
const listeners = new Set<() => void>();
/** Only successful responses, including a valid empty map, are cached. */
let current: AnimalDetails | undefined;
let inFlight: Promise<AnimalDetails> | undefined;
let retryAfter = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function load(): Promise<AnimalDetails | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, ANIMAL_DETAILS_TIMEOUT_MS);
  });
  const request = (async () => {
    try {
      const response = await fetch(SOURCE, { signal: controller.signal });
      if (!response.ok) return undefined;
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return undefined;
      }
      return body as AnimalDetails;
    } catch {
      return undefined;
    }
  })();
  try {
    // Also settle if a stalled body or test transport ignores the abort.
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Share active requests and successful results. Later opens can retry a
 *  failure after a cooldown; rapid hover and focus events cannot create a loop. */
export function prefetchAnimalDescriptions(): Promise<AnimalDetails> {
  if (current !== undefined) return Promise.resolve(current);
  if (inFlight) return inFlight;
  if (Date.now() < retryAfter) return Promise.resolve(EMPTY);
  const request = load().then((details) => {
    // A reset must not let an older response populate the new store.
    if (inFlight !== request) return details ?? EMPTY;
    inFlight = undefined;
    if (details === undefined) retryAfter = Date.now() + ANIMAL_DETAILS_RETRY_COOLDOWN_MS;
    else {
      current = details;
      retryAfter = 0;
    }
    for (const listener of listeners) listener();
    return details ?? EMPTY;
  });
  inFlight = request;
  return request;
}

function getServerSnapshot(): undefined {
  return undefined;
}

/** An undefined id skips loading when the server already supplied the field. */
function useAnimalDetail(id: string | undefined): AnimalDetail | undefined {
  useEffect(() => {
    if (id !== undefined) void prefetchAnimalDescriptions();
  }, [id]);

  return useSyncExternalStore(
    subscribe,
    () => (id === undefined ? undefined : current?.[id]),
    getServerSnapshot,
  );
}

export function useAnimalDescription(id: string | undefined): string | undefined {
  return useAnimalDetail(id)?.description;
}

export function useAnimalSource(
  id: string | undefined,
): ClientAnimalSource | undefined {
  return useAnimalDetail(id)?.source;
}

/** Test-only: each test starts without the previous page's cached response. */
export function resetAnimalDescriptionsStore(): void {
  current = undefined;
  inFlight = undefined;
  retryAfter = 0;
  for (const listener of listeners) listener();
}
