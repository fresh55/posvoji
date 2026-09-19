// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ViewTransitionProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PortalPageTransition } from "@/components/portal/portal-transition";

afterEach(cleanup);

const stylesheet = readFileSync(
  join(process.cwd(), "components", "portal", "portal-transitions.css"),
  "utf8",
);

/** What one at-rule holds, from its opening brace to the brace that closes it. */
function atRuleBody(css: string, opening: string): string {
  const start = css.indexOf(opening);
  if (start < 0) throw new Error(`no ${opening} in the stylesheet`);
  let depth = 0;
  for (let i = start + opening.length - 1; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i);
    }
  }
  throw new Error(`${opening} is never closed`);
}

describe("PortalPageTransition", () => {
  it("renders the page it wraps where the browser has no view transitions", () => {
    expect(document.startViewTransition).toBeUndefined();

    const { container } = render(
      <PortalPageTransition>
        <h1>Vaše živali</h1>
        <section>Seznam</section>
      </PortalPageTransition>,
    );

    expect(screen.getByRole("heading", { name: "Vaše živali" })).toBeTruthy();
    // And both children are still the page's own top-level boxes. The portal's
    // main is a flex column with a gap between what each page returns, so a
    // wrapper that drew a box of its own would fold the two into one item and
    // close the gap between them.
    expect(container.childElementCount).toBe(2);
    expect(container.firstElementChild?.tagName).toBe("H1");
  });

  it("animates the step between pages and nothing else", () => {
    // Read off the element rather than the DOM: React hands these to the
    // browser as view transition classes, and nothing about them reaches the
    // document under jsdom. They are half of a contract whose other half is
    // the stylesheet below, so both halves are checked together.
    const element = PortalPageTransition({ children: <p>Ena žival</p> });
    const props = element.props as ViewTransitionProps;

    // Every trigger but the two is off, so a status saved from a row or a
    // filter typed into the list does not fade the whole page.
    expect(props.default).toBe("none");
    expect(props.enter).toBe("portal-enter");
    expect(props.exit).toBe("portal-exit");

    expect(stylesheet).toContain("::view-transition-old(.portal-exit)");
    expect(stylesheet).toContain("::view-transition-new(.portal-enter)");
  });

  it("holds the motion behind prefers-reduced-motion", () => {
    // Every rule that moves something is inside the no-preference block.
    const gated = atRuleBody(
      stylesheet,
      "@media (prefers-reduced-motion: no-preference) {",
    );
    expect(gated).toContain("::view-transition-old(.portal-exit)");
    expect(gated).toContain("::view-transition-new(.portal-enter)");

    // And asked for less motion the swap is instant. React still names the two
    // page bodies, so the browser still runs a transition and would cross-fade
    // them over a quarter of a second on its own. Nulling the durations is
    // what takes that default out.
    const reduced = atRuleBody(
      stylesheet,
      "@media (prefers-reduced-motion: reduce) {",
    );
    expect(reduced).toContain("animation-duration: 0s !important;");
    expect(reduced).toContain("animation-delay: 0s !important;");
  });
});
