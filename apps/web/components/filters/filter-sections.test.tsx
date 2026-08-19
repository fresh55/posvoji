// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { useAnimalFilters } from "@/hooks/use-animal-filters";
import {
  applyFilters,
  EMPTY_FILTERS,
  facetCounts,
  goodWithCounts,
  goodWithOptions,
  GROUPS,
  groupOptions,
  toggleCounts,
  toggleLabel,
  visibleGoodWith,
  visibleGroups,
  visibleToggles,
  type Filters,
} from "@/lib/filters";
import type { CardGroup } from "./filter-groups";
import { FilterSidebar } from "./filter-sidebar";
import { resetFilterSectionsStore } from "./use-filter-sections";

const STORAGE_KEY = "posvoji:filter-sections";
const NOW = new Date("2026-01-01T00:00:00.000Z");

// jsdom lays nothing out and has no scrollIntoView, so the reveal a freshly
// opened section runs would throw from a timeout after the test that made it.
const scrollIntoView = vi.fn();
Element.prototype.scrollIntoView = scrollIntoView;
// The fold measures its own height, and motion restores the scroll position
// around the measurement.
window.scrollTo = vi.fn();
// A header tooltip opens on focus, and Radix positions it with an observer
// jsdom does not ship.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;

beforeEach(() => {
  window.localStorage.clear();
  resetFilterSectionsStore();
  scrollIntoView.mockClear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetFilterSectionsStore();
  window.history.replaceState(null, "", "/");
});

function animal(
  id: string,
  sex: "male" | "female",
  approximateAgeMonths: number,
  size: "small" | "medium" | "large",
  energy: Animal["energy"],
  medical: Animal["medical"] = {},
  goodWith: Animal["goodWith"] = undefined,
): Animal {
  return {
    ...(goodWith ? { goodWith } : {}),
    ...(energy ? { energy } : {}),
    id,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: id,
      sourceUrl: `https://example.test/animals/${id}`,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Test shelter", city: "Ljubljana" },
    name: id,
    species: "dog",
    sex,
    size,
    approximateAgeMonths,
    status: "available",
    medical,
    images: [],
    attribution: "Test fixture",
  };
}

// Every section the sidebar can show has something to show: two sexes, three
// ages and sizes, two energy levels, two health traits, two household answers.
const ANIMALS = [
  animal("male-young", "male", 6, "small", "calm", { neutered: true }, {
    kids: "yes",
    dogs: "yes",
  }),
  animal("female-adult", "female", 36, "medium", "lively", { vaccinated: true }, {
    kids: "yes",
    dogs: "no",
  }),
  animal("male-senior", "male", 120, "large", undefined),
];

const NOOP = () => undefined;

function sidebarProps(filters: Filters) {
  const shown = visibleGroups(ANIMALS, filters.species, NOW);
  const goodWithKeys = visibleGoodWith(ANIMALS);

  return {
    filters,
    groups: GROUPS.filter(
      (group): group is CardGroup => group !== "shelter" && shown[group],
    ).map((group) => ({
      group,
      options: groupOptions(group, ANIMALS, "sl"),
    })),
    counts: facetCounts(ANIMALS, filters, NOW),
    toggles: visibleToggles(ANIMALS, filters.species).map((definition) => ({
      ...definition,
      label: toggleLabel(definition.key, "sl"),
    })),
    toggleTally: toggleCounts(ANIMALS, filters, NOW),
    goodWith: {
      options: goodWithOptions("sl").filter(({ key }) =>
        goodWithKeys.includes(key),
      ),
      counts: goodWithCounts(ANIMALS, filters, NOW),
      resultCount: applyFilters(ANIMALS, filters, NOW).length,
      total: ANIMALS.length,
      onToggle: NOOP,
      onToggleMany: NOOP,
    },
  };
}

// The folding tests need selections to survive a click, so the sidebar runs on
// the real URL-backed filter state.
function SidebarHarness() {
  const {
    filters,
    toggle,
    toggleMany,
    toggleProperty,
    toggleManyProperties,
    toggleGoodWith,
    toggleManyGoodWith,
    clearAll,
  } = useAnimalFilters();
  const props = sidebarProps(filters);

  return (
    <I18nProvider locale="sl">
      <FilterSidebar
        {...props}
        goodWith={{
          ...props.goodWith,
          onToggle: toggleGoodWith,
          onToggleMany: toggleManyGoodWith,
        }}
        onToggle={toggle}
        onToggleMany={toggleMany}
        onToggleProperty={toggleProperty}
        onToggleManyProperties={toggleManyProperties}
        onClearAll={clearAll}
      />
    </I18nProvider>
  );
}

function renderSidebar() {
  return render(<SidebarHarness />);
}

// The heading tests care about what the sidebar is handed, not where it came
// from, so they state the filters outright.
function renderStatic(filters: Filters, onClearAll: () => void) {
  return render(
    <I18nProvider locale="sl">
      <FilterSidebar
        {...sidebarProps(filters)}
        onToggle={NOOP}
        onToggleMany={NOOP}
        onToggleProperty={NOOP}
        onToggleManyProperties={NOOP}
        onClearAll={onClearAll}
      />
    </I18nProvider>,
  );
}

