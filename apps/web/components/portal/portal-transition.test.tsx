// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PortalPageTransition } from "@/components/portal/portal-transition";

afterEach(cleanup);

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
});
