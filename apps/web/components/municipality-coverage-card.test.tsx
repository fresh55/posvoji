// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { telHref } from "@/lib/contact-links";
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
});
