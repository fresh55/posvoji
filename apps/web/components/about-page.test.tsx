// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutPage } from "./about-page";
import { getMessages, type Locale } from "@/lib/i18n";
import { ABOUT_PATHS } from "@/lib/site-links";

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

describe("the about page", () => {
  // The heading and the crumb above it read one string, so this pins the
  // wiring and not the wording: a copy change moves both and this stays
  // green, while a page that named itself something the roster does not
  // would fail. The five facts are counted rather than quoted, for the same
  // reason - their words live in one place.
  it.each<Locale>(["sl", "en"])(
    "names itself the way the roster does (%s)",
    (locale) => {
      render(<AboutPage locale={locale} />);

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        getMessages(locale).about,
      );
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
    },
  );

  // The page is the destination of the footer's about link, so its own
  // footer must not offer it; the header's language switcher, on the other
  // hand, must know the page's address in the other language.
  it("links to its own translation and not to itself", () => {
    render(<AboutPage locale="sl" />);

    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(ABOUT_PATHS.en);

    // Only the one fact this page owns. Which destinations the footer lists
    // is site-footer.test.tsx's business, because the total record deciding
    // it lives there; asserting the whole roster from here would break this
    // file every time an unrelated page joined it.
    const footer = screen.getByRole("navigation", {
      name: getMessages("sl").footerLinks,
    });
    const footerHrefs = [...footer.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(footerHrefs.length).toBeGreaterThan(0);
    expect(footerHrefs).not.toContain(ABOUT_PATHS.sl);
  });

  it("prints the contact address as the link", () => {
    render(<AboutPage locale="sl" />);

    expect(
      screen.getByRole("link", { name: "info@posvoji.si" }).getAttribute("href"),
    ).toBe("mailto:info@posvoji.si");
  });
});
