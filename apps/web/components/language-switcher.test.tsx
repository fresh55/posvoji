// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function setPath(path: string) {
  window.history.replaceState(null, "", path);
}

function renderSwitcher(
  locale: Locale = "sl",
  paths?: Partial<Record<Locale, string>>,
) {
  return render(
    <I18nProvider locale={locale}>
      <LanguageSwitcher paths={paths} />
    </I18nProvider>,
  );
}

function targetLink(name: "Slovenščina" | "English") {
  return screen.getByRole("link", { name });
}

describe("LanguageSwitcher, without an explicit paths prop", () => {
  it("goes to the plain index before any click, same as always", () => {
    setPath("/zival/mila-3fb13e/koper/obalno");
    renderSwitcher("sl");

    expect(targetLink("English").getAttribute("href")).toBe("/en");
  });

  it("translates an open animal's own path to the other language on click", () => {
    setPath("/zival/mila-3fb13e/koper/obalno");
    renderSwitcher("sl");

    fireEvent.click(targetLink("English"));

    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/animal/mila-3fb13e/koper/obalno",
    );
  });

  it("translates back from English to Slovenian", () => {
    setPath("/en/animal/mila-3fb13e/koper/obalno");
    renderSwitcher("en");

    fireEvent.click(targetLink("Slovenščina"));

    expect(targetLink("Slovenščina").getAttribute("href")).toBe(
      "/zival/mila-3fb13e/koper/obalno",
    );
  });

  it("translates a shelter page", () => {
    setPath("/zavetisca/macja-hisa");
    renderSwitcher("sl");

    fireEvent.click(targetLink("English"));

    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/shelters/macja-hisa",
    );
  });

  it("translates the found-animal and resources pages", () => {
    setPath("/najdena-zival");
    renderSwitcher("sl");
    fireEvent.click(targetLink("English"));
    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/found-animal",
    );

    cleanup();
    setPath("/viri");
    renderSwitcher("sl");
    fireEvent.click(targetLink("English"));
    expect(targetLink("English").getAttribute("href")).toBe("/en/resources");
  });

  it("keeps the query string alongside the translated path", () => {
    setPath("/zival/mila-3fb13e/koper/obalno?vrsta=pes");
    renderSwitcher("sl");

    fireEvent.click(targetLink("English"));

    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/animal/mila-3fb13e/koper/obalno?vrsta=pes",
    );
  });

  it("falls back to the plain index for a path with no paired route, such as the portal", () => {
    setPath("/portal");
    renderSwitcher("sl");

    fireEvent.click(targetLink("English"));

    expect(targetLink("English").getAttribute("href")).toBe("/en");
  });

  it("goes straight home from the index itself", () => {
    setPath("/");
    renderSwitcher("sl");
    fireEvent.click(targetLink("English"));
    expect(targetLink("English").getAttribute("href")).toBe("/en");

    cleanup();
    setPath("/en");
    renderSwitcher("en");
    fireEvent.click(targetLink("Slovenščina"));
    expect(targetLink("Slovenščina").getAttribute("href")).toBe("/");
  });
});

describe("LanguageSwitcher, with an explicit paths prop", () => {
  it("wins over the current path, even when they disagree", () => {
    setPath("/zival/mila-3fb13e/koper/obalno");
    renderSwitcher("sl", {
      sl: "/zival/rex-abc123/celje/mackov-dom",
      en: "/en/animal/rex-abc123/celje/mackov-dom",
    });

    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/animal/rex-abc123/celje/mackov-dom",
    );
    fireEvent.click(targetLink("English"));
    expect(targetLink("English").getAttribute("href")).toBe(
      "/en/animal/rex-abc123/celje/mackov-dom",
    );
  });
});
