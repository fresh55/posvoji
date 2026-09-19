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

export function useAnimalSource(id: string | undefined): ClientAnimalSource | undefined {
  return useAnimalDetail(id)?.source;
}

/** Test-only: each test starts without the previous page's cached response. */
export function resetAnimalDescriptionsStore(): void {
  current = EMPTY;
  inFlight = undefined;
  for (const listener of listeners) listener();
}
