// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "./language-switcher";
import { I18nProvider } from "@/components/i18n-provider";
import { commitSearch } from "@/lib/location-search";

// jsdom cannot navigate. Inspect the destination without following the link.
function swallowNavigation(event: Event) {
  event.preventDefault();
}

beforeEach(() => {
  document.addEventListener("click", swallowNavigation, true);
  document.addEventListener("auxclick", swallowNavigation, true);
});

function renderSwitcher() {
  return render(
    <I18nProvider locale="sl">
      <LanguageSwitcher />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.removeEventListener("click", swallowNavigation, true);
  document.removeEventListener("auxclick", swallowNavigation, true);
  window.history.replaceState(null, "", "/");
});

describe("the language switcher", () => {
  it("carries the current filters onto the other language", () => {
    window.history.replaceState(null, "", "/?vrsta=pes");
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    expect(english.getAttribute("href")).toBe("/en?vrsta=pes");
    fireEvent.click(english);

    expect(english.getAttribute("href")).toBe("/en?vrsta=pes");
  });

  it("leaves the plain path alone where there is no query to carry", () => {
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);

    expect(english.getAttribute("href")).toBe("/en");
  });

  it("updates the resting destination after filters change without another click", () => {
    window.history.replaceState(null, "", "/?vrsta=pes");
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english, { ctrlKey: true });
    expect(english.getAttribute("href")).toBe("/en?vrsta=pes");

    act(() => commitSearch("vrsta=macka", "replace"));
    expect(english.getAttribute("href")).toBe("/en?vrsta=macka");

    fireEvent.contextMenu(english);
    fireEvent(english, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    expect(english.getAttribute("href")).toBe("/en?vrsta=macka");

    act(() => commitSearch("", "replace"));
    expect(english.getAttribute("href")).toBe("/en");
  });

  it("updates the destination on browser history navigation", () => {
    renderSwitcher();
    act(() => {
      window.history.replaceState(null, "", "/?vrsta=pes&energija=miren");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href"))
      .toBe("/en?vrsta=pes&energija=miren");
  });

  it("keeps a page's own translated path as the base", () => {
    // A shelter's page hands the switcher the two paths that are the same
    // page in each language, and the query still rides on top of them.
    window.history.replaceState(null, "", "/zavetisce/muri?vrsta=pes");
    render(
      <I18nProvider locale="sl">
        <LanguageSwitcher
          paths={{ sl: "/zavetisce/muri", en: "/en/zavetisce/muri" }}
        />
      </I18nProvider>,
    );

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);

    expect(english.getAttribute("href")).toBe("/en/zavetisce/muri?vrsta=pes");
  });

  it("leaves a phone the other language and nothing else", () => {
    // Both halves came to 96x48 in a 390px header, against a 119x40 brand.
    // The language the reader is already on is the press that does nothing,
    // so below lg it is the one that goes. Read off the class and not the
    // layout: this is a media query, and jsdom does not run one, so both
    // anchors are here either way. aria-current stays on the current one for
    // anything reading the markup, though not for a screen reader below lg,
    // which honours display:none the same as the eye does; what says which
    // language the page is in there is lang on the document.
    renderSwitcher();

    const slovenian = screen.getByRole("link", { name: "Slovenščina" });
    const english = screen.getByRole("link", { name: "English" });

    expect(slovenian.getAttribute("aria-current")).toBe("page");
    expect(slovenian.className.split(" ")).toContain("max-lg:hidden");
    expect(english.className.split(" ")).not.toContain("max-lg:hidden");
  });

  // Grown rather than overlaid, because the halves sit 2px apart; and gated on
  // the pointer, because a 1180px tablet drew them 24px tall while a 1024px
  // mouse window got the 44.
  it("grows both halves to 44px on a coarse pointer", () => {
    renderSwitcher();

    for (const name of ["Slovenščina", "English"]) {
      const half = screen.getByRole("link", { name }).closest("a");
      expect(half?.className.split(" ")).toEqual(
        expect.arrayContaining([
          "pointer-coarse:min-h-11",
          "pointer-coarse:min-w-11",
        ]),
      );
    }
  });

  it("keeps the well and the raised half off the phone", () => {
    // The one that survives below lg is a ghost button on the header's own
    // background, so nothing here may paint at a width where the well that
    // the paint belongs to is not drawn.
    renderSwitcher();

    const well = screen.getByRole("navigation");
    const slovenian = screen.getByRole("link", { name: "Slovenščina" });

    expect(well.className.split(" ")).not.toContain("bg-muted");
    expect(well.className.split(" ")).toContain("lg:bg-muted");
    expect(slovenian.className.split(" ")).not.toContain("bg-background");
    expect(slovenian.className.split(" ")).toContain("lg:bg-background");
    expect(slovenian.className.split(" ")).not.toContain("border-control-border");
    expect(slovenian.className.split(" ")).toContain(
      "lg:border-control-border",
    );
  });

  it("frames the chosen half rather than relying on its plate", () => {
    // The plate measured 1.09:1 against the well it stands in, and in dark it
    // is darker than the well at 1.30:1 with a 2.48:1 ink step, so which
    // language the page is in was the one control state on the page that
    // nothing reached 3:1 with. The frame carries it now, and only the chosen
    // half wears it.
    renderSwitcher();

    expect(
      screen.getByRole("link", { name: "Slovenščina" }).className.split(" "),
    ).toContain("lg:border-control-border");
    expect(
      screen.getByRole("link", { name: "English" }).className.split(" "),
    ).not.toContain("lg:border-control-border");
  });
});
