import { describe, expect, it } from "vitest";
import type { SpeculationCondition, SpeculationRuleSet } from "@/lib/speculation-rules";
import {
  NEVER_PATTERNS,
  PRERENDER_PATTERNS,
  SPECULATION_RULES,
  serializeSpeculationRules,
} from "@/lib/speculation-rules";

// TypeScript 5.9's lib.dom does not declare URLPattern yet. Node 24 has it,
// and it is the same matcher the browser runs the rules through, so the
// classification below is tested against the real thing rather than a stand-in.
declare const URLPattern: {
  new (input: string, base: string): { test(input: string, base: string): boolean };
};

const ORIGIN = "https://posvoji.si";

function hrefMatches(patterns: string | readonly string[], href: string): boolean {
  const list = typeof patterns === "string" ? [patterns] : patterns;
  return list.some((pattern) => new URLPattern(pattern, ORIGIN).test(href, ORIGIN));
}

// Selector conditions need an element, so this evaluates them as a plain link
// with no opt-out attribute. The selectors themselves are covered by the
// component's test, which has a document.
function evaluate(condition: SpeculationCondition, href: string): boolean {
  if ("href_matches" in condition) return hrefMatches(condition.href_matches, href);
  if ("selector_matches" in condition) return false;
  if ("and" in condition) return condition.and.every((part) => evaluate(part, href));
  if ("or" in condition) return condition.or.some((part) => evaluate(part, href));
  return !evaluate(condition.not, href);
}

function classify(href: string): "prerender" | "prefetch" | "none" {
  if (SPECULATION_RULES.prerender.some((rule) => evaluate(rule.where, href))) {
    return "prerender";
  }
  if (SPECULATION_RULES.prefetch.some((rule) => evaluate(rule.where, href))) {
    return "prefetch";
  }
  return "none";
}

describe("the rule set", () => {
  it("speculates on hover, not on load", () => {
    for (const rule of [...SPECULATION_RULES.prerender, ...SPECULATION_RULES.prefetch]) {
      expect(rule.eagerness).toBe("moderate");
    }
  });

  // A link that matches both rules would be speculated twice, so the prefetch
  // rule subtracts the prerendered set instead of relying on browser
  // precedence, which the spec does not define.
  it("claims every link with one rule at most", () => {
    for (const pattern of PRERENDER_PATTERNS) {
      const href = pattern.replace("*", "sample");

      expect(SPECULATION_RULES.prerender.some((rule) => evaluate(rule.where, href))).toBe(true);
      expect(SPECULATION_RULES.prefetch.some((rule) => evaluate(rule.where, href))).toBe(false);
    }
  });
});

describe("the small pages", () => {
  it.each([
    "/zavetisca",
    "/zavetisca/zavetisce-ljubljana",
    "/o-nas",
    "/o-nas/vsebine",
    "/o-nas/srecko",
    "/najdena-zival",
    "/viri",
    "/en/shelters",
    "/en/shelters/zavetisce-ljubljana",
    "/en/about",
    "/en/about/content",
    "/en/about/srecko",
    "/en/found-animal",
    "/en/resources",
  ])("prerenders %s", (href) => {
    expect(classify(href)).toBe("prerender");
  });
});

describe("everything else", () => {
  // The home page is the one deliberate omission from the prerender set. Its
  // HTML is 1.2 MB with sixty cards and a 3D model, too much to build behind
  // every hover over the logo on a phone.
  it.each(["/", "/en"])("only prefetches the home page at %s", (href) => {
    expect(classify(href)).toBe("prefetch");
  });

  it.each([
    "/zival/maja/ljubljana/zavetisce-ljubljana",
    "/en/animal/maja/ljubljana/zavetisce-ljubljana",
  ])("prefetches the animal page %s", (href) => {
    expect(classify(href)).toBe("prefetch");
  });
});

describe("the excluded pages", () => {
  it.each([
    "/portal",
    "/portal/prijava",
    "/portal/zival",
    "/vstop",
    "/en/enter",
    "/dev/cards",
    "/dev/map",
    "/o-nas/srecko/plakat",
    "/en/about/srecko/poster",
    "/zival/maja/ljubljana/zavetisce-ljubljana/plakat",
    "/en/animal/maja/ljubljana/zavetisce-ljubljana/poster",
  ])("leaves %s alone", (href) => {
    expect(classify(href)).toBe("none");
  });

  // A print page sits under a prerendered prefix, so the exclusion has to win
  // over the rule that would otherwise claim it.
  it("excludes the print pages from the prerender set too", () => {
    expect(hrefMatches(PRERENDER_PATTERNS, "/o-nas/srecko/plakat")).toBe(true);
    expect(hrefMatches(NEVER_PATTERNS, "/o-nas/srecko/plakat")).toBe(true);
  });

  // Relative patterns resolve against the document, which is what keeps every
  // rule same-origin. Nothing in the JSON says so on its own.
  it.each(["https://github.com/posvoji/posvoji", "https://www.zavetisce-ljubljana.si/"])(
    "never speculates the cross-origin link %s",
    (href) => {
      expect(classify(href)).toBe("none");
    },
  );
});

describe("serializeSpeculationRules", () => {
  it("emits the rule set as JSON", () => {
    expect(JSON.parse(serializeSpeculationRules())).toEqual(SPECULATION_RULES);
  });

  it("leaves no character that could close the script element", () => {
    expect(serializeSpeculationRules()).not.toContain("<");
  });

  // Nothing in the rules holds a `<` today. This is the guard for the day a
  // pattern does, because an unescaped one would end the script element and
  // spill the rest of the rules into the page as text.
  it("escapes a pattern that would close the script element", () => {
    const rules = {
      prerender: [],
      prefetch: [{ where: { href_matches: "/x</script>*" }, eagerness: "moderate" }],
    } satisfies SpeculationRuleSet;

    expect(serializeSpeculationRules(rules)).not.toContain("<");
    expect(JSON.parse(serializeSpeculationRules(rules))).toEqual(rules);
  });
});
