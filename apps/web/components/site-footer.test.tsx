// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FOUND_ANIMAL_PATHS } from "@/lib/found-animal";
import { getMessages } from "@/lib/i18n";
import { CONTACT_EMAIL, POETIVO_NAME, POETIVO_URL, REPO_URL } from "@/lib/site";
import { ABOUT_PATHS } from "@/lib/site-links";
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

  // Three links and no more. The shelter login is the header's, as a button
  // from lg and in the dropdown below it, and repeating it at the bottom of a
  // page the length of the grid bought nothing. The resources page is hidden
  // in lib/site-links.ts while it waits for a pass over its contents; it
  // still builds and still answers on /viri.
  it("lists the three pages and nothing else", () => {
    const { container } = render(<SiteFooter locale="sl" />);

    const nav = container.querySelector("nav");
    const hrefs = Array.from(nav?.querySelectorAll("a") ?? []).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/zavetisca",
      FOUND_ANIMAL_PATHS.sl,
      ABOUT_PATHS.sl,
    ]);
  });

  it("passes the about link off on the page it points at", () => {
    render(<SiteFooter locale="sl" showAboutLink={false} />);

    expect(screen.queryByRole("link", { name: "O nas" })).toBeNull();
    expect(screen.getByRole("link", { name: "Zavetišča" })).toBeTruthy();
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

  // The correction route and the code, on every page. Both are outside the
  // nav on purpose: the roster in lib/site-links.ts holds pages of this site,
  // and a mail composer and a repository on another domain are neither. The
  // test above pins the nav at three hrefs, and this is the other half of
  // that invariant.
  it("offers a way to write and a way to read the code", () => {
    const { container } = render(<SiteFooter locale="sl" />);
    const nav = container.querySelector("nav")!;

    const mail = container.querySelector<HTMLAnchorElement>(
      'a[href^="mailto:"]',
    )!;
    expect(mail.getAttribute("href")).toContain(CONTACT_EMAIL);
    // Printed as the address itself, so a reader writing from their own mail
    // client can read it off the page.
    expect(mail.textContent).toBe(CONTACT_EMAIL);
    expect(nav.contains(mail)).toBe(false);

    const repo = container.querySelector<HTMLAnchorElement>(
      `a[href="${REPO_URL}"]`,
    )!;
    expect(nav.contains(repo)).toBe(false);
  });

  // The same rule the three link flags follow: a page that states the address
  // itself passes the footer's copy off. /o-nas prints it in its contact block
  // and the portal under its login form, and the portal's card takes it away
  // again once the link is sent, which a footer copy would contradict.
  // The repository link is not part of the bargain and stays.
  it("passes the correction route off for a page that states it itself", () => {
    const { container } = render(
      <SiteFooter locale="sl" showContact={false} />,
    );

    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(`a[href="${REPO_URL}"]`),
    ).not.toBeNull();
  });

  // Who builds the site, on every page, in the row with the other two and
  // outside the nav for the reason they are: poetivo.si is not a page of
  // this site. Pinned with every switch off, because the pages that turn the
  // most off (the portal, the found-animal lookup) are pages too.
  it("names who builds it, in both locales, whatever the page turns off", () => {
    const messages = getMessages("sl");
    const { container } = render(
      <SiteFooter
        locale="sl"
        showSheltersLink={false}
        showFoundAnimalLink={false}
        showAboutLink={false}
        showContact={false}
        aboutListings={false}
      />,
    );

    const credit = container.querySelector<HTMLAnchorElement>(
      `a[href="${POETIVO_URL}"]`,
    )!;
    expect(credit).not.toBeNull();
    // The verb from the catalogue, then the name, in that order and with a
    // space between: the accessible name is read as one phrase.
    expect(credit.textContent).toContain(`${messages.poweredBy} ${POETIVO_NAME}`);
    // Leaves the site, and the accessible name says so the way the
    // repository link's does.
    expect(credit.getAttribute("target")).toBe("_blank");
    expect(credit.textContent).toContain(messages.newWindow);

    cleanup();

    // Outside the nav, checked on a render that has one: with every link off
    // there is no nav to be outside of, and a "not inside" on nothing passes
    // for free.
    const en = render(<SiteFooter locale="en" />);
    const nav = en.container.querySelector("nav")!;
    expect(nav).not.toBeNull();
    const link = screen.getByRole("link", { name: /^Powered by Poetivo/ });
    expect(link.getAttribute("href")).toBe(POETIVO_URL);
    expect(nav.contains(link)).toBe(false);
  });

  // The found-animal page is not about the listings. The provenance sentence
  // is about adopting an animal, which is not the task on that page.
  it("drops the listings note on a page about another task", () => {
    const messages = getMessages("sl");
    const { container } = render(
      <SiteFooter locale="sl" aboutListings={false} />,
    );

    expect(container.textContent).not.toContain(messages.footer);

    // What a reader is still owed: the way to the other pages, the address to
    // write a correction to, and the code.
    expect(screen.getByRole("link", { name: "Zavetišča" })).toBeTruthy();
    expect(container.querySelector('a[href^="mailto:"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLAnchorElement>(`a[href="${REPO_URL}"]`),
    ).not.toBeNull();
  });

  // target="_blank" is silent, and this is one of the two links in the
  // chrome that leave the site.
  it("says the repository link opens a new window", () => {
    const messages = getMessages("sl");
    const { container } = render(<SiteFooter locale="sl" />);

    const repo = container.querySelector<HTMLAnchorElement>(
      `a[href="${REPO_URL}"]`,
    )!;
    expect(repo.textContent).toContain(messages.openSource);
    expect(repo.getAttribute("target")).toBe("_blank");
    expect(repo.textContent?.trimEnd().endsWith(messages.newWindow)).toBe(true);
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
