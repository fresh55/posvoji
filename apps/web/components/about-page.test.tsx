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
import { SRECKO_PATHS } from "@/lib/srecko";

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
  // The heading and the crumb above it read one string, so this pins the
  // wiring and not the wording: a copy change moves both and this stays
  // green, while a page that named itself something the roster does not
  // would fail. The five facts are counted rather than quoted, for the same
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

  // Quoted, where the five facts are only counted, because this one is not
  // interchangeable copy. It names him and it is the only line on the page
  // that says why the site exists, so a later pass over the wording should
  // have to come here and mean it rather than lose it to a trim. Last in the
  // main column too: a dedication that stops being last stops being one.
  //
  // Read off the paragraph rather than through getByText: his name inside the
  // sentence is a link now, so the line is three nodes and a text query built
  // on direct text children would no longer see it whole. Whole is the point,
  // which is what lastElementChild asserts.
  it.each<Locale>(["sl", "en"])("closes on the dedication (%s)", (locale) => {
    const { container } = render(<AboutPage locale={locale} />);

    const dedication = locale === "sl"
      ? "Ta stran je v spomin na Srečka."
      : "This site is in memory of Srečko.";

    const main = container.querySelector("main");
    expect(main?.lastElementChild?.textContent).toBe(dedication);
  });

  // His name is the way to his page and the only way to it: the page is in no
  // menu and in no footer, because a reader who has not read this line has no
  // reason to be sent there. So this link is the whole of its discoverability
  // and losing it would leave the page unreachable rather than merely quiet.
  it.each<Locale>(["sl", "en"])("leads to his page (%s)", (locale) => {
    render(<AboutPage locale={locale} />);

    const name = locale === "sl" ? "Srečka" : "Srečko";
    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(
      SRECKO_PATHS[locale],
    );
  });

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

  // Two buttons under the closing line: the address, printed as itself so it
  // can be read off the page, and the repository the open-source fact names.
  it.each<[Locale, string]>([
    ["sl", "Koda na GitHubu"],
    ["en", "Code on GitHub"],
  ])("offers the address and the code as buttons (%s)", (locale, code) => {
    render(<AboutPage locale={locale} />);

    expect(
      screen.getByRole("link", { name: "info@posvoji.si" }).getAttribute("href"),
    ).toBe("mailto:info@posvoji.si");
    const repo = screen.getByRole("link", { name: code });
    expect(repo.getAttribute("href")).toBe("https://github.com/fresh55/posvoji");
    expect(repo.getAttribute("rel")).toBe("noreferrer");
  });
});
