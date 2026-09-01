// @vitest-environment jsdom
//
// jsdom, not node: I18nProvider wraps every page in MotionConfig
// (motion/react), which reads window.matchMedia when it resolves the
// reducedMotion="user" setting.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcesPage } from "./resources-page";

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

// Two of the nineteen resources are Slovenian and the rest are English, and
// the titles are quoted rather than translated, so on either page most of the
// headings are in the other language.
const SL_TITLE = "10 mitov o surovi hrani za pse in mačke";
const EN_TITLE = "WSAVA Global Nutrition Guidelines";

function cards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("main article")] as HTMLElement[];
}

function cardFor(container: HTMLElement, title: string): HTMLElement {
  const card = cards(container).find(
    (article) => article.querySelector("h3")?.textContent === title,
  );
  if (!card) throw new Error(`no card for ${title}`);
  return card;
}

describe("the resources page", () => {
  it("marks a quoted title in the language it is written in", () => {
    const { container } = render(<ResourcesPage locale="sl" />);

    // Unmarked, a Slovenian screen reader voices "WSAVA Global Nutrition
    // Guidelines" with Slovenian phonemes. Seventeen of the nineteen headings
    // on this page are English.
    const english = cardFor(container, EN_TITLE);
    expect(english.querySelector("h3")?.getAttribute("lang")).toBe("en");
    // The organization is quoted the same way and gets the same mark. It is
    // the second thing on the meta row, after the kind chip.
    const meta = english.querySelector("div");
    expect(meta?.children[1]?.getAttribute("lang")).toBe("en");

    // The page's own language is not repeated on the cards that are in it.
    const slovenian = cardFor(container, SL_TITLE);
    expect(slovenian.querySelector("h3")?.hasAttribute("lang")).toBe(false);
  });

  it("marks the Slovenian titles on the English page", () => {
    const { container } = render(<ResourcesPage locale="en" />);

    const slovenian = cardFor(container, SL_TITLE);
    expect(slovenian.querySelector("h3")?.getAttribute("lang")).toBe("sl");
    expect(
      cardFor(container, EN_TITLE).querySelector("h3")?.hasAttribute("lang"),
    ).toBe(false);
  });

  it("gives every resource link a name of its own", () => {
    const { container } = render(<ResourcesPage locale="sl" />);

    // Nineteen links all named "Odpri vir" are nineteen links a reader
    // listing them cannot tell apart.
    const links = cards(container).map((card) => {
      const link = card.querySelector("a");
      if (!link) throw new Error("a resource card has no link");
      return link;
    });
    expect(links).toHaveLength(19);

    const names = links.map((link) => link.getAttribute("aria-labelledby"));
    expect(names.every((name) => name)).toBe(true);
    expect(new Set(names).size).toBe(links.length);

    // The name opens with the words the reader sees, which is what WCAG 2.5.3
    // asks of a control whose label is visible, and finishes with the title
    // from the heading itself rather than a second copy of it.
    expect(
      screen
        .getByRole("link", { name: `Odpri vir ${EN_TITLE}` })
        .getAttribute("href"),
    ).toBe("https://wsava.org/global-guidelines/global-nutrition-guidelines/");
  });

  it("prints the same two words on the link as before", () => {
    const { container } = render(<ResourcesPage locale="sl" />);

    // The title finishes the name from the heading where it already stands,
    // so nothing was added to what the card prints.
    const card = cardFor(container, EN_TITLE);
    const link = card.querySelector("a");
    expect(link?.firstChild?.textContent).toBe("Odpri vir");
    expect(link?.textContent).toBe("Odpri vir↗");
    // And the second half of the name is the heading, which carries the lang
    // the title needs.
    const [, titleId] = link?.getAttribute("aria-labelledby")?.split(" ") ?? [];
    expect(card.querySelector("h3")?.id).toBe(titleId);
  });

  it("names the English links in English", () => {
    render(<ResourcesPage locale="en" />);

    expect(
      screen.getByRole("link", { name: `Open resource ${SL_TITLE}` }),
    ).toBeTruthy();
  });
});
