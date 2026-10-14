// @vitest-environment jsdom
//
// jsdom, not node: the header's controls are client components that read the
// i18n context, and the provider that carries it wraps its children in
// MotionConfig (motion/react), which reads window.matchMedia.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/lib/i18n";
import { POETIVO_NAME } from "@/lib/site";
import { I18nProvider } from "./i18n-provider";
import { SiteHeader } from "./site-header";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(cleanup);

describe("the site header", () => {
  // The half of the view-transition contract that lives in the markup.
  // globals.css hangs view-transition-name: site-header on this class so the
  // band stands still while a navigation carries the page under it, and a
  // rename here would take the rule off without failing anything: the
  // stylesheet would still parse, the build would still pass, and the header
  // would quietly go back to cross-fading with itself.
  it("marks the band the page transition pins", () => {
    const { container } = render(
      <I18nProvider locale="sl">
        <SiteHeader locale="sl" />
      </I18nProvider>,
    );

    const pinned = container.querySelectorAll(".site-header");
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.tagName).toBe("HEADER");
  });

  // The lockup under the name is text inside the home link, not a link: a
  // link inside a link is invalid, and the home link's accessible name stays
  // the site's. The way to poetivo.si is the footer's, which its own test
  // pins on every page.
  it("names who builds it under the name, inside the home link", () => {
    const messages = getMessages("sl");
    const { container } = render(
      <I18nProvider locale="sl">
        <SiteHeader locale="sl" />
      </I18nProvider>,
    );

    const brand = container.querySelector<HTMLAnchorElement>("a[data-brand]")!;
    const lockup = brand.querySelector("[data-poetivo]")!;
    expect(lockup).not.toBeNull();
    // Lowercased under the lowercase address above it; the footer keeps the
    // capital, so the two are checked apart.
    expect(lockup.textContent).toContain(
      `${messages.poweredBy.toLowerCase()} ${POETIVO_NAME}`,
    );
    expect(lockup.querySelector("a")).toBeNull();
    expect(brand.getAttribute("aria-label")).toBe("posvoji.si");
  });
});
