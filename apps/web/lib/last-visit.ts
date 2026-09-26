// The two storage keys a visit is remembered by, and the blocking script that
// reads them before the results are painted. Kept apart from
// hooks/use-last-visit.ts, which is a client module: the script is written
// into the page by a server component (components/new-listings-script.tsx),
// and a server component that imports from a "use client" file gets
// references, not strings.

/** The time of the list the visitor last saw: the dataset's generatedAt. */
export const LAST_VISIT_KEY = "posvoji:last-visit";

/** This tab's copy of what LAST_VISIT_KEY held when the session began, which
 *  is the threshold every page in the session compares against. */
export const VISIT_SINCE_KEY = "posvoji:visit-since";

/** The mark the script sets on <html>: data-new-listings in the markup. The
 *  rule in app/globals.css reserves the notice's place while it stands, and
 *  AnimalGrid takes it off once the notice itself is drawn. */
export const NEW_LISTINGS_DATASET_KEY = "newListings";

/** The block the notice is drawn in, which the rule above holds open. */
export const NEW_LISTINGS_SLOT = "new-listings";

/**
 * The notice for a returning visitor (components/new-listings-notice.tsx) is
 * only known after hydration: the threshold is in the visitor's storage, and
 * the prerendered page has no storage to read. Drawn then, it pushed the cards
 * down by its own height once per page, on the page every returning visitor
 * opens.
 *
 * So this reads the same threshold the hook will, before the results are
 * parsed, and marks <html> when the newest listing on the page is newer than
 * it. On the unfiltered list that is exactly when the notice will have
 * something to count, so the place is held from the first paint and the
 * notice lands in it. A link that carries filters can count none of them, but
 * such a link shows the stand-in until hydration (lib/prehydration-script.ts),
 * so the place it gives back is never on screen.
 *
 * `newest` is that listing's time in milliseconds since 1970.
 */
export function newListingsScript(newest: number): string {
  return `(function () {
  try {
    var since = sessionStorage.getItem(${JSON.stringify(VISIT_SINCE_KEY)});
    if (since === null) since = localStorage.getItem(${JSON.stringify(LAST_VISIT_KEY)});
    if (since && Date.parse(since) < ${newest}) {
      document.documentElement.dataset.${NEW_LISTINGS_DATASET_KEY} = "";
    }
  } catch (error) {}
})();`;
}
