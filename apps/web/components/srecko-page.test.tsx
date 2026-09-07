// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SreckoPage } from "./srecko-page";
import { type Locale } from "@/lib/i18n";
import { statusLabel } from "@/lib/labels";
import { homePath } from "@/lib/shelter-path";
import {
  SRECKO,
  SRECKO_PATHS,
  SRECKO_POSTER_PATHS,
  sreckoDateLabel,
  sreckoMonthsAtHome,
} from "@/lib/srecko";

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

const LOCALES: Locale[] = ["sl", "en"];

const hrefs = () =>
  screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("Srečko's page", () => {
  // His name and nothing else, in both languages. It is the one string on the
  // page that is not translated, so the heading reads off lib/srecko.ts rather
  // than off a copy record that could learn a second spelling.
  it.each(LOCALES)("is headed by his name (%s)", (locale) => {
    render(<SreckoPage locale={locale} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      SRECKO.name,
    );
  });

  // The badge says what the site says about an adopted animal, in the site's
  // own word for it. Quoted from labels.ts and never typed here: a page that
  // spelled the status itself would be free to disagree with every card.
  it.each(LOCALES)("wears the site's own adopted badge (%s)", (locale) => {
    render(<SreckoPage locale={locale} />);

    const label = statusLabel(SRECKO.status, locale);
    expect(label).toBeDefined();
    expect(screen.getByText(label as string)).not.toBeNull();
  });

  // The promise the about page makes is that nobody buys a place on the list.
  // Sending every reader who is moved by this page to the one shelter he came
  // from is the nearest thing to breaking it, so the name is on no surface:
  // not in the copy, not in an alt text, not in the head.
  it.each(LOCALES)("names no shelter (%s)", (locale) => {
    const { container } = render(<SreckoPage locale={locale} />);

    const markup = container.innerHTML;
    expect(markup).not.toContain("Mačja hiša");
    expect(markup).not.toContain("Macja hisa");
  });

  // The line that leads here, and it closes this page as it closes the one it
  // came from. A dedication that stops being last stops being one.
  it.each<[Locale, string]>([
    ["sl", "Ta stran je v spomin na Srečka."],
    ["en", "This site is in memory of Srečko."],
  ])("closes on the dedication (%s)", (locale, dedication) => {
    const { container } = render(<SreckoPage locale={locale} />);

    expect(container.querySelector("main")?.lastElementChild?.textContent).toBe(
      dedication,
    );
  });

  // No photographs of him are prepared, and until they are the page draws the
  // render the about page draws. Pinned because the alternative a missing
  // picture invites is an empty frame or a note promising one later, and both
  // were ruled out.
  it("shows the still render while there are no photographs", () => {
    expect(SRECKO.photos).toHaveLength(0);
    render(<SreckoPage locale="sl" />);

    const images = screen
      .getAllByRole("img")
      .map((image) => image.getAttribute("src") ?? "");
    expect(images.some((src) => src.includes("poster.webp"))).toBe(true);
  });

  // The way on, and the whole point of the page: the cats waiting now. The
  // query is the one the grid's own codec writes, so a link that kept working
  // as a link while quietly filtering nothing would fail here. No sort param,
  // because the default order is the longest wait.
  it.each(LOCALES)("offers the cats still waiting (%s)", (locale) => {
    render(<SreckoPage locale={locale} />);

    expect(hrefs()).toContain(`${homePath(locale)}?vrsta=macka`);
  });

  it.each(LOCALES)("links to his printable sheet (%s)", (locale) => {
    render(<SreckoPage locale={locale} />);

    expect(hrefs()).toContain(SRECKO_POSTER_PATHS[locale]);
  });

  // The header's language switcher has to know the page's address in the other
  // language, or the page is reachable in one language only.
  it.each<[Locale, Locale]>([
    ["sl", "en"],
    ["en", "sl"],
  ])("offers its own translation (%s)", (locale, other) => {
    render(<SreckoPage locale={locale} />);

    expect(hrefs()).toContain(SRECKO_PATHS[other]);
  });
});

// The two helpers his page reads dates through. Here rather than in a suite of
// their own because this is the only page that calls them, and both exist for
// facts that are not recorded yet: the tests are what says how the page will
// behave on the day the dates are filled in.
describe("his dates", () => {
  it("prints a date at the precision it was recorded at", () => {
    expect(sreckoDateLabel("2019", "sl")).toBe("2019");
    expect(sreckoDateLabel("2019", "en")).toBe("2019");
    expect(sreckoDateLabel("2019-03", "sl")).toBe("marec 2019");
    expect(sreckoDateLabel("2019-03", "en")).toBe("March 2019");
    expect(sreckoDateLabel("2019-03-04", "sl")).toBe("4. 3. 2019");
    expect(sreckoDateLabel("2019-03-04", "en")).toBe("4 March 2019");
  });

  // Undefined and not "Invalid Date": the timeline is written to read without
  // a date, so a value it cannot understand costs the line its date and
  // nothing else.
  it("refuses what it cannot read", () => {
    expect(sreckoDateLabel("marec 2019", "sl")).toBeUndefined();
    expect(sreckoDateLabel("2019-13", "sl")).toBeUndefined();
    expect(sreckoDateLabel("2019-02-30", "sl")).toBeUndefined();
  });

  it("counts the months between the adoption and the death", () => {
    expect(
      sreckoMonthsAtHome([
        { key: "adopted", date: "2019-03" },
        { key: "died", date: "2024-09" },
      ]),
    ).toBe(66);
    // A year against a year reads as the start of each, which is the only
    // reading a bare year supports.
    expect(
      sreckoMonthsAtHome([
        { key: "adopted", date: "2019" },
        { key: "died", date: "2020" },
      ]),
    ).toBe(12);
  });

  // Every one of these is the state the timeline is in today, so the page has
  // to draw without the derived line rather than with a zero in it.
  it("says nothing while a date is missing or impossible", () => {
    expect(sreckoMonthsAtHome(SRECKO.timeline)).toBeUndefined();
    expect(
      sreckoMonthsAtHome([{ key: "adopted", date: "2019" }, { key: "died" }]),
    ).toBeUndefined();
    expect(
      sreckoMonthsAtHome([
        { key: "adopted", date: "2024" },
        { key: "died", date: "2019" },
      ]),
    ).toBeUndefined();
  });
});
