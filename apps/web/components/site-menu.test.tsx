// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
    openMenu("sl", "Meni");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Zavetišča",
      "Najdena žival",
      "O nas",
      "Prijava za zavetišča",
    ]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/zavetisca",
      "/najdena-zival",
      "/o-nas",
      "/portal/prijava",
    ]);
  });

  it("routes the English visitor to the English pages", () => {
    openMenu("en", "Menu");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/en/shelters",
      "/en/found-animal",
      "/en/about",
      "/portal/prijava",
    ]);
  });

  // The page still builds and still answers on /viri and /en/resources; it is
  // only unlisted, in lib/site-links.ts, and the dropdown is the surface that
  // used to show every link there was.
  it("leaves the hidden resources page out", () => {
    openMenu("sl", "Meni");

    const items = screen.getAllByRole("menuitem");
    expect(items.some((item) => item.getAttribute("href") === "/viri")).toBe(
      false,
    );
  });
});

describe("the header's inline nav", () => {
  // The row is the pages a visitor can go to, and nothing else. Each of these
  // is a destination of its own that the header is the shortest way to from
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
      "O nas",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/zavetisca",
      "/najdena-zival",
      "/o-nas",
    ]);
  });

  it("routes the English visitor to the English pages", () => {
    render(
      <I18nProvider locale="en">
        <SiteNav />
      </I18nProvider>,
    );

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/en/shelters", "/en/found-animal", "/en/about"]);
  });

  // Sized on what the device has and not on how wide it is. The row only
  // renders from lg, so a 1180px tablet was the one place it could be pressed
  // and it drew 20px there; the overlay is the utility in globals.css.
  it("gives each link a finger's box on a coarse pointer", () => {
    render(
      <I18nProvider locale="sl">
        <SiteNav />
      </I18nProvider>,
    );

    for (const link of screen.getAllByRole("link")) {
      expect(link.className.split(" ")).toContain("pointer-coarse:tap-target");
    }
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

// Which of the two shapes draws is a container query on the header row, and
// jsdom has neither container queries nor layout, so what is pinned here is
// that the two conditions stay each other's opposite. Both drawing is two
// navs on one row; neither drawing is a header with no way out of the page.
// The behaviour itself is measured on the built page.
describe("the inline row and the menu button", () => {
  const ROOM = "lg:@nav-room/header:";

  it("says the links only where the header row has the room for them", () => {
    render(
      <I18nProvider locale="sl">
        <SiteNav />
      </I18nProvider>,
    );

    const nav = screen.getByRole("navigation");
    expect(nav.className.split(" ")).toContain("hidden");
    expect(nav.className.split(" ")).toContain(`${ROOM}flex`);
  });

  it("brings the menu button in on the same condition, negated", () => {
    render(
      <I18nProvider locale="sl">
        <SiteMenu />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Meni" });
    expect(trigger.className.split(" ")).toContain(`${ROOM}hidden`);
    // The press is 44px on a 36px button, and the button now draws at widths
    // where it never used to.
    expect(trigger.className.split(" ")).toContain("tap-target");
  });

  // Below lg this menu is the only door to the portal, so it carries the
  // login. From lg the corner draws it as a button of its own, and this menu
  // can open at that width now, where the row folded for room.
  it("leaves the login out of the menu where the header draws it", () => {
    const menu = openMenu("sl", "Meni");
    const login = within(menu).getByRole("menuitem", {
      name: "Prijava za zavetišča",
    });

    expect(login.className.split(" ")).toContain("lg:hidden");
    expect(
      menu.querySelector('[data-slot="dropdown-menu-separator"]')?.className,
    ).toContain("lg:hidden");
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

  // 32px at size sm, which is a mouse's button, and on a touch tablet this is
  // the only door to the portal on the page.
  it("stands 44px tall on a coarse pointer", () => {
    render(
      <I18nProvider locale="sl">
        <ShelterLogin />
      </I18nProvider>,
    );

    const link = screen.getByRole("link", { name: "Prijava za zavetišča" });
    expect(link.className.split(" ")).toContain("pointer-coarse:h-11");
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
