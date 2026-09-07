// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "./language-switcher";
import { I18nProvider } from "@/components/i18n-provider";

// jsdom does not navigate, and following the link is not what is under test:
// what the press leaves on the href is. Cancelled in the capture phase, which
// runs ahead of React's own handler, so the click still reaches the component.
function swallowNavigation(event: Event) {
  event.preventDefault();
}

function renderSwitcher() {
  document.addEventListener("click", swallowNavigation, true);
  return render(
    <I18nProvider locale="sl">
      <LanguageSwitcher />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.removeEventListener("click", swallowNavigation, true);
  window.history.replaceState(null, "", "/");
});

describe("the language switcher", () => {
  it("carries the current filters onto the other language", () => {
    window.history.replaceState(null, "", "/?vrsta=pes");
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);

    expect(english.getAttribute("href")).toBe("/en?vrsta=pes");
  });

  it("leaves the plain path alone where there is no query to carry", () => {
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english);

    expect(english.getAttribute("href")).toBe("/en");
  });

  it("states the query once when the same link is pressed twice", () => {
    // A held modifier opens the destination in a new tab and leaves this page
    // mounted, so the link the first press rewrote is still on screen for the
    // second one. Appending to its own href, that press wrote
    // /en?vrsta=pes?vrsta=macka: two query strings, and the filter the visitor
    // was actually looking at lost to the one from the press before it.
    window.history.replaceState(null, "", "/?vrsta=pes");
    renderSwitcher();

    const english = screen.getByRole("link", { name: "English" });
    fireEvent.click(english, { ctrlKey: true });
    expect(english.getAttribute("href")).toBe("/en?vrsta=pes");

    window.history.replaceState(null, "", "/?vrsta=macka");
    fireEvent.click(english, { ctrlKey: true });
    expect(english.getAttribute("href")).toBe("/en?vrsta=macka");
  });

  it("keeps a page's own translated path as the base", () => {
    // A shelter's page hands the switcher the two paths that are the same
    // page in each language, and the query still rides on top of them.
    window.history.replaceState(null, "", "/zavetisce/muri?vrsta=pes");
    document.addEventListener("click", swallowNavigation, true);
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
  });
});
