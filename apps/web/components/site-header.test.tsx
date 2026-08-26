// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "./i18n-provider";
import { SiteHeader } from "./site-header";

afterEach(() => cleanup());

function mount(node: React.ReactNode, locale: "sl" | "en" = "sl") {
  return render(<I18nProvider locale={locale}>{node}</I18nProvider>);
}

// The header was a logo, a language switcher and a GitHub link: every way to
// another page lived in the footer, at the bottom of a grid that runs for
// several screens. These pin what the navigation links to, which is the part
// that has to stay right in both languages.
describe("SiteHeader navigation", () => {
  it("stays in the visitor's language", () => {
    mount(<SiteHeader locale="sl" homeHref="/" />);
    expect(
      screen.getByRole("link", { name: "Zavetišča" }).getAttribute("href"),
    ).toBe("/zavetisca");
    expect(
      screen.getByRole("link", { name: "Najdena žival" }).getAttribute("href"),
    ).toBe("/najdena-zival");
    expect(screen.getByRole("link", { name: "Viri" }).getAttribute("href")).toBe(
      "/viri",
    );

    cleanup();

    // The English header must not hand an English reader a Slovenian route.
    mount(<SiteHeader locale="en" homeHref="/en" />, "en");
    expect(
      screen.getByRole("link", { name: "Shelters" }).getAttribute("href"),
    ).toBe("/en/shelters");
    expect(
      screen.getByRole("link", { name: "Found an animal" }).getAttribute("href"),
    ).toBe("/en/found-animal");
    expect(
      screen.getByRole("link", { name: "Resources" }).getAttribute("href"),
    ).toBe("/en/resources");
  });

  it("marks the section the page is in, including a page below it", () => {
    // A shelter's own page is inside Zavetišča, so that is the link that
    // reads as current. The path comes from what the header already hands the
    // language switcher, so no page has to say where it is twice.
    mount(
      <SiteHeader
        locale="sl"
        homeHref="/"
        languagePaths={{
          sl: "/zavetisca/ljubljana",
          en: "/en/shelters/ljubljana",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Zavetišča" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Viri" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("marks nothing on the homepage, which is not one of the sections", () => {
    mount(<SiteHeader locale="sl" homeHref="/" />);

    for (const name of ["Zavetišča", "Najdena žival", "Viri"]) {
      expect(
        screen.getByRole("link", { name }).getAttribute("aria-current"),
      ).toBeNull();
    }
  });
});
