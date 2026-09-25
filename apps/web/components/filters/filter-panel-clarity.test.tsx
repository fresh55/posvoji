// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  careOptions,
  EMPTY_FILTERS,
  facetCounts,
  goodWithOptions,
  groupOptions,
  TOGGLES,
  toggleLabel,
  unansweredCounts,
  type Filters,
  type MultiGroup,
  type UnansweredTally,
} from "@/lib/filters";
import {
  installFilterFoldSeams,
  openAllFilterSections,
  openFilterSection,
} from "@/test/filter-folds";
import { FilterGroupList, type CardGroup } from "./filter-groups";

installFilterFoldSeams();
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const now = new Date("2026-09-21");

const CAT_TESTS = TOGGLES.filter(
  ({ key }) => key === "brez-fiv" || key === "brez-felv",
).map((toggle) => ({ ...toggle, label: toggleLabel(toggle.key, "sl") }));

function show({
  layout = "sidebar",
  groups = [],
  filters = EMPTY_FILTERS,
  counts = {},
  toggles = false,
  care = false,
  goodWith = false,
  unanswered,
}: {
  layout?: "sidebar" | "sheet";
  groups?: CardGroup[];
  filters?: Filters;
  counts?: Partial<Record<MultiGroup, [string, number][]>>;
  toggles?: boolean;
  care?: boolean;
  goodWith?: boolean;
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
        toggles={toggles ? CAT_TESTS : []}
        toggleTally={new Map([["brez-fiv", 227], ["brez-felv", 236]])}
        goodWith={
          goodWith
            ? {
                options: goodWithOptions("sl"),
                counts: new Map(goodWithOptions("sl").map(({ key }) => [key, 3])),
                resultCount: 10,
                total: 10,
                onToggle: vi.fn(),
                onToggleMany: vi.fn(),
              }
            : undefined
        }
        care={
          care
            ? {
                options: careOptions("sl"),
                counts: new Map(careOptions("sl").map(({ key }) => [key, 3])),
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

describe("Čaka na dom takes one threshold at a time", () => {
  it.each(["sidebar", "sheet"] as const)("and says so with a round mark in the %s", (layout) => {
    show({
      layout,
      groups: ["waiting", "coatLength"],
      counts: { waiting: [["over-1-year", 4]], coatLength: [["long", 2]] },
    });
    openFilterSection("Čaka na dom");
    const mark = (name: RegExp) =>
      screen.getByRole("button", { name }).querySelector("span[aria-hidden].border");
    expect(mark(/^Nad 1\sleto,/)?.classList.contains("rounded-full")).toBe(true);
    // A section whose answers add up keeps the tick box.
    openFilterSection("Videz");
    expect(mark(/^Dolga,/)?.classList.contains("rounded-sm")).toBe(true);
  });

  it("says so to a screen reader on every row, which hears nothing of the mark", () => {
    show({ groups: ["waiting"], counts: { waiting: [["over-1-year", 4]] } });
    openFilterSection("Čaka na dom");
    const row = screen.getByRole("button", { name: /^Nad 1\sleto,/ });
    const description = document.getElementById(row.getAttribute("aria-describedby")!);
    expect(description?.textContent).toBe(
      "Šteto od dneva, ko je žival prišla v\u00a0zavetišče. Izbereš lahko eno mejo.",
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

  // The two notes used to stack, four 11px lines under the rows. Folded into
  // one sentence when both apply.
  it("says both in one sentence when a pick also leaves some dogs unanswered", () => {
    const none = unansweredCounts([], EMPTY_FILTERS, now);
    const unanswered: UnansweredTally = {
      ...none,
      groups: { ...none.groups, size: { asked: 100, unanswered: 40 } },
    };
    show({ groups: ["size"], counts: { size: [["small", 12]] }, unanswered });
    openFilterSection("Velikost");
    expect(
      screen.getByText(
        "Izbira ne pokaže mačk, ki jih po velikosti ne ločimo, in 40 živali brez podatka.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Mačk po velikosti ne ločimo, zato jih izbira ne pokaže."),
    ).toBeNull();
  });

  // Cats do answer on Psi, so leavesOutCats does not apply there: the plain
  // unanswered line carries the count on its own, same as every other section.
  it("keeps the plain unanswered line on Psi, where leaving cats out does not apply", () => {
    const none = unansweredCounts([], EMPTY_FILTERS, now);
    const unanswered: UnansweredTally = {
      ...none,
      groups: { ...none.groups, size: { asked: 100, unanswered: 40 } },
    };
    show({
      groups: ["size"],
      filters: { ...EMPTY_FILTERS, species: "dog" },
      counts: { size: [["small", 12]] },
      unanswered,
    });
    openFilterSection("Velikost");
    expect(
      screen.getByText("Brez podatka: 40. Izbira pokaže le živali s podatkom."),
    ).toBeTruthy();
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
    ).toContain("Brez\u00a0podatka: 134");
    expect(
      screen.getByRole("button", { name: /^Brez FeLV,/ }).textContent,
    ).toContain("Brez\u00a0podatka: 121");
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

describe("the sidebar's count column", () => {
  // The real check is visual: every row measured at 1440, three digits on one
  // column edge and "Nad 6 mesecev" on one line (countClass in filter-card.tsx
  // has the numbers). jsdom has no layout, so this pins the class contract
  // that holds it in every section that draws a row, the age grid and the
  // waiting rows included: a column that starts at min-w-6 and grows with its
  // digits, never a fixed width a fourth digit would spill out of into the
  // mark.
  it("starts at one minimum and grows with its digits in every section", () => {
    const groups: CardGroup[] = ["sex", "age", "size", "energy", "coatLength", "waiting"];
    show({
      groups,
      counts: Object.fromEntries(
        groups.map((group) => [
          group,
          groupOptions(group, [], "sl").map(({ value }): [string, number] => [value, 3]),
        ]),
      ),
      toggles: true,
      care: true,
      goodWith: true,
    });
    openAllFilterSections();

    const labels = [
      ...groups.flatMap((group) => groupOptions(group, [], "sl").map(({ label }) => label)),
      ...goodWithOptions("sl").map(({ label }) => label),
      ...careOptions("sl").map(({ label }) => label),
      ...CAT_TESTS.map(({ label }) => label),
    ];
    const rows = [...document.querySelectorAll<HTMLElement>("button[aria-pressed]")];
    for (const label of labels) {
      const row = rows.find((button) =>
        button.getAttribute("aria-label")?.startsWith(`${label},`),
      );
      const count = row?.querySelector(".tabular-nums");
      expect(count, label).toBeTruthy();
      const classes = [...(count?.classList ?? [])];
      expect(classes, label).toEqual(expect.arrayContaining(["min-w-6", "text-right"]));
      expect(classes.filter((name) => /^w-/.test(name)), label).toEqual([]);
      // A flex line can squeeze an item below its content down to min-w-6.
      if (count?.parentElement?.classList.contains("justify-between")) {
        expect(classes, label).toContain("shrink-0");
      }
      // A fixed grid track would hold the count to its width all the same.
      expect(row?.className, label).not.toMatch(/grid-cols-\[[^\]]*_[\d.]+(?:rem|px)\]/);
    }
  });
});
