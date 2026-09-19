// The public site navigates with plain anchors between prerendered pages, so
// every click pays for a document load. Measured on the built export on a
// throttled phone, a shelter page takes about 850 ms from click to reveal and
// the home page about 870 ms. Chromium removes that wait when the document
// carries speculation rules. Safari and Firefox ignore the script.
//
// Eagerness is "moderate" everywhere: the speculation starts on hover or
// pointerdown, not on load, so a phone on a metered connection only pays for
// what the visitor is reaching towards.

export type SpeculationCondition =
  | { href_matches: string | readonly string[] }
  | { selector_matches: string | readonly string[] }
  | { and: readonly SpeculationCondition[] }
  | { or: readonly SpeculationCondition[] }
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
// pattern spans separators, so `/o-nas/*` also covers `/o-nas/srecko/plakat`
// and the print pages have to be excluded by name below.

/**
 * Pages small enough to hold in memory before the click. The home page is not
 * here on purpose: its HTML is 1.2 MB, 111 KB compressed, with sixty cards and
 * a 3D model, which is too much to build on every hover over the logo.
 */
export const PRERENDER_PATTERNS = [
  "/zavetisca",
  "/zavetisca/*",
  "/o-nas",
  "/o-nas/*",
  "/najdena-zival",
  "/viri",
  "/en/shelters",
  "/en/shelters/*",
  "/en/about",
  "/en/about/*",
  "/en/found-animal",
  "/en/resources",
] as const;

/**
 * Never speculated at all. The portal is a logged-in Django client and the
 * gate is a password page, so loading either ahead of the click is both
 * useless and a request the visitor did not make. `/dev` is not in the build.
 * The poster routes are print pages nobody reads on screen.
 */
export const NEVER_PATTERNS = [
  "/portal*",
  "/vstop",
  "/en/enter",
  "/dev/*",
  "/*/plakat",
  "/*/poster",
] as const;

/** The per-link opt-out. `rel="nofollow"` is the one the spec's examples use. */
export const OPT_OUT_SELECTORS = ["[rel~=\"nofollow\"]", "[data-no-speculate]"] as const;

const notExcluded: readonly SpeculationCondition[] = [
  { not: { href_matches: NEVER_PATTERNS } },
  { not: { selector_matches: OPT_OUT_SELECTORS } },
];

export const SPECULATION_RULES: SpeculationRuleSet = {
  prerender: [
    {
      where: { and: [{ href_matches: PRERENDER_PATTERNS }, ...notExcluded] },
      eagerness: "moderate",
    },
  ],
  prefetch: [
    {
      // Everything else same-origin, the home page and the animal pages
      // included. The prerendered set is excluded so a link is claimed by one
      // rule only.
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: PRERENDER_PATTERNS } },
          ...notExcluded,
        ],
      },
      eagerness: "moderate",
    },
  ],
};

/**
 * The rule set as the script body. Every `<` leaves as its JSON escape, so a
 * pattern added later cannot close the script element early. The argument is
 * there for the test; the site always serializes the set above.
 */
export function serializeSpeculationRules(
  rules: SpeculationRuleSet = SPECULATION_RULES,
): string {
  return JSON.stringify(rules).replaceAll("<", "\\u003c");
}
