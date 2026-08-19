// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, goodWithOptions, type GoodWithKey } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { FilterGroupList } from "./filter-groups";
import { GoodWithCards } from "./good-with-cards";

afterEach(() => cleanup());

const options = goodWithOptions("sl");
const counts = new Map(options.map(({ key }) => [key, 2]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: GoodWithKey[];
    resultCount?: number;
    total?: number;
    locale?: Locale;
    onToggle?: (key: GoodWithKey) => void;
    onToggleMany?: (keys: GoodWithKey[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  const locale = overrides.locale ?? "sl";
  render(
    <I18nProvider locale={locale}>
      <GoodWithCards
        options={goodWithOptions(locale)}
        counts={overrides.counts ?? counts}
        selected={overrides.selected ?? []}
        resultCount={overrides.resultCount ?? 70}
        total={overrides.total ?? 489}
        onToggle={onToggle}
        onToggleMany={onToggleMany}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleMany };
}

describe("GoodWithCards", () => {
  it("asks about the household rather than naming species", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Doma imam" })).toBeTruthy();
    expect(
      screen.getByText(
        "Označi, kdo že živi pri tebi. Živali brez odgovora zavetišča so skrite.",
      ),
    ).toBeTruthy();
  });

  it("labels the cards so they cannot be read as the species tabs", () => {
    renderCards();

    expect(options.map(({ label }) => label)).toEqual([
      "Otroke",
      "Psa",
      "Mačko",
    ]);
    expect(goodWithOptions("en").map(({ label }) => label)).toEqual([
      "Kids",
      "A dog",
      "A cat",
    ]);
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
      screen.getByRole("button", { name: "Ponastavi, kdo živi pri tebi" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["kids", "cats"]);
  });
});

describe("the outcome sentence", () => {
  const sentence = () =>
    document.querySelector("[aria-live='polite']")?.textContent ?? "";

  it("says nothing while nothing is selected", () => {
    renderCards();

    expect(sentence()).toBe("");
    expect(
      screen.queryByText(/Prikazane so živali/),
    ).toBeNull();
  });

  it("announces itself politely", () => {
    renderCards({ selected: ["kids"] });

    const live = screen.getByText(/^Prikazane so živali/);
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("carries the preposition of whichever facet comes first", () => {
    renderCards({ selected: ["kids"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z otroki. 70 od 489.",
    );
    cleanup();

    renderCards({ selected: ["dogs"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo s psi. 70 od 489.",
    );
    cleanup();

    renderCards({ selected: ["cats"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z mačkami. 70 od 489.",
    );
  });

  it("joins two and three facets in the fixed card order", () => {
    renderCards({ selected: ["dogs", "kids"], resultCount: 24 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z otroki in psi. 24 od 489.",
    );
    cleanup();

    renderCards({ selected: ["cats", "dogs", "kids"], resultCount: 12 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki se razumejo z otroki, psi in mačkami. 12 od 489.",
    );
  });

  it("reads the same way in English", () => {
    renderCards({ locale: "en", selected: ["kids"], resultCount: 70 });
    expect(sentence()).toBe("Showing animals that get on with kids. 70 of 489.");
    cleanup();

    renderCards({ locale: "en", selected: ["kids", "dogs"], resultCount: 24 });
    expect(sentence()).toBe(
      "Showing animals that get on with kids and dogs. 24 of 489.",
    );
    cleanup();

    renderCards({
      locale: "en",
      selected: ["kids", "dogs", "cats"],
      resultCount: 12,
    });
    expect(sentence()).toBe(
      "Showing animals that get on with kids, dogs and cats. 12 of 489.",
    );
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
    expect(screen.queryByRole("heading", { name: "Doma imam" })).toBeNull();
  });

  it("shows only the facets that can narrow anything", () => {
    renderList({
      options: options.filter(({ key }) => key === "kids"),
      counts: new Map([["kids", 4]]),
      resultCount: 4,
      total: 20,
      onToggle: () => undefined,
      onToggleMany: () => undefined,
    });

    expect(screen.getByRole("heading", { name: "Doma imam" })).toBeTruthy();
    expect(
      screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed")),
    ).toHaveLength(1);
  });
});
