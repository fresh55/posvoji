// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnergyLevel } from "@posvoji/schema";
import { I18nProvider } from "@/components/i18n-provider";
import { groupOptions } from "@/lib/filters";
import { EnergyCards } from "./energy-cards";
import { FilterGroupList, type CardGroup } from "./filter-groups";

afterEach(() => cleanup());

const options = groupOptions("energy", [], "sl");
const counts = new Map(options.map(({ value }) => [value, 3]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: string[];
    onToggle?: (value: string) => void;
    onToggleMany?: (values: string[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  render(
    <I18nProvider locale="sl">
      <EnergyCards
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

describe("EnergyCards", () => {
  it("names the section and says where the answers come from", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Energija" })).toBeTruthy();
    expect(
      screen.getByText(
        "Po presoji zavetišča. Živali brez podatka ta filter skrije.",
      ),
    ).toBeTruthy();
  });

  it("renders one card per level with its label, count and aria-label", () => {
    renderCards();

    for (const { value, label } of options) {
      const button = screen.getByRole("button", {
        name: new RegExp(`^${label}, `),
      });
      expect(button.textContent).toContain(label);
      expect(button.textContent).toContain(String(counts.get(value)));
    }
  });

  it("reflects selection through aria-pressed", () => {
    renderCards({ selected: ["balanced"] });

    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("calls onToggle with the level's value", () => {
    const { onToggle } = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[2].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("lively");
  });

  it("calls onToggle again on a checked card, to deselect it", () => {
    const { onToggle } = renderCards({ selected: ["calm"] });

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("calm");
  });

  it("locks out a level no animal has, but never an active one", () => {
    renderCards({
      counts: new Map([
        ["calm", 0],
        ["balanced", 0],
        ["lively", 2],
      ]),
      selected: ["balanced"],
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
    const { onToggleMany } = renderCards({ selected: ["calm", "lively"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter energije" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["calm", "lively"]);
  });

  // The one place the celebration, the press anticipation and the neighbour
  // reaction actually run: a keyframe array reaching a spring would throw here
  // rather than in review.
  it("plays every level's gesture without a motion error", () => {
    function StatefulCards() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <I18nProvider locale="sl">
          <EnergyCards
            options={options}
            counts={counts}
            selected={selected}
            onToggle={(value) =>
              setSelected((current) =>
                current.includes(value)
                  ? current.filter((entry) => entry !== value)
                  : [...current, value],
              )
            }
            onToggleMany={() => undefined}
          />
        </I18nProvider>
      );
    }

    render(<StatefulCards />);

    const card = (label: string) =>
      screen.getByRole("button", { name: new RegExp(`^${label}, `) });

    for (const { label } of options) {
      const button = card(label);
      // The press pose is its own spring/tween path, so it gets driven too.
      fireEvent.pointerDown(button);
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
    }

    // The neighbour shock is staggered by distance and signed by direction, so
    // it is fired from both ends and from the middle: a card two steps out runs
    // a different delay and amplitude than one step out.
    for (const { label } of [...options].reverse()) {
      fireEvent.click(card(label));
      expect(card(label).getAttribute("aria-pressed")).toBe("false");
    }
    for (const index of [2, 0, 1]) {
      const button = card(options[index].label);
      fireEvent.click(button);
      expect(button.getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("renders and toggles under reduced motion", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: media === "(prefers-reduced-motion: reduce)",
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    try {
      const { onToggle } = renderCards();

      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`^${options[0].label}, `),
        }),
      );

      expect(onToggle).toHaveBeenCalledWith("calm");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});

describe("FilterGroupList energy group", () => {
  function renderList(selected: EnergyLevel[]) {
    const onToggleMany = vi.fn();
    const group: CardGroup = "energy";

    render(
      <I18nProvider locale="sl">
        <FilterGroupList
          filters={{
            species: "all",
            sex: [],
            age: [],
            size: [],
            energy: selected,
            shelter: [],
            toggles: [],
            goodWith: [],
            home: [],
            care: [],
          }}
          groups={[{ group, options }]}
          counts={{
            sex: new Map(),
            age: new Map(),
            size: new Map(),
            energy: counts,
            shelter: new Map(),
          }}
          toggles={[]}
          toggleTally={new Map()}
          onToggle={() => undefined}
          onToggleMany={(_group, values) => onToggleMany(values)}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
        />
      </I18nProvider>,
    );
    return { onToggleMany };
  }

  it("renders the energy section rather than the size paw cards", () => {
    renderList([]);

    expect(screen.getByRole("heading", { name: "Energija" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Velikost" })).toBeNull();
    expect(document.querySelector("svg.lucide-paw-print")).toBeNull();
    // The levels draw their own two-layer glyphs rather than rendering lucide.
    expect(document.querySelector("[data-energy-glyph='calm']")).not.toBeNull();
    expect(
      document.querySelector("[data-energy-glyph='balanced']"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-energy-glyph='lively']"),
    ).not.toBeNull();
  });

  it("clears the section from the reset the list wired up", () => {
    const { onToggleMany } = renderList(["calm"]);

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter energije" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["calm"]);
  });
});
