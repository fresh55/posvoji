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

// Rebuilds a query so a codec's own write only touches the params it owns.
// serializeFilters used to build a fresh URLSearchParams from scratch, which
// silently deleted anything else in the query on the very next filter or
// sort write (?najdena=..., or any param a future feature adds).
//
// Foreign params are kept as the exact substrings they already are in
// currentSearch rather than round-tripped through URLSearchParams: reading
// one into URLSearchParams and calling toString() again would re-encode
// whatever it holds, and the %2C-unescape below is meant for this codec's
// own freshly serialized output, not for bytes this codec doesn't own. Not
// touching them at all is the only way to guarantee they survive exactly.
//
// Ordering: foreign params keep their original relative position and come
// first, the codec's own params follow in the codec's order. Either choice
// is defensible; this one is picked because it matches what a URL already
// looks like today (codec params only) once foreign params are prepended,
// rather than interleaving them.
/** decodeURIComponent, for the parts of a URL a visitor can hand us.
 *
 *  It throws on a malformed escape, and a URL is not required to be well
 *  formed to reach us: ?100%=x and /zival/a%zz/x/y are both addresses a
 *  browser will happily sit on. The throw then comes out of whatever reads the
 *  location next, which is a render or a filter write, and takes the page with
 *  it rather than degrading to a link that does not resolve.
 *
 *  Nothing the site writes into a URL needs escaping to be understood, so the
 *  raw bytes are the right answer whenever the decode cannot be made: a name
 *  that will not decode is not one of ours, and a slug that will not decode
 *  matches no animal. Reading the URL must never throw, and this is the one
 *  function that has to hold that. */
export function decodeOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The name a query pair carries, for the one question asked of it here: is
// this one of ours.
function paramName(pair: string): string {
  return decodeOrRaw(pair.split("=")[0] ?? "");
}

export function mergeOwnedParams(
  currentSearch: string,
  ownedParams: readonly string[],
  ownedQuery: string,
): string {
  const owned = new Set(ownedParams);
  const foreign = currentSearch
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => pair.length > 0)
    .filter((pair) => !owned.has(paramName(pair)));
  return [...foreign, ownedQuery].filter((part) => part.length > 0).join("&");
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
  // so every writer produces the same shape. Safe to run over the whole query
  // even once mergeOwnedParams has spliced foreign params in: unescaping
  // %2C to "," never changes what a param means, since a comma needs no
  // encoding in a query string in the first place. What mergeOwnedParams
  // protects against is re-encoding foreign bytes, not this replace.
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
