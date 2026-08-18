// The URL is the single source of truth, so filtered and deep-linked views
// are shareable and survive reloads. No useSearchParams: with static export
// the prerendered HTML has no params, and useSyncExternalStore swaps in the
// client snapshot after hydration without a mismatch. History writes fire no
// event of their own, so callers notify subscribers by hand through
// commitSearch.
const listeners = new Set<() => void>();

export function subscribeToSearch(listener: () => void): () => void {
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

export function commitSearch(
  query: string,
  mode: "push" | "replace",
  state?: unknown,
): void {
  // Commas are legal unencoded, and these links get shared by hand. Done here
  // so every writer produces the same shape.
  const search = query.replace(/%2C/g, ",");
  const url = search ? `?${search}` : window.location.pathname;
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
