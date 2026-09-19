// The public site navigates with plain anchors between prerendered pages, so
// every click pays for a document load. Measured on the built export on a
// throttled phone, a shelter page takes about 850 ms from click to reveal and
// the home page about 870 ms. Chromium removes that wait when the document
// carries speculation rules. Safari and Firefox ignore the script.
//
// Eagerness is "moderate" everywhere: the speculation starts on hover or
// pointerdown, not on load, so a phone on a metered connection only pays for
// what the visitor is reaching towards.

import { POSTER_SEGMENT } from "@/lib/animal-path";
import { GATE_PATHS } from "@/lib/demo-gate";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { serializeScriptJson } from "@/lib/script-json";
import { SHELTER_INDEX_PATHS } from "@/lib/shelter-path";
import { RESOURCES_PATHS } from "@/lib/site-links";

export type SpeculationCondition =
  | { href_matches: string | readonly string[] }
  | { selector_matches: string | readonly string[] }
  | { and: readonly SpeculationCondition[] }
  | { not: SpeculationCondition };

export type SpeculationRule = {
  where: SpeculationCondition;
  eagerness: "immediate" | "eager" | "moderate" | "conservative";
};

export type SpeculationRuleSet = {
  prerender: readonly SpeculationRule[];
  prefetch: readonly SpeculationRule[];
};

// Patterns are relative, which resolves them against the document's base URL
// and therefore restricts every rule to same-origin links. A `*` in a pathname
// pattern spans separators, so the prefetch rule's `/*` also covers
// `/o-nas/srecko/plakat` and the print pages have to be excluded by name below.
//
// The addresses come from the modules that own them rather than being written
// out again here. site-links.ts states the reason on RESOURCES_PATHS, and
// app/sitemap.ts is the other reader that keeps to it: a page renamed in one
// place and not the other would go on being prefetched and quietly stop being
// prerendered, with nothing to fail. Only the three that no module owns are
// literals: the portal's prefix, /dev, and the poster wildcard, which is a
// pattern rather than an address.
const withChildren = (paths: Record<string, string>): string[] =>
  Object.values(paths).flatMap((path) => [path, `${path}/*`]);

/**
 * Pages small enough to hold in memory before the click. The home page is not
 * here on purpose: its HTML is 1.2 MB, 111 KB compressed, with sixty cards and
 * a 3D model, which is too much to build on every hover over the logo. The
 * about pages are left out for the model alone: a prerendered document runs
 * its scripts, and the cat on /o-nas mounts a 1.5 MB GLB at the top of the
 * page (components/about-cat.tsx), so prerendering it would download the
 * model on every hover over the nav. Those pages are prefetched like the rest.
 */
export const PRERENDER_PATTERNS: readonly string[] = [
  ...withChildren(SHELTER_INDEX_PATHS),
  ...Object.values(FOUND_ANIMAL_PATHS),
  ...Object.values(RESOURCES_PATHS),
];

/**
 * Never speculated at all. The portal is a logged-in Django client and the
 * gate is a password page, so loading either ahead of the click is both
 * useless and a request the visitor did not make. `/dev` is not in the build.
 * The poster routes are print pages nobody reads on screen.
 */
export const NEVER_PATTERNS: readonly string[] = [
  "/portal*",
  ...Object.values(GATE_PATHS),
  "/dev/*",
  ...Object.values(POSTER_SEGMENT).map((segment) => `/*/${segment}`),
];

/** The per-link opt-out. `rel="nofollow"` is the one the spec's examples use. */
export const OPT_OUT_SELECTORS = ["[rel~=\"nofollow\"]", "[data-no-speculate]"] as const;

/**
 * A rule for the links `match` claims, less the ones nothing may speculate.
 * Both rules are built here so the exclusions and the eagerness are written
 * once: a page added to the never list is out of both without being spelled
 * in both.
 */
function speculate(...match: readonly SpeculationCondition[]): SpeculationRule {
  return {
    where: {
      and: [
        ...match,
        { not: { href_matches: NEVER_PATTERNS } },
        { not: { selector_matches: OPT_OUT_SELECTORS } },
      ],
    },
    eagerness: "moderate",
  };
}

export const SPECULATION_RULES: SpeculationRuleSet = {
  prerender: [speculate({ href_matches: PRERENDER_PATTERNS })],
  // Everything else same-origin, the home page and the animal pages included.
  // The prerendered set is subtracted so a link is claimed by one rule only:
  // the spec does not say which rule wins when both match.
  prefetch: [
    speculate({ href_matches: "/*" }, { not: { href_matches: PRERENDER_PATTERNS } }),
  ],
};

/**
 * The rule set as the script body, escaped so a pattern added later cannot
 * close the script element early (lib/script-json.ts). The argument is there
 * for the test; the site always serializes the set above.
 */
export function serializeSpeculationRules(
  rules: SpeculationRuleSet = SPECULATION_RULES,
): string {
  return serializeScriptJson(rules);
}
