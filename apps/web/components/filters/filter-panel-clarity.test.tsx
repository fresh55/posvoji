// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  careOptions,
  EMPTY_FILTERS,
  facetCounts,
  groupOptions,
  TOGGLES,
  toggleLabel,
  unansweredCounts,
  type Filters,
  type MultiGroup,
  type UnansweredTally,
} from "@/lib/filters";
import { installFilterFoldSeams, openFilterSection } from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";

installFilterFoldSeams();
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const now = new Date("2026-09-21");

function show({
  layout = "sidebar",
  groups = [],
  filters = EMPTY_FILTERS,
  counts = {},
  toggles = false,
  care = false,
  unanswered,
}: {
  layout?: "sidebar" | "sheet";
  groups?: CardGroup[];
  filters?: Filters;
  counts?: Partial<Record<MultiGroup, [string, number][]>>;
  toggles?: boolean;
  care?: boolean;
  unanswered?: UnansweredTally;
}) {
  const onToggle = vi.fn();
  const onToggleManyProperties = vi.fn();
  const tally = facetCounts([], EMPTY_FILTERS, now);
  for (const [group, entries] of Object.entries(counts)) {
    for (const [value, count] of entries) tally[group as MultiGroup].set(value, count);
  }
  render(
    <I18nProvider locale="sl">
      <FilterGroupList
        layout={layout}
        filters={filters}
        groups={groups.map((group) => ({ group, options: groupOptions(group, [], "sl") }))}
        counts={tally}
        toggles={
          toggles
            ? TOGGLES.filter(({ key }) => key === "brez-fiv" || key === "brez-felv").map(
                (toggle) => ({ ...toggle, label: toggleLabel(toggle.key, "sl") }),
              )
            : []
        }
        toggleTally={new Map([["brez-fiv", 227], ["brez-felv", 236]])}
        care={
          care
            ? {
                options: careOptions("sl"),
                counts: new Map([["patient", 3]]),
                resultCount: 10,
                total: 10,
                onToggle: vi.fn(),
                onToggleMany: vi.fn(),
              }
            : undefined
        }
        unanswered={unanswered}
        onToggle={onToggle}
        onToggleMany={vi.fn()}
        onToggleProperty={vi.fn()}
        onToggleManyProperties={onToggleManyProperties}
      />
    </I18nProvider>,
  );
  return { onToggle, onToggleManyProperties };
}

describe("V zavetišču takes one threshold at a time", () => {
  it.each(["sidebar", "sheet"] as const)("and says so with a round mark in the %s", (layout) => {
    show({
      layout,
      groups: ["waiting", "coatLength"],
      counts: { waiting: [["over-1-year", 4]], coatLength: [["long", 2]] },
    });
    openFilterSection("V zavetišču");
    const mark = (name: RegExp) =>
      screen.getByRole("button", { name }).querySelector("span[aria-hidden].border");
    expect(mark(/^Nad 1 leto,/)?.classList.contains("rounded-full")).toBe(true);
    // A section whose answers add up keeps the tick box.
    openFilterSection("Videz");
    expect(mark(/^Dolga,/)?.classList.contains("rounded-sm")).toBe(true);
  });

  it("says so to a screen reader on every row, which hears nothing of the mark", () => {
    show({ groups: ["waiting"], counts: { waiting: [["over-1-year", 4]] } });
    openFilterSection("V zavetišču");
    const row = screen.getByRole("button", { name: /^Nad 1 leto,/ });
    const description = document.getElementById(row.getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe(
      "Po znanem datumu sprejema v zavetišče. Izbereš lahko eno mejo.",
    );
  });
});

describe("Velikost on Vse", () => {
  it("says that a pick leaves every cat out", () => {
    show({ groups: ["size"], counts: { size: [["small", 12]] } });
    openFilterSection("Velikost");
    expect(
      screen.getByText("Mačk po velikosti ne ločimo, zato jih izbira ne pokaže."),
    ).toBeTruthy();
  });

  it("says nothing of cats on Psi, where there are none to leave out", () => {
    show({
      groups: ["size"],
      filters: { ...EMPTY_FILTERS, species: "dog" },
      counts: { size: [["small", 12]] },
    });
    openFilterSection("Velikost");
    expect(screen.queryByText(/Mačk po velikosti/)).toBeNull();
  });
});

describe("Lahko ponudim", () => {
  it("says which way it narrows before the first press, on a mouse too", () => {
    show({ care: true });
    openFilterSection("Lahko ponudim");
    const lead = screen.getByText("Pokaži živali, ki potrebujejo:");
    // Not the hint's dress, which a folding section hides on a fine pointer.
    expect(lead.className).not.toContain("hidden");
  });
});

describe("the health rows", () => {
  const none = unansweredCounts([], EMPTY_FILTERS, now);
  const unanswered: UnansweredTally = {
    ...none,
    toggles: {
      ...none.toggles,
      "brez-fiv": { asked: 363, unanswered: 134 },
      "brez-felv": { asked: 363, unanswered: 121 },
    },
  };

  it("say beside each test how many cats have no result, and once what a pick does", () => {
    show({ toggles: true, filters: { ...EMPTY_FILTERS, species: "cat" }, unanswered });
    openFilterSection("Zdravje");
    expect(
      screen.getByRole("button", { name: /^Brez FIV,/ }).textContent,
    ).toContain("Brez podatka:\u00a0134");
    expect(
      screen.getByRole("button", { name: /^Brez FeLV,/ }).textContent,
    ).toContain("Brez podatka:\u00a0121");
    expect(screen.getByText("Izbira pokaže le živali s podatkom.")).toBeTruthy();
  });

  it("take every pick off with one Ponastavi", () => {
    const { onToggleManyProperties } = show({
      toggles: true,
      filters: { ...EMPTY_FILTERS, species: "cat", toggles: ["brez-fiv", "brez-felv"] },
      unanswered,
    });
    openFilterSection("Zdravje");
    fireEvent.click(screen.getByRole("button", { name: "Ponastavi zdravstvene filtre" }));
    expect(onToggleManyProperties).toHaveBeenLastCalledWith(["brez-fiv", "brez-felv"]);
  });

  it("stay quiet without a tally to read", () => {
    show({ toggles: true, filters: { ...EMPTY_FILTERS, species: "cat" } });
    openFilterSection("Zdravje");
    expect(screen.queryByText(/Brez podatka/)).toBeNull();
    expect(screen.queryByText("Izbira pokaže le živali s podatkom.")).toBeNull();
  });
});
