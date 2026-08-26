// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BackLink } from "@/components/back-link";
import { I18nProvider } from "@/components/i18n-provider";

afterEach(() => {
  cleanup();
  setReferrer("");
});

// jsdom fixes document.referrer at construction, so each case installs its
// own. Configurable, or the second test in a file could not have a different
// one from the first.
function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", {
    value,
    configurable: true,
  });
}

function renderBack() {
  return render(
    <I18nProvider locale="sl">
      <BackLink href="/zavetisca" label="Zavetišča" />
    </I18nProvider>,
  );
}

function link() {
  return screen.getByRole("link");
}

describe("back link", () => {
  it("names the shelters index when there is no referrer at all", async () => {
    setReferrer("");
    renderBack();

    // The cold-load shape is also what the server renders, so it has to be
    // right on the first paint and stay right.
    expect(link().getAttribute("href")).toBe("/zavetisca");
    expect(link().textContent).toContain("Zavetišča");
  });

  it("returns to the grid, filters and all, when that is where it came from", async () => {
    setReferrer(`${window.location.origin}/?vrsta=pes&velikost=srednja`);
    renderBack();

    await waitFor(() =>
      expect(link().getAttribute("href")).toBe("/?vrsta=pes&velikost=srednja"),
    );
    expect(link().textContent).toContain("Nazaj na živali");
  });

  it("knows the English grid too", async () => {
    setReferrer(`${window.location.origin}/en?vrsta=pes`);
    renderBack();

    await waitFor(() =>
      expect(link().getAttribute("href")).toBe("/en?vrsta=pes"),
    );
  });

  it("ignores another site, which cannot be a way back into this one", async () => {
    setReferrer("https://www.google.com/search?q=posvojitev");
    renderBack();

    // Waited on rather than asserted immediately: the upgrade runs in an
    // effect, so an assertion on the first paint would pass either way.
    await waitFor(() => expect(link()).toBeTruthy());
    expect(link().getAttribute("href")).toBe("/zavetisca");
  });

  it("ignores a sideways step from another page of this site", async () => {
    // An animal's own page is not the list this shelter was opened from, and
    // offering it as "back to the animals" would be the same lie in reverse.
    setReferrer(`${window.location.origin}/zival/mila-3fb13e/koper/obalno`);
    renderBack();

    await waitFor(() => expect(link()).toBeTruthy());
    expect(link().getAttribute("href")).toBe("/zavetisca");
  });
});
