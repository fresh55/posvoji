// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelterLogin, SiteMenu, SiteNav } from "./site-menu";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(cleanup);

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

function openMenu(locale: "sl" | "en", triggerName: string) {
  render(
    <I18nProvider locale={locale}>
      <SiteMenu />
    </I18nProvider>,
  );
  const trigger = screen.getByRole("button", { name: triggerName });
  // Radix opens the menu on pointerdown or on Enter. jsdom's pointerdown
  // arrives without the button/pointerType fields the pointer path checks,
  // so the keyboard path is the one that works here.
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("menu");
}

describe("the header menu", () => {
  it("carries the footer's links and the login under them", () => {
    openMenu("sl", "Več informacij");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Zavetišča",
      "Najdena žival",
      "Prijava za zavetišča",
    ]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/zavetisca",
      "/najdena-zival",
      "/portal/prijava",
    ]);
  });

  it("routes the English visitor to the English pages", () => {
    openMenu("en", "More information");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/en/shelters",
      "/en/found-animal",
      "/portal/prijava",
    ]);
  });

  // The page still builds and still answers on /viri and /en/resources; it is
  // only unlisted, in lib/site-links.ts, and the dropdown is the surface that
  // used to show every link there was.
  it("leaves the hidden resources page out", () => {
    openMenu("sl", "Več informacij");

    const items = screen.getAllByRole("menuitem");
    expect(items.some((item) => item.getAttribute("href") === "/viri")).toBe(
      false,
    );
  });
});

describe("the header's inline nav", () => {
  // The row is the pages a visitor can go to, and nothing else. Both of these
  // are destinations of their own that the header is the shortest way to from
  // anywhere in the grid.
  it("says the destinations the header is the shortest way to", () => {
    render(
      <I18nProvider locale="sl">
        <SiteNav />
      </I18nProvider>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Zavetišča",
      "Najdena žival",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/zavetisca",
      "/najdena-zival",
    ]);
  });

  it("keeps the login out of the row of destinations", () => {
    render(
      <I18nProvider locale="sl">
        <SiteNav />
      </I18nProvider>,
    );

    expect(
      screen
        .getAllByRole("link")
        .some((link) => link.getAttribute("href") === "/portal/prijava"),
    ).toBe(false);
  });
});

describe("the shelter login", () => {
  // The full phrase, not "Prijava" on its own: this site has no visitor
  // accounts, so a bare login in the corner is a question put to the wrong
  // person.
  it("names itself in full", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterLogin />
      </I18nProvider>,
    );

    const link = screen.getByRole("link", { name: "Prijava za zavetišča" });
    expect(link.getAttribute("href")).toBe("/portal/prijava");
    expect(link.textContent).toBe("Prijava za zavetišča");
  });

  it("sends the English visitor to the same Slovenian portal", () => {
    render(
      <I18nProvider locale="en">
        <ShelterLogin />
      </I18nProvider>,
    );

    const link = screen.getByRole("link", { name: "Login for shelters" });
    expect(link.getAttribute("href")).toBe("/portal/prijava");
    expect(link.textContent).toBe("Login for shelters");
  });
});
