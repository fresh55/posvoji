"use client";

import { useSyncExternalStore } from "react";

// Nothing to subscribe to: the answer changes exactly once, when React swaps
// the server snapshot for the client one at the end of hydration.
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False while the server's markup is being hydrated, true from the render
 * after, and true at once for anything that mounts later. It costs no render
 * of its own: the swap happens in the render that ends hydration.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, onClient, onServer);
}
