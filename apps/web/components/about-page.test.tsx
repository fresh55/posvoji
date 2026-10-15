// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render, screen, within } from "@testing-library/react";
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
      "Za posvojitelje", "Za zavetišča", "Kontakt",
    ]);
    expect(screen.getAllByRole("heading", { level: 3 }).map(node => node.textContent)).toEqual([
      "Posvojitev poteka pri zavetišču", "Pred obiskom preveri, ali žival še išče dom", "Brezplačen ogled, brez računa",
      "Vi odločate o svojih vsebinah", "Kako se vključite?",
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
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
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

  // Shelter participation has its own contact action. The closing address
  // remains available to visitors reporting a correction.
  it.each([
    { locale: "sl" as const, adopters: "Za posvojitelje", availability: "Pred obiskom preveri, ali žival še išče dom", shelters: "Za zavetišča", email: "Pišite na info@posvoji.si", login: "Že imate dostop? Prijava za zavetišča" },
    { locale: "en" as const, adopters: "For adopters", availability: "Before visiting, check whether the animal still needs a home", shelters: "For shelters", email: "Email info@posvoji.si", login: "Already have access? Shelter login" },
  ])("keeps each audience's guidance and contact actions together (%s)", ({ locale, adopters, availability, shelters, email, login }) => {
    render(<AboutPage locale={locale} />);
    const adopterSection = screen.getByRole("region", { name: adopters });
    const shelterSection = screen.getByRole("region", { name: shelters });
    expect(within(adopterSection).getByRole("heading", { level: 3, name: availability })).toBeTruthy();
    expect(within(adopterSection).getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(within(shelterSection).getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(adopterSection.compareDocumentPosition(shelterSection) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    const join = within(shelterSection).getByRole("link", { name: email });
    expect(join.getAttribute("href")).toBe("mailto:info@posvoji.si");
    expect(join.getAttribute("data-slot")).toBeNull();
    expect(within(shelterSection).getByRole("link", { name: login }).getAttribute("href"))
      .toBe("/portal/prijava");
    // Where the address sits, not what it points at: the test below owns the
    // href. queryByRole is the load-bearing half of the pair under it, because
    // compareDocumentPosition reports FOLLOWING for a descendant too, so the
    // position alone would pass with the address inside the shelter section.
    const address = screen.getByRole("link", { name: "info@posvoji.si" });
    expect(within(shelterSection).queryByRole("link", { name: "info@posvoji.si" })).toBeNull();
    expect(shelterSection.compareDocumentPosition(address) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
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
    ["sl", "Vsebine in dovoljenja", "/o-nas/vsebine"],
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

  // The one thing an adopter came to do is drawn as a button, and the other
  // row links stay quiet: a primary action styled like a footnote was the
  // hierarchy fault this pins.
  it.each<[Locale, string, string]>([
    ["sl", "Poglej živali, ki iščejo dom", "/"],
    ["en", "Browse animals looking for a home", "/en"],
  ])("draws the adopter's action as a button (%s)", (locale, label, href) => {
    render(<AboutPage locale={locale} />);

    const action = screen.getByRole("link", { name: label });
    expect(action.getAttribute("href")).toBe(href);
    expect(action.getAttribute("data-slot")).toBe("button");
    expect(
      screen.getByRole("link", { name: /Vsebine|Content and/ }).getAttribute("data-slot"),
    ).toBeNull();
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
