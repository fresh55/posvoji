// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  EMPTY_FILTERS,
  facetCounts,
  groupOptions,
  type SpeciesFilter,
} from "@/lib/filters";
import {
  installFilterFoldSeams,
  openFilterSection,
} from "@/test/filter-folds";
import { pointer } from "@/test/pointer";
import { CoatColorCards } from "./coat-cards";
import type { FilterCardLayout } from "./filter-card";
import { FilterGroupList } from "./filter-groups";

installFilterFoldSeams();

const options = groupOptions("coatColor", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 2]));

function renderColours({
  layout,
  species = "all",
  selected = [],
}: {
  layout: FilterCardLayout;
  species?: SpeciesFilter;
  selected?: string[];
}) {
  render(
    <I18nProvider locale="sl">
      <CoatColorCards
        options={options}
        counts={counts}
        selected={selected}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        layout={layout}
        species={species}
      />
    </I18nProvider>,
  );
}

const button = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label},`) });

const swatchOf = (label: string) =>
  button(label).querySelector("svg[data-swatch]") as SVGSVGElement;

const earsOf = (label: string) =>
  swatchOf(label).querySelector("[data-ears]")?.getAttribute("data-ears") ??
  null;

// React makes its pointerenter out of pointerover.
const pointerOnto = (element: HTMLElement, pointerType: "mouse" | "touch") =>
  pointer(element, "pointerover", { x: 0, y: 0, pointerType });

describe.each(["sidebar", "sheet"] as const)("colour swatches in the %s", (layout) => {
  it.each([
    ["all", "cat"],
    ["cat", "cat"],
    ["dog", "dog"],
    // Ostale's ears are a rabbit's, keyed by the tab like its glyph.
    ["other", "other"],
  ] as const)("a colour picked on the %s tab grows the %s ears", (species, ears) => {
    renderColours({ layout, species, selected: ["black"] });

    expect(earsOf("Črna")).toBe(ears);
  });

  it("draws a colour nobody has picked as a plain disc", () => {
    renderColours({ layout, selected: ["black"] });

    expect(earsOf("Rjava")).toBeNull();
    // Everything it draws shares the disc's radius. The sheet's tile used to
    // rest as a small dot inside a ring of its own, which is how a selected
    // radio button looks, on every tile nobody had picked.
    const radii = new Set(
      [...swatchOf("Rjava").querySelectorAll("circle")].map((circle) =>
        circle.getAttribute("r"),
      ),
    );
    expect([...radii]).toEqual(["9.5"]);
  });

  it("shows the tips of the ears to a mouse and not to a finger", () => {
    renderColours({ layout });

    pointerOnto(button("Rjava"), "touch");
    expect(earsOf("Rjava")).toBeNull();

    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");
  });
});

describe("the colour filter in the list", () => {
  it("takes the species tab from the filters", () => {
    const listCounts = facetCounts([], EMPTY_FILTERS, new Date("2026-09-23"));
    listCounts.coatColor.set("black", 2);
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          layout="sheet"
          filters={{ ...EMPTY_FILTERS, species: "dog", coatColor: ["black"] }}
          groups={[{ group: "coatColor", options }]}
          counts={listCounts}
          toggles={[]}
          toggleTally={new Map()}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          onToggleProperty={vi.fn()}
          onToggleManyProperties={vi.fn()}
        />
      </I18nProvider>,
    );
    openFilterSection("Videz");

    expect(earsOf("Črna")).toBe("dog");
  });
});
