// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { pointerOff, pointerOnto } from "@/test/pointer";
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
  longCoat = false,
}: {
  layout: FilterCardLayout;
  species?: SpeciesFilter;
  selected?: string[];
  longCoat?: boolean;
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
        longCoat={longCoat}
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

  it("gives the dog a nose and the cat none", () => {
    // A round head with floppy ears printed as a helmet until it had a nose;
    // the cat's pointed ears make a face without one.
    renderColours({ layout, species: "dog", selected: ["black"] });
    expect(swatchOf("Črna").querySelector("[data-nose]")).not.toBeNull();
    cleanup();

    renderColours({ layout, species: "cat", selected: ["black"] });
    expect(swatchOf("Črna").querySelector("[data-nose]")).toBeNull();
  });

  it("grows a long coat on a picked colour only while Dolga is picked", () => {
    renderColours({ layout, species: "dog", selected: ["black"], longCoat: true });
    const ears = () => swatchOf("Črna").querySelector("[data-ears]");
    expect(ears()?.hasAttribute("data-long-coat")).toBe(true);
    cleanup();

    renderColours({ layout, species: "dog", selected: ["black"] });
    expect(ears()?.hasAttribute("data-long-coat")).toBe(false);
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

  it("keeps the ear tips down after a press until the pointer leaves", async () => {
    // Unpicking a colour with the mouse still on it dropped the ears only as
    // far as the hover's peek, which read as a pick that had not come off.
    renderColours({ layout });

    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");

    fireEvent.click(button("Rjava"));
    // The ears tuck away before they leave the document.
    await waitFor(() => expect(earsOf("Rjava")).toBeNull());

    pointerOff(button("Rjava"));
    pointerOnto(button("Rjava"), "mouse");
    expect(earsOf("Rjava")).toBe("cat");
  });
});

describe("the colour filter in the list", () => {
  it("takes the species tab and the long coat from the filters", () => {
    const listCounts = facetCounts([], EMPTY_FILTERS, new Date("2026-09-23"));
    listCounts.coatColor.set("black", 2);
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          layout="sheet"
          filters={{
            ...EMPTY_FILTERS,
            species: "dog",
            coatColor: ["black"],
            coatLength: ["long"],
          }}
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
    expect(
      swatchOf("Črna").querySelector("[data-ears]")?.hasAttribute("data-long-coat"),
    ).toBe(true);
  });
});
