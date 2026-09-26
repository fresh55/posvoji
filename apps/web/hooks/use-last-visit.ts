"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { listedAtTime, type AnimalFields } from "@/lib/animal";
import { LAST_VISIT_KEY, VISIT_SINCE_KEY } from "@/lib/last-visit";

// What a returning visitor has not seen yet, worked out in their own browser.
// Nothing here leaves it: two keys, one time each, and no request.
//
// LAST_VISIT_KEY holds the time of the list the visitor last saw, which is
// the dataset's generatedAt (the `reference` every card is drawn against) and
// not the visitor's clock. The list only changes when a new one is published,
// so "listed after the list I last saw was published" is exactly "listed since
// I was last here". The clock gets that wrong in two ways. A crawl dates an
// animal when it finds it and the site shows it once the build that follows is
// deployed, so a visit in between would be written down after the animal's
// listing time without the animal ever having been on screen. And the
// visitor's clock is not the crawler's.
//
// VISIT_SINCE_KEY is the session's copy of what LAST_VISIT_KEY held when the
// session began, and is what the page compares against. Written once per
// session, so a reload or a second page in the same tab keeps the threshold
// the first page read, while LAST_VISIT_KEY moves on to the list on screen.
// sessionStorage belongs to one tab, so a new tab, a card's shelter opened
// with a middle click among them, starts a session of its own and finds this
// visit already written down: its cards carry no marks, which errs quiet.
//
// Both keys live in lib/last-visit.ts, beside the blocking script that reads
// them before the results are painted and has to agree with beginVisit below.
export { LAST_VISIT_KEY, VISIT_SINCE_KEY };

const listeners = new Set<() => void>();
// Null for a first visit, and on the server, and until a page with cards on
// it has read the two keys.
let since: number | null = null;
let begun = false;

function readTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

// Once per page, from the first subscriber rather than from a render: it
// writes to storage, and a render has to stay free of that. Every storage
// call is guarded on its own, because either store can be missing, full or
// refused, and a page without them is a first visit with nothing marked.
function beginVisit(seen: number): void {
  if (begun || typeof window === "undefined") return;
  begun = true;
  let threshold: string | null = null;
  try {
    threshold = window.sessionStorage.getItem(VISIT_SINCE_KEY);
  } catch {
    // Read as a session that has not begun.
  }
  if (threshold === null) {
    try {
      threshold = window.localStorage.getItem(LAST_VISIT_KEY) ?? "";
    } catch {
      threshold = "";
    }
    try {
      window.sessionStorage.setItem(VISIT_SINCE_KEY, threshold);
    } catch {
      // The next page in this tab reads the moved-on value and marks nothing.
    }
  }
  if (Number.isFinite(seen)) {
    try {
      window.localStorage.setItem(LAST_VISIT_KEY, new Date(seen).toISOString());
    } catch {
      // Not remembered this time; the next visit starts as a first one.
    }
  }
  since = readTime(threshold);
  for (const listener of listeners) listener();
}

/** Whether an animal was listed after the threshold. Both halves have to be
 *  known: no threshold is a first visit, and a first visit has seen nothing,
 *  which is not the same as everything being new to it. */
export function isNewListing(
  listedAt: number | undefined,
  threshold: number | null,
): boolean {
  return (
    threshold !== null &&
    listedAt !== undefined &&
    listedAtTime(listedAt) > threshold
  );
}

// The subscription every reader below shares. Subscribing is what begins the
// visit, so the hydrating render reads the server's answer, no threshold, and
// the marks arrive in the commit after, the way use-nearby-origin.ts hands
// the grid its origin.
function useVisitSubscription(reference: Date) {
  const seen = reference.getTime();
  return useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      beginVisit(seen);
      return () => {
        listeners.delete(listener);
      };
    },
    [seen],
  );
}

const noThreshold = () => null;

/** This session's threshold in milliseconds since 1970, or null. `reference`
 *  is the dataset's generatedAt, which is what the visit writes down. */
export function useVisitSince(reference: Date): number | null {
  return useSyncExternalStore(
    useVisitSubscription(reference),
    () => since,
    noThreshold,
  );
}

const notBegun = () => false;

/** Whether this page has read the visit yet: false on the server and through
 *  hydration, true from the commit that has the threshold, whatever it is. The
 *  grid waits for it before it gives back the place the blocking script held
 *  for the notice (lib/last-visit.ts). */
export function useVisitRead(reference: Date): boolean {
  return useSyncExternalStore(
    useVisitSubscription(reference),
    () => begun,
    notBegun,
  );
}

const notNew = () => false;

/** Whether one animal is new to this visitor. The snapshot is the answer and
 *  not the threshold, so a card whose answer stays the same when the
 *  threshold arrives does not render again. */
export function useIsNewListing(
  listedAt: number | undefined,
  reference: Date,
): boolean {
  return useSyncExternalStore(
    useVisitSubscription(reference),
    () => isNewListing(listedAt, since),
    notNew,
  );
}

/** How many of these animals are new to this visitor: zero on a first visit,
 *  on the server and through hydration. */
export function useNewListingCount(
  animals: readonly Pick<AnimalFields, "listedAt">[],
  reference: Date,
): number {
  const threshold = useVisitSince(reference);
  return useMemo(
    () =>
      threshold === null
        ? 0
        : animals.filter((animal) => isNewListing(animal.listedAt, threshold))
            .length,
    [animals, threshold],
  );
}

/** Test-only. The visit outlives a render, so a test that began one would
 *  hand its threshold to the next. */
export function resetLastVisitStore(): void {
  since = null;
  begun = false;
  for (const listener of listeners) listener();
}
