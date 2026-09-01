// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChoiceGrid } from "@/components/portal/choice-grid";
import {
  ENERGY_META,
  SPECIAL_NEEDS_META,
  PORTAL_SPECIAL_NEEDS_ANSWERS,
} from "@/components/portal/portal-fields";
import { PORTAL_ENERGIES } from "@/lib/portal-api";

afterEach(cleanup);

function renderGrid(value: "calm" | "balanced" | "lively" | null = null) {
  const onPick = vi.fn();
  render(
    <ChoiceGrid
      label="Energija"
      options={PORTAL_ENERGIES}
      meta={ENERGY_META}
      value={value}
      onPick={onPick}
      disabled={false}
      describedBy="energy-hint"
    />,
  );
  return { onPick };
}

function card(name: string): HTMLElement {
  return screen.getByRole("radio", { name });
}

describe("a card whose label is longer than its third of the row", () => {
  // jsdom lays nothing out, so the label cannot be measured here. What can be
  // held is the shape that made it clip: a fixed height with the label cut off
  // beside the icon left "Uravnotežen" as a few letters at 390px.
  it("lets the label wrap instead of cutting it", () => {
    renderGrid();

    const balanced = card(ENERGY_META.balanced.label);
    const label = balanced.querySelector("span");

    expect(label?.textContent).toBe(ENERGY_META.balanced.label);
    expect(balanced.className).toContain("min-h-11");
    // Stacked on a phone, back beside the icon once the row has room.
    expect(balanced.className).toContain("flex-col");
    expect(balanced.className).toContain("sm:flex-row");
    // The card is a ToggleGroup item, and toggleVariants would otherwise hold
    // the label on one line at a fixed 36px.
    expect(balanced.className).toContain("whitespace-normal");
    expect(balanced.className).not.toContain("whitespace-nowrap");
    expect(balanced.className).toContain("h-auto");
    expect(balanced.className).not.toContain("h-9");
  });
});

describe("ChoiceGrid wiring", () => {
  it("hands the group's description to the whole row", () => {
    renderGrid();

    expect(
      screen
        .getByRole("radiogroup", { name: "Energija" })
        .getAttribute("aria-describedby"),
    ).toBe("energy-hint");
  });

  it("gives the row one answer at a time, with the chosen card checked", () => {
    renderGrid("calm");

    expect(card(ENERGY_META.calm.label).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(card(ENERGY_META.lively.label).getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("reports the card that was tapped", () => {
    const { onPick } = renderGrid();

    fireEvent.click(card(ENERGY_META.lively.label));

    expect(onPick).toHaveBeenCalledWith("lively");
  });

  // The whole point of the single-select group: on an animal with nothing
  // saved there is no override to revert, so tapping the chosen card off is
  // the only way back out of a mis-tap.
  it("takes the answer back when the chosen card is tapped again", () => {
    const { onPick } = renderGrid("calm");

    fireEvent.click(card(ENERGY_META.calm.label));

    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("lays a two-answer row out in two columns", () => {
    render(
      <ChoiceGrid
        label="Posebne potrebe"
        options={PORTAL_SPECIAL_NEEDS_ANSWERS}
        meta={SPECIAL_NEEDS_META}
        value={null}
        onPick={vi.fn()}
        disabled={false}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Posebne potrebe" });
    expect(group.className).toContain("grid-cols-2");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
