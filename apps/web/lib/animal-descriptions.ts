"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ClientAnimalSource } from "@/lib/animal";

/** Dialog-only fields omitted from the grid payload. Standalone pages have them already. */
type AnimalDetail = { description?: string; source?: ClientAnimalSource };
type AnimalDetails = Readonly<Record<string, AnimalDetail>>;

const SOURCE = "/generated/animal-details.json";
const EMPTY: AnimalDetails = {};
const listeners = new Set<() => void>();
let current: AnimalDetails = EMPTY;
/** `current` once the fetch has settled. Kept apart because a failed fetch
 *  settles on the same empty map the store starts from. */
let settled: AnimalDetails | undefined;
let inFlight: Promise<AnimalDetails> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function load(): Promise<AnimalDetails> {
  try {
    const response = await fetch(SOURCE);
    if (!response.ok) return EMPTY;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return EMPTY;
    }
    return body as AnimalDetails;
  } catch {
    return EMPTY;
  }
}

/** Share one request for the page lifetime, including failures, to avoid repeated retries. */
export function prefetchAnimalDescriptions(): Promise<AnimalDetails> {
  if (inFlight) return inFlight;
  inFlight = load().then((details) => {
    current = details;
    settled = details;
    for (const listener of listeners) listener();
    return details;
  });
  return inFlight;
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
    () => id === undefined ? undefined : current[id],
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

function getSettled(): AnimalDetails | undefined {
  return settled;
}

/** Every animal's details once the one fetch has settled, undefined until
 *  then. A failed fetch settles too, on an empty map, so a caller waiting on
 *  this is never left waiting. Asks for nothing itself: the search, which
 *  reads it, starts the fetch once there is something to look for
 *  (hooks/use-animal-search.ts).
 *
 *  Not wanted, it reads undefined whatever the store holds, so the file
 *  landing renders nothing again. The search sits in the grid, and the file
 *  lands whenever the grid is first hovered, query or not. */
export function useSettledAnimalDescriptions(
  wanted: boolean,
): AnimalDetails | undefined {
  return useSyncExternalStore(
    subscribe,
    wanted ? getSettled : getServerSnapshot,
    getServerSnapshot,
  );
}

/** Test-only: each test starts without the previous page's cached response. */
export function resetAnimalDescriptionsStore(): void {
  current = EMPTY;
  settled = undefined;
  inFlight = undefined;
  for (const listener of listeners) listener();
}
