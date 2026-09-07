"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The shelter descriptions the animal dialog prints, fetched once and only
 * when something asks for one.
 *
 * The grid is a client component, so every field of every animal it can draw
 * is serialized into the home page's payload. The descriptions were 53,673 of
 * that page's 148,363 gzipped bytes, 36% of it, and exactly one of them is
 * ever read: the animal whose dialog the visitor opens, if they open one. So
 * lib/dataset.ts leaves the field behind and the text is fetched from a static
 * file instead. A visitor who never opens a dialog never downloads it, which
 * is the saving; the grid asks for it on idle so that the visitor who does
 * open one is usually not waiting on anything.
 *
 * The animal's own page does not come here at all. It is server-rendered from
 * a whole dataset animal, so its description is already in the markup and
 * AnimalFacts prints that one.
 *
 * A module singleton rather than context, for the same reason as
 * hooks/use-nearby-origin.ts: the readers are one per open dialog and the
 * writer is the grid above them, and neither is a parent of the other.
 */

/** id -> the shelter's own text. Written by
 *  scripts/generate-animal-descriptions.mjs, one entry per animal that has
 *  one; an animal with no description is simply absent. */
export type AnimalDescriptions = Readonly<Record<string, string>>;

// Under public/, so `output: export` copies it into out/ and a static host
// serves it with no route handler.
const SOURCE = "/generated/animal-descriptions.json";

const EMPTY: AnimalDescriptions = {};

const listeners = new Set<() => void>();
// undefined until the fetch settles. After that it is the map, or EMPTY if
// there was nothing to be had.
let current: AnimalDescriptions | undefined;
let inFlight: Promise<AnimalDescriptions> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Nothing that goes wrong here is worth a word on screen. A description that
// does not arrive leaves the dialog exactly as an animal the shelter wrote
// nothing about leaves it: the paragraph is not drawn. The failure resolves to
// the empty map rather than rejecting, and `inFlight` keeps holding it, so a
// dialog that opens after a failed fetch reads the empty answer instead of
// asking for the file again and again.
async function load(): Promise<AnimalDescriptions> {
  try {
    const response = await fetch(SOURCE);
    if (!response.ok) return EMPTY;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return EMPTY;
    }
    return body as AnimalDescriptions;
  } catch {
    return EMPTY;
  }
}

/** Start the one fetch, or hand back the one already running or done. Called
 *  by the first dialog that needs a description and, before that, by the grid
 *  on idle. */
export function prefetchAnimalDescriptions(): Promise<AnimalDescriptions> {
  if (inFlight) return inFlight;
  inFlight = load().then((descriptions) => {
    current = descriptions;
    for (const listener of listeners) listener();
    return descriptions;
  });
  return inFlight;
}

function getServerSnapshot(): string | undefined {
  return undefined;
}

/**
 * The shelter's text for one animal, or undefined while it is on its way and
 * for an animal that has none.
 *
 * Pass undefined for an animal that already carries its own description and
 * nothing is fetched. Nothing has an answer on the server or in the first
 * client render, which is what keeps hydration from mismatching: the fetch
 * cannot have landed before the render that starts it.
 */
export function useAnimalDescription(
  id: string | undefined,
): string | undefined {
  useEffect(() => {
    if (id === undefined) return;
    void prefetchAnimalDescriptions();
  }, [id]);

  return useSyncExternalStore(
    subscribe,
    () => (id === undefined ? undefined : current?.[id]),
    getServerSnapshot,
  );
}

/** Test-only. The fetch is held for the life of the page, so a test that
    resolved it would hand the result to the next one. */
export function resetAnimalDescriptionsStore(): void {
  current = undefined;
  inFlight = undefined;
  for (const listener of listeners) listener();
}
