// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import { ENERGY_META } from "@/components/portal/portal-fields";
import { PORTAL_ENERGIES } from "@/lib/portal-api";

afterEach(cleanup);

function renderGrid() {
  render(
    <ChoiceGrid
      label="Energija"
      options={PORTAL_ENERGIES}
      meta={ENERGY_META}
      value={null}
      onPick={vi.fn()}
      disabled={false}
      describedBy="energy-hint"
    />,
  );
}

describe("a card whose label is longer than its third of the row", () => {
  // jsdom lays nothing out, so the label cannot be measured here. What can be
  // held is the shape that made it clip: a fixed height with the label cut off
  // beside the icon left "Uravnotežen" as a few letters at 390px.
  it("lets the label wrap instead of cutting it", () => {
    renderGrid();

    const card = screen.getByRole("button", {
      name: ENERGY_META.balanced.label,
    });
    const label = card.querySelector("span");

    expect(label?.textContent).toBe(ENERGY_META.balanced.label);
    expect(card.className).toContain("min-h-11");
    // Stacked on a phone, back beside the icon once the row has room.
    expect(card.className).toContain("flex-col");
    expect(card.className).toContain("sm:flex-row");
  });
});

describe("ChoiceGrid wiring", () => {
  it("hands the group's description to the whole row", () => {
    renderGrid();

    expect(
      screen
        .getByRole("group", { name: "Energija" })
        .getAttribute("aria-describedby"),
    ).toBe("energy-hint");
  });
});
