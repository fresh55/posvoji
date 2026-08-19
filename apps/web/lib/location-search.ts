// The URL is the single source of truth, so filtered and deep-linked views
// are shareable and survive reloads. No useSearchParams: with static export
// the prerendered HTML has no params, and useSyncExternalStore swaps in the
// client snapshot after hydration without a mismatch. History writes fire no
// event of their own, so callers notify subscribers by hand through
// commitSearch and commitLocation.
const listeners = new Set<() => void>();

export function subscribeToLocation(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function getSearchSnapshot(): string {
  return window.location.search;
}

export function getServerSearchSnapshot(): string {
  return "";
}

// Path and query together, for readers whose state lives in the path: an open
// animal is an address of its own, not a parameter on the index.
export function getLocationSnapshot(): string {
  return window.location.pathname + window.location.search;
}

export function getServerLocationSnapshot(): string {
  return "";
}

/** Writes a new query on the page the visitor is already on. */
export function commitSearch(
  query: string,
  mode: "push" | "replace",
  state?: unknown,
): void {
  commitLocation(window.location.pathname, query, mode, state);
}

export function commitLocation(
  path: string,
  query: string,
  mode: "push" | "replace",
  state?: unknown,
): void {
  // Commas are legal unencoded, and these links get shared by hand. Done here
  // so every writer produces the same shape.
  const search = query.replace(/%2C/g, ",");
  const url = search ? `${path}?${search}` : path;
  if (mode === "push") {
    history.pushState(state ?? null, "", url);
  } else {
    // Replacing amends the entry already on the stack, so whatever state it
    // carries survives unless the caller means to change it. Filter writes
    // used to wipe the marker that tells the dialog it can close by going
    // back.
    history.replaceState(state ?? window.history.state, "", url);
  }
  for (const listener of listeners) listener();
}
