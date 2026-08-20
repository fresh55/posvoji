// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, homeOptions, type HomeKey } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { FilterGroupList } from "./filter-groups";
import { HomeCards } from "./home-cards";

afterEach(() => cleanup());

const options = homeOptions("sl");
const counts = new Map(options.map(({ key }) => [key, 2]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: HomeKey[];
    resultCount?: number;
    total?: number;
    locale?: Locale;
    onToggle?: (key: HomeKey) => void;
    onToggleMany?: (keys: HomeKey[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  const locale = overrides.locale ?? "sl";
  render(
    <I18nProvider locale={locale}>
      <HomeCards
        options={homeOptions(locale)}
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

describe("HomeCards", () => {
  it("names the section and says where the answers come from", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Dom" })).toBeTruthy();
    expect(
      screen.getByText(
        "Živali, za katere zavetišče presoja, da lahko srečno živijo v stanovanju.",
      ),
    ).toBeTruthy();
  });

  it("labels the card as a whole phrase in both locales", () => {
    expect(options.map(({ label }) => label)).toEqual([
      "Primeren za stanovanje",
    ]);
    expect(homeOptions("en").map(({ label }) => label)).toEqual([
      "Apartment-friendly",
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
    renderCards({ selected: ["apartment"] });

    const cards = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") !== null);
    expect(cards.map((card) => card.getAttribute("aria-pressed"))).toEqual([
      "true",
    ]);
  });

  it("calls onToggle with the facet key", () => {
    const { onToggle } = renderCards();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${options[0].label}, `) }),
    );
    expect(onToggle).toHaveBeenCalledWith("apartment");
  });

  it("locks out a facet no animal can answer, but never an active one", () => {
    const dead = () =>
      screen.getByRole("button", {
        name: new RegExp(`^${options[0].label}, `),
      }) as HTMLButtonElement;

    renderCards({ counts: new Map([["apartment", 0]]) });
    expect(dead().disabled).toBe(true);
    cleanup();

    renderCards({
      counts: new Map([["apartment", 0]]),
      selected: ["apartment"],
    });
    expect(dead().disabled).toBe(false);
  });

  it("clears the section from its reset", () => {
    const { onToggleMany } = renderCards({ selected: ["apartment"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter doma" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["apartment"]);
  });
});

describe("the outcome sentence", () => {
  const sentence = () =>
    document.querySelector("[aria-live='polite']")?.textContent ?? "";

  it("says nothing while nothing is selected", () => {
    renderCards();

    expect(sentence()).toBe("");
    expect(screen.queryByText(/Prikazane so živali/)).toBeNull();
  });

  it("announces itself politely", () => {
    renderCards({ selected: ["apartment"] });

    const live = screen.getByText(/^Prikazane so živali/);
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("names both numbers", () => {
    renderCards({ selected: ["apartment"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, primerne za stanovanje. 70 od 489.",
    );
  });

  it("reads the same way in English", () => {
    renderCards({ locale: "en", selected: ["apartment"], resultCount: 70 });
    expect(sentence()).toBe("Showing apartment-friendly animals. 70 of 489.");
  });
});

describe("FilterGroupList", () => {
  function renderList(home?: Parameters<typeof FilterGroupList>[0]["home"]) {
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
          home={home}
          onToggle={() => undefined}
          onToggleMany={() => undefined}
          onToggleProperty={() => undefined}
          onToggleManyProperties={() => undefined}
        />
      </I18nProvider>,
    );
  }

  it("leaves the section out while no animal answers it", () => {
    renderList(undefined);
    expect(screen.queryByRole("heading", { name: "Dom" })).toBeNull();
  });

  it("shows the section once a facet can narrow something", () => {
    renderList({
      options,
      counts: new Map([["apartment", 4]]),
      resultCount: 4,
      total: 20,
      onToggle: () => undefined,
      onToggleMany: () => undefined,
    });

    expect(screen.getByRole("heading", { name: "Dom" })).toBeTruthy();
    expect(
      screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed")),
    ).toHaveLength(1);
  });
});
