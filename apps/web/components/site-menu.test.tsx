// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteMenu, SiteNav } from "./site-menu";
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
  it("carries the footer's links, in the footer's order", () => {
    openMenu("sl", "Več informacij");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Zavetišča",
      "Najdena žival",
      "Strokovno preverjeni viri",
      "Za zavetišča",
    ]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/zavetisca",
      "/najdena-zival",
      "/viri",
      "/portal/prijava",
    ]);
  });

  it("routes the English visitor to the English pages", () => {
    openMenu("en", "More information");

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/en/shelters",
      "/en/found-animal",
      "/en/resources",
      "/portal/prijava",
    ]);
  });
});

describe("the header's inline nav", () => {
  it("shows the public links, worded short, and keeps the portal out", () => {
    render(
      <I18nProvider locale="sl">
        <SiteNav />
      </I18nProvider>,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Zavetišča",
      "Najdena žival",
      "Viri",
    ]);
    expect(
      links.some((link) => link.getAttribute("href") === "/portal/prijava"),
    ).toBe(false);
  });
});
