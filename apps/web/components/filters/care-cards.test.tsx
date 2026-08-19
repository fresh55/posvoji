// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { careOptions, EMPTY_FILTERS, type CareKey } from "@/lib/filters";
import type { Locale } from "@/lib/i18n";
import { CareCards } from "./care-cards";
import { FilterGroupList } from "./filter-groups";

afterEach(() => cleanup());

const options = careOptions("sl");
const counts = new Map(options.map(({ key }) => [key, 2]));

function renderCards(
  overrides: {
    counts?: Map<string, number>;
    selected?: CareKey[];
    resultCount?: number;
    total?: number;
    locale?: Locale;
    onToggle?: (key: CareKey) => void;
    onToggleMany?: (keys: CareKey[]) => void;
  } = {},
) {
  const onToggle = overrides.onToggle ?? vi.fn();
  const onToggleMany = overrides.onToggleMany ?? vi.fn();
  const locale = overrides.locale ?? "sl";
  render(
    <I18nProvider locale={locale}>
      <CareCards
        options={careOptions(locale)}
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

describe("CareCards", () => {
  it("invites rather than warns, and says who the section is for", () => {
    renderCards();

    expect(screen.getByRole("heading", { name: "Posebna skrb" })).toBeTruthy();
    expect(
      screen.getByText(
        "Za tiste, ki želijo pomagati živali, ki potrebuje več časa in razumevanja.",
      ),
    ).toBeTruthy();
  });

  it("labels the card as a whole phrase in both locales", () => {
    expect(options.map(({ label }) => label)).toEqual([
      "Potrebuje potrpežljivega človeka",
    ]);
    expect(careOptions("en").map(({ label }) => label)).toEqual([
      "Needs a patient person",
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
    renderCards({ selected: ["patient"] });

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
    expect(onToggle).toHaveBeenCalledWith("patient");
  });

  it("locks out a facet no animal can answer, but never an active one", () => {
    const card = () =>
      screen.getByRole("button", {
        name: new RegExp(`^${options[0].label}, `),
      }) as HTMLButtonElement;

    renderCards({ counts: new Map([["patient", 0]]) });
    expect(card().disabled).toBe(true);
    cleanup();

    renderCards({ counts: new Map([["patient", 0]]), selected: ["patient"] });
    expect(card().disabled).toBe(false);
  });

  it("clears the section from its reset", () => {
    const { onToggleMany } = renderCards({ selected: ["patient"] });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi filter posebne skrbi" }),
    );
    expect(onToggleMany).toHaveBeenCalledWith(["patient"]);
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
    renderCards({ selected: ["patient"] });

    const live = screen.getByText(/^Prikazane so živali/);
    expect(live.getAttribute("aria-live")).toBe("polite");
  });

  it("names both numbers", () => {
    renderCards({ selected: ["patient"], resultCount: 70 });
    expect(sentence()).toBe(
      "Prikazane so živali, ki iščejo potrpežljivega človeka. 70 od 489.",
    );
  });

  it("reads the same way in English", () => {
    renderCards({ locale: "en", selected: ["patient"], resultCount: 70 });
    expect(sentence()).toBe(
      "Showing animals looking for a patient person. 70 of 489.",
    );
  });
});

describe("FilterGroupList", () => {
  function renderList(care?: Parameters<typeof FilterGroupList>[0]["care"]) {
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
          care={care}
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
    expect(screen.queryByRole("heading", { name: "Posebna skrb" })).toBeNull();
  });

  it("shows the section once a facet can narrow something", () => {
    renderList({
      options,
      counts: new Map([["patient", 4]]),
      resultCount: 4,
      total: 20,
      onToggle: () => undefined,
      onToggleMany: () => undefined,
    });

    expect(screen.getByRole("heading", { name: "Posebna skrb" })).toBeTruthy();
    expect(
      screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed")),
    ).toHaveLength(1);
  });
});
