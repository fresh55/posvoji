// @vitest-environment jsdom
//
// jsdom, not node: the header's controls are client components that read the
// i18n context, and the provider that carries it wraps its children in
// MotionConfig (motion/react), which reads window.matchMedia.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
