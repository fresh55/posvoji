// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { telHref } from "@/lib/contact-links";
import { getMessages } from "@/lib/i18n";
import type { LookupCoverage } from "@/lib/municipality-coverage";
import { CoverageCard } from "./municipality-coverage-card";

afterEach(cleanup);

// Shaped on Koper, which is the register's fullest entry: both numbers, the
// hours, an address and a site.
const OBALNO: LookupCoverage = {
  shelterId: "obalno",
  shelterName: "Zavetišče Obala",
  city: "Koper",
  phone: "05 663 37 66",
  onCallPhone: "031 726 029",
  hours: "Pon, sre 12.00–16.00",
  email: "zavetisce@example.si",
  website: "https://example.si/",
  detailHref: "/zavetisca/obalno",
  animals: 3,
  sourceLabel: "Test",
  sourceDate: "2026-01-01",
  confirmed: true,
};

const messages = getMessages("sl");

function renderCard(coverage: LookupCoverage = OBALNO) {
  render(
    <I18nProvider locale="sl">
      <CoverageCard coverage={coverage} />
    </I18nProvider>,
  );
}

describe("the municipality coverage card", () => {
  it("draws the dežurna number as the second call, not as a line of detail", () => {
    renderCard();

    const call = screen.getByRole("link", { name: "Pokliči 05 663 37 66" });
    const onCall = screen.getByRole("link", { name: "Dežurna 031 726 029" });
    expect(call.getAttribute("href")).toBe(telHref("05 663 37 66"));
    expect(onCall.getAttribute("href")).toBe(telHref("031 726 029"));

    // Both are buttons and the second is the quieter one: the same act at a
    // different hour, and not the number to try first.
    expect(call.getAttribute("data-slot")).toBe("button");
    expect(onCall.getAttribute("data-slot")).toBe("button");
    expect(call.getAttribute("data-variant")).toBe("default");
    expect(onCall.getAttribute("data-variant")).toBe("outline");
    expect(
      call.compareDocumentPosition(onCall) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Once on the card, and only in the button. It used to be printed here
    // and again as a contact row under the hours.
    expect(document.body.textContent?.match(/031 726 029/g)).toHaveLength(1);

    // The hours stay: they say whether the first number will be picked up.
    expect(screen.getByText("Pon, sre 12.00–16.00")).toBeTruthy();

    // Both names above are the visible text, and neither button carries an
    // aria-label. muniCall and muniCallOnCall begin with the act, so the
    // channel the email and the site rows have to add is already said here;
    // a label would only be a second way to say "Pokliči".
    expect(call.hasAttribute("aria-label")).toBe(false);
    expect(onCall.hasAttribute("aria-label")).toBe(false);
  });

  it("draws one call for a shelter the register holds one number for", () => {
    renderCard({ ...OBALNO, onCallPhone: undefined });

    expect(screen.getByRole("link", { name: "Pokliči 05 663 37 66" })).toBeTruthy();
    expect(screen.queryByText(/Dežurna/)).toBeNull();
  });

  it("falls back to the dežurna number when it is the only one", () => {
    renderCard({ ...OBALNO, phone: undefined });

    const onCall = screen.getByRole("link", { name: "Dežurna 031 726 029" });
    expect(onCall.getAttribute("href")).toBe(telHref("031 726 029"));
    expect(screen.queryByText(/^Pokliči /)).toBeNull();
  });

  // The contact links on this card are read by somebody standing over a found
  // animal, which is the highest-stakes surface the site has, so they are
  // named the way the register card and the shelter page name theirs.
  it("names the email by channel, as the other two surfaces do", () => {
    renderCard();

    const email = screen.getByRole("link", {
      name: `${messages.contactEmail}: zavetisce@example.si`,
    });
    expect(email.getAttribute("href")).toBe("mailto:zavetisce@example.si");
    // Both rows truncate, so the value a long address loses to an ellipsis is
    // reachable by a mouse as well as by a screen reader.
    expect(email.getAttribute("title")).toBe("zavetisce@example.si");
  });

  it("says the site opens in a new window, to everyone", () => {
    renderCard();

    // The host is the part of the URL worth hearing, and target="_blank"
    // announces nothing on its own.
    const site = screen.getByRole("link", {
      name: `${messages.contactWebsite}: example.si ${messages.newWindow}`,
    });
    expect(site.getAttribute("href")).toBe("https://example.si/");
    expect(site.getAttribute("target")).toBe("_blank");
    expect(site.getAttribute("rel")).toBe("noreferrer");
    expect(site.getAttribute("title")).toBe("example.si");
    // And a mark a thumb can see: this card is read on a phone, where the
    // title above is a hover that never happens.
    expect(site.querySelector("[data-external]")).not.toBeNull();
    // The visible text stays the host alone, so the name contains the label
    // rather than replacing it (WCAG 2.5.3).
    expect(site.textContent).toBe("example.si");
  });

  it("says the source link opens in a new window", () => {
    renderCard({ ...OBALNO, sourceUrl: "https://example.si/odlok" });

    const source = screen.getByRole("link", {
      name: `Test ${messages.newWindow}`,
    });
    expect(source.getAttribute("href")).toBe("https://example.si/odlok");
    expect(source.getAttribute("target")).toBe("_blank");
  });
});
