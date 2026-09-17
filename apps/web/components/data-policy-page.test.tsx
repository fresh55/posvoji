// @vitest-environment jsdom
//
// jsdom, not node, for the reason about-page.test.tsx records: I18nProvider
// wraps every page in MotionConfig, which reads window.matchMedia.

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataPolicyPage } from "./data-policy-page";
import { getMessages, type Locale } from "@/lib/i18n";
import { PAGE_TITLE } from "@/lib/link-styles";
import { ABOUT_PATHS, DATA_POLICY_PATHS } from "@/lib/site-links";

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

describe("the content and permissions page", () => {
  // The commitments, counted rather than quoted: their words live in one place
  // and a copy change should not fail this. What it pins is that every rule in
  // the record reaches the page with a heading of its own, and that the two
  // locales carry the same number of them.
  it.each<Locale>(["sl", "en"])("gives every rule a heading (%s)", (locale) => {
    render(<DataPolicyPage locale={locale} />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(
      // The eight rules, and the grants block's own heading.
      9,
    );
  });

  // The two claims that were wrong when this page first shipped, pinned as
  // absences so they cannot come back by a copy edit. The source of a portal
  // listing is the shelter's public page (apps/ingest/src/portal-listings.ts),
  // and the portal tells a shelter nothing about consent, so the page does not
  // assert one on its behalf.
  it("does not claim the portal is a source or a consent form", () => {
    const { container } = render(<DataPolicyPage locale="sl" />);

    const text = container.querySelector("main")?.textContent ?? "";
    expect(text).not.toContain("stran zavetišča na portalu");
    expect(text).not.toContain("velja kot dovoljenje");
  });

  // It sits under the about page and the trail says so. Scoped to the
  // breadcrumb landmark, because the header's row and the footer's links both
  // name the about page too: an unscoped query here matches three links and
  // would pass on whichever one it happened to find.
  it.each<Locale>(["sl", "en"])("hangs off the about page (%s)", (locale) => {
    const messages = getMessages(locale);
    render(<DataPolicyPage locale={locale} />);

    const trail = screen.getByRole("navigation", {
      name: messages.breadcrumbNav,
    });
    expect(
      within(trail)
        .getByRole("link", { name: messages.about })
        .getAttribute("href"),
    ).toBe(ABOUT_PATHS[locale]);
  });

  // The rule a shelter acts on rather than reads. The address is printed as
  // itself so it can be read off the page, the rule about-page.tsx records,
  // and the right to leave is worth nothing without a way to exercise it.
  it.each<Locale>(["sl", "en"])(
    "prints the address inside the exit rule (%s)",
    (locale) => {
      render(<DataPolicyPage locale={locale} />);

      expect(
        screen
          .getByRole("link", { name: "info@posvoji.si" })
          .getAttribute("href"),
      ).toBe("mailto:info@posvoji.si");
    },
  );

  // The page's one way out of the site, and the only one. A shelter reading
  // what happens to its photos should not be handed a repository, which is
  // what /o-nas used to do with the link that now lands here.
  it.each<Locale>(["sl", "en"])(
    "leaves the site once, for the technical version (%s)",
    (locale) => {
      const { container } = render(<DataPolicyPage locale={locale} />);

      const main = container.querySelector("main");
      expect(main).not.toBeNull();
      const external = [...main!.querySelectorAll("a")].filter((a) =>
        a.getAttribute("href")?.includes("github.com"),
      );
      expect(external).toHaveLength(1);
      // target="_blank" announces nothing on its own, so the accessible name
      // carries the sentence, the way the footer and the shelter cards do.
      expect(external[0].getAttribute("target")).toBe("_blank");
      expect(external[0].getAttribute("rel")).toBe("noreferrer");
      expect(external[0].textContent).toContain(getMessages(locale).newWindow);
    },
  );

  // The phone step the five content pages were missing; resources-page's own
  // test says what the ladder is.
  it("steps the heading down on a phone", () => {
    render(<DataPolicyPage locale="sl" />);

    // PAGE_TITLE owns the ladder, so this reads it rather than respelling it;
    // four older page tests still carry the literal, from before it had a home.
    expect(screen.getByRole("heading", { level: 1 }).className).toContain(
      PAGE_TITLE,
    );
  });

  // The language switcher needs this page's own pair, not the homepage
  // fallback: a shelter reading the Slovenian policy and pressing EN should
  // land on the English policy and not on the grid.
  it.each<Locale>(["sl", "en"])(
    "names its own twin in the switcher (%s)",
    (locale) => {
      const { container } = render(<DataPolicyPage locale={locale} />);

      const other: Locale = locale === "sl" ? "en" : "sl";
      expect(
        container.querySelector(`a[href="${DATA_POLICY_PATHS[other]}"]`),
      ).not.toBeNull();
    },
  );
});
