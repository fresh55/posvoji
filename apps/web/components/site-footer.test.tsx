// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages } from "@/lib/i18n";
import { SiteFooter } from "./site-footer";

afterEach(() => cleanup());

// The found-animal lookup used to live in a dialog that only AnimalGrid
// mounts, so until this link existed the flow was reachable from the homepage
// and from nowhere else: not a shelter page, not an animal page, not the resources
// page. Someone holding a stray is at least as likely to arrive by searching
// a shelter's name as by landing on the homepage, and there the site said
// nothing about the question at all. The link is the whole fix, which makes
// its href and its reach the things worth pinning down.
describe("SiteFooter", () => {
  it("carries the found-animal lookup, in both locales", () => {
    render(<SiteFooter locale="sl" />);
    const sl = screen.getByRole("link", { name: "Najdena žival" });
    expect(sl.getAttribute("href")).toBe(FOUND_ANIMAL_PATHS.sl);

    cleanup();

    // The English route, not the Slovenian one: a link that switched the
    // visitor's language on the way to asking for help would be worse than
    // no link.
    render(<SiteFooter locale="en" />);
    const en = screen.getByRole("link", { name: "Found an animal" });
    expect(en.getAttribute("href")).toBe(FOUND_ANIMAL_PATHS.en);
  });

  it("stands the link down when there is no coverage table to answer with", () => {
    render(<SiteFooter locale="sl" showFoundAnimalLink={false} />);

    expect(screen.queryByRole("link", { name: "Najdena žival" })).toBeNull();
    // The rest of the footer is untouched by that gate.
    expect(screen.getByRole("link", { name: "Zavetišča" })).toBeTruthy();
  });

  // Two links and no more. The shelter login is the header's, as a button
  // from lg and in the dropdown below it, and repeating it at the bottom of a
  // page the length of the grid bought nothing. The resources page is hidden
  // in lib/site-links.ts while it waits for a pass over its contents; it
  // still builds and still answers on /viri.
  it("lists the two pages and nothing else", () => {
    const { container } = render(<SiteFooter locale="sl" />);

    const nav = container.querySelector("nav");
    const hrefs = Array.from(nav?.querySelectorAll("a") ?? []).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/zavetisca", FOUND_ANIMAL_PATHS.sl]);
  });

  // The header nav carries moreInformation, and on the shelters page both
  // render from lg up. Two navigation landmarks under one name is a rotor
  // that cannot tell them apart, so this one says where it is instead.
  it("names its landmark apart from the header's", () => {
    const messages = getMessages("sl");
    render(<SiteFooter locale="sl" />);

    expect(
      screen.getByRole("navigation", { name: messages.footerLinks }),
    ).toBeTruthy();
    expect(messages.footerLinks).not.toBe(messages.moreInformation);
  });

  it("clears the floating filter dock on the one page that has one", () => {
    // The grid reserved its own run-off for the dock, but the grid is not what
    // ends the document. Without this the dock sat on top of the only links
    // off the page at phone width.
    // The clearance is measured off back-to-top's own inset variable, so that
    // is what the docked footer has to be carrying.
    const { container, rerender } = render(<SiteFooter locale="sl" />);
    expect(container.querySelector("footer")?.className).not.toContain(
      "--back-to-top-bottom",
    );

    rerender(<SiteFooter locale="sl" docked />);
    expect(container.querySelector("footer")?.className).toContain(
      "--back-to-top-bottom",
    );
  });
});
