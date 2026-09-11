// @vitest-environment jsdom
//
// jsdom, not node: the shell wraps every page in I18nProvider, which wraps it
// in MotionConfig (motion/react), and that reads window.matchMedia when it
// resolves the reducedMotion="user" setting.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteShell } from "./site-shell";
import type { Locale } from "@/lib/i18n";
import { CONTENT_ID } from "@/lib/skip-link";

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

describe("the site shell", () => {
  // The one test that can see both halves of the bypass contract at once. The
  // header emits the link, the shell writes the landmark it aims at, and the
  // nine pages get them together or not at all. It used to be pinned from one
  // page's own test file, which left the other eight, and every page written
  // after them, uncovered.
  it("aims the header's bypass link at a landmark that takes focus", () => {
    const { container } = render(
      <SiteShell locale="sl" footer={null}>
        <p>Vsebina</p>
      </SiteShell>,
    );

    const skip = container.querySelector(`header a[href="#${CONTENT_ID}"]`);
    expect(skip?.textContent).toBe("Preskoči na vsebino");
    // First in the header, or it is not a bypass: everything it skips would
    // already have taken focus.
    expect(container.querySelector("header a")).toBe(skip);

    const main = container.querySelector("main");
    // The literal, not the constant, on this side: the point of the test is
    // that the link and the landmark meet at one value, and both reading the
    // same import would agree with each other however that import changed.
    expect(main?.id).toBe("vsebina");
    // tabIndex, or the anchor only scrolls the page and leaves the keyboard
    // back in the chrome the link exists to skip.
    expect(main?.getAttribute("tabindex")).toBe("-1");
  });

  // The slots in one order for every page. They are what the nine disagreed
  // about: the home page's redirect above the header, BackToTop between the
  // main and the footer on the two long pages.
  it("draws its slots in one order", () => {
    const { container } = render(
      <SiteShell
        locale="sl"
        mainClassName="page-main"
        before={<div data-testid="before" />}
        afterMain={<div data-testid="after-main" />}
        footer={<footer data-testid="footer" />}
      >
        <p data-testid="content" />
      </SiteShell>,
    );

    // Document order, whatever the nesting: the header and the footer are
    // bands of their own and the main sits inside the page frame between
    // them, so the five are no longer siblings.
    expect(
      [...container.querySelectorAll("[data-testid], header, main")].map(
        (node) => node.getAttribute("data-testid") ?? node.tagName.toLowerCase(),
      ),
    ).toEqual(["before", "header", "main", "content", "after-main", "footer"]);
    // The column is the viewport's width and the frame is the main's alone,
    // so the header's and the footer's rules can run edge to edge while the
    // content keeps the measure every page shared. Both strings live here
    // and nowhere else.
    const column = container.firstElementChild;
    expect(column?.className).toBe("flex min-h-dvh flex-col");
    const main = container.querySelector("main");
    expect(main?.parentElement?.className).toBe(
      "mx-auto flex w-full max-w-7xl flex-1 flex-col px-gutter",
    );
    // BackToTop's slot is inside the frame with the main, not out in the
    // column: a page's after-main is part of the page.
    expect(
      container.querySelector('[data-testid="after-main"]')?.parentElement,
    ).toBe(main?.parentElement);
    // The one part the pages genuinely vary, and nothing else lands on the
    // main with it.
    expect(main?.className).toBe("page-main");
    expect(container.querySelector('main [data-testid="content"]')).not.toBeNull();
  });

  // The home page passes no pair and that is the right answer there rather
  // than an oversight: it has no twin to name, so the switcher falls back to
  // the site root. A page with a twin passes its own and the switcher has to
  // use it.
  it.each<{ paths?: Record<Locale, string>; href: string }>([
    { paths: undefined, href: "/en" },
    { paths: { sl: "/o-nas", en: "/en/about" }, href: "/en/about" },
  ])("forwards the language pair the page gives it, or none ($href)", ({ paths, href }) => {
    const { container } = render(
      <SiteShell locale="sl" languagePaths={paths} footer={null}>
        <p />
      </SiteShell>,
    );

    expect(
      container.querySelector('header a[hreflang="en"]')?.getAttribute("href"),
    ).toBe(href);
  });
});
