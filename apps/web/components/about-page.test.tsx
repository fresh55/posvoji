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

// The viewer's browser lifecycle is exercised separately in about-cat.test.tsx.
vi.mock("./about-cat", () => ({ AboutCat: () => null }));

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
  it("explains shelter adoption before site details in Slovenian", () => {
    render(<AboutPage locale="sl" />);
    expect(screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)).toEqual([
      "Želite posvojiti?", "Ali žival še išče dom?", "Brezplačna uporaba",
      "Zavetišča odločate o svojih vsebinah", "Kako se zavetišče vključi?",
    ]);
    expect(screen.getByRole("link", { name: "posvoji.si" }).getAttribute("href")).toBe("/");
  });
  // The heading and the crumb above it read one string, so this pins the
  // wiring and not the wording: a copy change moves both and this stays
  // green, while a page that named itself something the roster does not
  // would fail. The sections are counted rather than quoted, for the same
  // reason: their words live in one place.
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

  // One button under the closing line: the address, printed as itself so it
  // can be read off the page.
  it.each<Locale>(["sl", "en"])(
    "offers the address as the closing line's one button (%s)",
    (locale) => {
      const { container } = render(<AboutPage locale={locale} />);

      expect(
        screen
          .getByRole("link", { name: "info@posvoji.si" })
          .getAttribute("href"),
      ).toBe("mailto:info@posvoji.si");
      // The repository used to sit beside the address as a second button of
      // the same size, under a sentence addressed to shelters. It is the
      // footer's now and only the footer's, so the one inside `main` is gone.
      const main = container.querySelector("main");
      expect(main).not.toBeNull();
      const mainHrefs = [...main!.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
      expect(mainHrefs.some((href) => href?.includes("github.com"))).toBe(false);
    },
  );

  // The policy is a page of this site, and it used to be a markdown file on
  // github.com: the one link on this page a shelter has a reason to open.
  it.each<[Locale, string, string]>([
    ["sl", "O vsebinah in dovoljenjih", "/o-nas/vsebine"],
    ["en", "Content and permissions", "/en/about/content"],
  ])("links the policy on-site (%s)", (locale, label, href) => {
    render(<AboutPage locale={locale} />);

    // The query matches the accessible name in full, so it is already the
    // assertion that nothing was appended to the label: the test this replaced
    // had to write `${code} ${newWindow}` to find the old link at all.
    const policy = screen.getByRole("link", { name: label });
    expect(policy.getAttribute("href")).toBe(href);
    expect(policy.getAttribute("target")).toBeNull();
  });

  // The phone step the five content pages were missing; resources-page's own
  // test says what the ladder is.
  it("steps the heading down on a phone", () => {
    render(<AboutPage locale="sl" />);

    expect(
      screen.getByRole("heading", { level: 1 }).className.split(" "),
    ).toEqual(expect.arrayContaining(["text-2xl", "sm:text-3xl", "md:text-4xl"]));
  });
});
