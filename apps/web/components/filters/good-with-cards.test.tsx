// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, goodWithOptions, type GoodWithKey } from "@/lib/filters";
import { FilterGroupList } from "./filter-groups";
import { GoodWithCards } from "./good-with-cards";

afterEach(() => cleanup());

const options = goodWithOptions("sl");
const counts = new Map(options.map(({ key }) => [key, 2]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: GoodWithKey[];
    onToggle?: (key: GoodWithKey) => void;
    onToggleMany?: (keys: GoodWithKey[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  render(
    <I18nProvider locale="sl">
      <GoodWithCards
        options={options}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleMany };
}

describe("GoodWithCards", () => {
  it("names the section and says where the answers come from", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Družba" })).toBeTruthy();
    expect(
      screen.getByText(
        "Po presoji zavetišča. Živali brez podatka ta filter skrije.",
      ),
    ).toBeTruthy();
  });

  it("renders one card per facet with its label, count and aria-label", () => {
    renderCards();

    for (const { key, label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.textContent).toContain(label);
      expect(button.textContent).toContain(String(counts.get(key)));
    }
  });

  it("reflects selection through aria-pressed", () => {
    renderCards({ selected: ["dogs"] });

    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("calls onToggle with the facet key", () => {
    const { onToggle } = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("kids");
  });

  it("locks out a facet no animal can answer, but never an active one", () => {
    renderCards({
      counts: new Map([
        ["kids", 0],
        ["dogs", 0],
        ["cats", 2],
      ]),
      selected: ["dogs"],
    });

    const button = (label: string) =>
      screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      }) as HTMLButtonElement;
    expect(button(options[0].label).disabled).toBe(true);
    expect(button(options[1].label).disabled).toBe(false);
    expect(button(options[2].label).disabled).toBe(false);
  });

  it("clears the whole section from its reset", () => {
    const { onToggleMany } = renderCards({ selected: ["kids", "cats"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter družbe" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["kids", "cats"]);
  });
});

describe("FilterGroupList", () => {
  function renderList(goodWith?: Parameters<typeof FilterGroupList>[0]["goodWith"]) {
    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: new Map(),
            energy: new Map(),
            shelter: new Map(),
          }}
          toggles={[]}
          toggleTally={new Map()}
          goodWith={goodWith}
          onToggle={() => undefined}
          onToggleMany={() => undefined}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
        />
      </I18nProvider>,
    );
  }

  it("leaves the section out while no facet has data", () => {
    renderList(undefined);
    expect(screen.queryByRole("heading", { name: "Družba" })).toBeNull();
  });

  it("shows only the facets that can narrow anything", () => {
    renderList({
      options: options.filter(({ key }) => key === "kids"),
      counts: new Map([["kids", 4]]),
      onToggle: () => undefined,
      onToggleMany: () => undefined,
    });

    expect(screen.getByRole("heading", { name: "Družba" })).toBeTruthy();
    expect(
      screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed")),
    ).toHaveLength(1);
  });
});
