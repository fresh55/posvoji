import { FILTER_PARAM_NAMES } from "@/lib/filters";
import { SORT_PARAM } from "@/lib/sort";

// next.config sets output: "export", so there is no server to read a query
// with: getServerSearchSnapshot returns "" and has to (lib/location-search.ts),
// and the HTML a filtered link opens is the prerendered, unfiltered page. It
// stands there, fully readable and fully wrong, until hydration answers the
// address the visitor actually asked for.
//
// This is the smallest thing that can know better before anything paints: one
// blocking script at the top of the body, which sets a mark on <html> when the
// address carries a param the results block answers to. The rule in
// app/globals.css hides that block while the mark is there and shows the
// stand-in beside it, and AnimalGrid takes the mark off in an effect after its
// first client render. An address with none of these params is never marked and
// never touched.
//
// Sort is on the list beside the filters. A wrongly ordered grid is the same
// defect as a wrongly filtered one: the cards on the first screen are not the
// cards the address asked for.
const WATCHED_PARAMS: readonly string[] = [...FILTER_PARAM_NAMES, SORT_PARAM];

/** The dataset key the script sets, which is data-filtering in the markup. The
 *  two other places that spell it are the rule in app/globals.css, which cannot
 *  import, and the effect in animal-grid.tsx that clears it. */
export const PREHYDRATION_DATASET_KEY = "filtering";

/** The block the rule hides, named here rather than in the component so the
 *  mark and what it acts on are owned by one module. Its other reader is the
 *  rule in app/globals.css, which spells both this and the key above as
 *  literals because a stylesheet cannot import them; the e2e specs select on
 *  the same literal for the same reason. */
export const RESULTS_SLOT = "results";

/** What stands in that block's place while the mark is on, so the address the
 *  visitor shared does not open on nothing. A second rule beside that one, on
 *  the same condition negated, hides this whenever the block is shown, so
 *  exactly one of the two is ever in flow.
 *  Named here rather than in the component for the same reason as the block
 *  above; its other reader is the rule in app/globals.css. */
export const RESULTS_PENDING_SLOT = "results-pending";

/** How long the mark may stand before the script takes it off itself. The
 *  unfiltered grid is the worse answer only for as long as hydration is still
 *  plausible: past that a readable wrong page beats an empty right one, and the
 *  visitor can narrow it by hand. Six seconds is well clear of hydration on a
 *  slow phone and short of the point where a page showing only placeholders
 *  reads as broken. Exported because the test pins it. */
export const PREHYDRATION_CLEAR_MS = 6000;

// The timer is the only thing that answers the client render that never comes:
// a chunk that fails to arrive, a browser that runs no modules, a hydration
// error. Left marked, the rule in app/globals.css hides the results for good
// and leaves the stand-in pulsing in their place. The effect in animal-grid.tsx
// beats it by seconds on every page that hydrates, and deleting a key that is
// already gone does nothing, so the ordinary landing pays one idle timer.
//
// Nothing here carries a comment of its own: this string is not minified and
// not shared, so every byte of it is in every document the site serves.
export const PREHYDRATION_FILTER_SCRIPT = `(function () {
  var known = ${JSON.stringify(WATCHED_PARAMS)};
  var params = new URLSearchParams(location.search);
  for (var i = 0; i < known.length; i += 1) {
    if (params.has(known[i])) {
      document.documentElement.dataset.${PREHYDRATION_DATASET_KEY} = "";
      setTimeout(function () {
        delete document.documentElement.dataset.${PREHYDRATION_DATASET_KEY};
      }, ${PREHYDRATION_CLEAR_MS});
      return;
    }
  }
})();`;
