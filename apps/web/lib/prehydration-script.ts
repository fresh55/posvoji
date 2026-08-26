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
// app/globals.css hides that block while the mark is there, and AnimalGrid
// takes the mark off in an effect after its first client render. An address
// with none of these params is never marked and never touched.
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

export const PREHYDRATION_FILTER_SCRIPT = `(function () {
  var known = ${JSON.stringify(WATCHED_PARAMS)};
  var params = new URLSearchParams(location.search);
  for (var i = 0; i < known.length; i += 1) {
    if (params.has(known[i])) {
      document.documentElement.dataset.${PREHYDRATION_DATASET_KEY} = "";
      return;
    }
  }
})();`;