function header(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function expanded(label: string): string | null {
  return header(label).getAttribute("aria-expanded");
}

function card(name: RegExp): HTMLElement | null {
  return screen.queryByRole("button", { name });
}

function stored(): unknown {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
}

describe("collapsible filter sections", () => {
  it("opens what a visitor reaches for first and folds the rest away", () => {
    renderSidebar();

    expect(expanded("Spol")).toBe("true");
    expect(expanded("Starost")).toBe("true");
    expect(expanded("Velikost")).toBe("true");
    expect(card(/^Samec/)).toBeTruthy();
    expect(card(/^Mladiček/)).toBeTruthy();
    expect(card(/^Majhna/)).toBeTruthy();

    expect(expanded("Energija")).toBe("false");
    expect(expanded("Zdravje")).toBe("false");
    expect(expanded("Doma imam")).toBe("false");
    expect(card(/^Miren/)).toBeNull();
    expect(card(/^Sterilizacija/)).toBeNull();
    expect(card(/^Otroke/)).toBeNull();
  });

  it("unfolds a section from its header and folds it back", async () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    expect(expanded("Zdravje")).toBe("true");
    expect(card(/^Sterilizacija/)).toBeTruthy();

    fireEvent.click(header("Zdravje"));
    expect(expanded("Zdravje")).toBe("false");
    await waitFor(() => expect(card(/^Sterilizacija/)).toBeNull());
  });

  it("points the header at the body it controls", () => {
    renderSidebar();

    const contentId = header("Zdravje").getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    expect(document.getElementById(contentId ?? "")).toBeNull();

    fireEvent.click(header("Zdravje"));
    const body = document.getElementById(contentId ?? "");
    expect(body?.contains(card(/^Sterilizacija/))).toBe(true);
  });

  it("keeps a folded selection visible in the header", async () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    fireEvent.click(header("Zdravje"));
    expect(header("Zdravje").textContent).toContain("Sterilizacija");

    fireEvent.click(header("Zdravje"));
    await waitFor(() =>
      expect(card(/^Cepljenje/)).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Cepljenje/ }));
    fireEvent.click(header("Zdravje"));
    expect(header("Zdravje").textContent).toContain("Sterilizacija +1");
  });

  it("hands the reset back only once the section is open", () => {
    renderSidebar();
    const resetName = "Ponastavi zdravstvene filtre";

    fireEvent.click(header("Zdravje"));
    fireEvent.click(screen.getByRole("button", { name: /^Sterilizacija/ }));
    expect(screen.getByRole("button", { name: resetName })).toBeTruthy();

    fireEvent.click(header("Zdravje"));
    expect(screen.queryByRole("button", { name: resetName })).toBeNull();
    expect(
      screen.getByLabelText(resetName).getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("brings a freshly unfolded section into view, and a folded one never", async () => {
    renderSidebar();

    fireEvent.click(header("Doma imam"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
    });

    fireEvent.click(header("Doma imam"));
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("walks the section headers with the arrow keys", () => {
    renderSidebar();

    header("Spol").focus();
    fireEvent.keyDown(header("Spol"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(header("Starost"));

    fireEvent.keyDown(header("Starost"), { key: "End" });
    expect(document.activeElement).toBe(header("Doma imam"));

    fireEvent.keyDown(header("Doma imam"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(header("Zdravje"));

    fireEvent.keyDown(header("Zdravje"), { key: "Home" });
    expect(document.activeElement).toBe(header("Spol"));
  });
});

describe("remembered folds", () => {
  it("stores only what departs from the defaults", () => {
    renderSidebar();

    fireEvent.click(header("Zdravje"));
    expect(stored()).toEqual({ health: true });

    fireEvent.click(header("Spol"));
    expect(stored()).toEqual({ health: true, sex: false });
  });

  it("restores the stored folds in a fresh render", () => {
    const { unmount } = renderSidebar();
    fireEvent.click(header("Zdravje"));
    fireEvent.click(header("Spol"));
    unmount();

    // A new tab reads the same storage and starts from nothing else.
    resetFilterSectionsStore();
    renderSidebar();

    expect(expanded("Zdravje")).toBe("true");
    expect(expanded("Spol")).toBe("false");
    expect(expanded("Starost")).toBe("true");
  });
});

describe("the sidebar heading", () => {
  it("counts the active sections only once there are any", () => {
    const { unmount } = renderStatic(EMPTY_FILTERS, NOOP);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Filtri");
    unmount();

    renderStatic(
      { ...EMPTY_FILTERS, sex: ["male"], toggles: ["sterilizacija"] },
      NOOP,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Filtri2");
  });

  it("keeps the clear out of reach while nothing is active", () => {
    renderStatic(EMPTY_FILTERS, NOOP);

    expect(screen.queryByRole("button", { name: "Počisti filtre" })).toBeNull();
    expect(
      screen.getByText("Počisti filtre").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("clears every section from the heading", () => {
    const onClearAll = vi.fn();
    renderStatic({ ...EMPTY_FILTERS, sex: ["male"] }, onClearAll);

    fireEvent.click(screen.getByRole("button", { name: "Počisti filtre" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
