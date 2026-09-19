// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpeculationRules } from "./speculation-rules";
import { OPT_OUT_SELECTORS, SPECULATION_RULES } from "@/lib/speculation-rules";

const markup = renderToStaticMarkup(<SpeculationRules />);

describe("the speculation rules script", () => {
  // The browser reads the body as JSON. React escapes text children, which
  // would turn every quote into an entity and leave the rules unparseable, so
  // the body goes in raw and this is the test that says it stayed raw.
  it("is one script element the browser can parse", () => {
    const open = '<script type="speculationrules">';
    const close = "</script>";

    expect(markup.startsWith(open)).toBe(true);
    expect(markup.endsWith(close)).toBe(true);
    expect(JSON.parse(markup.slice(open.length, -close.length))).toEqual(SPECULATION_RULES);
  });

  it("emits nothing else", () => {
    expect(markup.match(/<script/g)).toHaveLength(1);
    expect(markup).not.toContain("&quot;");
  });
});

describe("the opt-out selectors", () => {
  function anchor(html: string): HTMLAnchorElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host.firstElementChild as HTMLAnchorElement;
  }

  const selector = OPT_OUT_SELECTORS.join(",");

  it.each([
    '<a href="/viri" rel="nofollow">opt out</a>',
    '<a href="/viri" rel="noopener nofollow">opt out among others</a>',
    '<a href="/viri" data-no-speculate>opt out</a>',
  ])("matches %s", (html) => {
    expect(anchor(html).matches(selector)).toBe(true);
  });

  it("leaves a plain link alone", () => {
    expect(anchor('<a href="/viri" rel="noopener">plain</a>').matches(selector)).toBe(false);
  });
});
