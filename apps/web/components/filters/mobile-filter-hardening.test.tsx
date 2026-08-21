// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { AnimalFilters } from "./animal-filters";
import { FilterSheet } from "./filter-sheet";
import { LocationPicker } from "./location-picker";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

afterEach(() => cleanup());

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

const filterActions = {
  onToggle: vi.fn(),
  onToggleMany: vi.fn(),
  onToggleProperty: vi.fn(),
  onToggleManyProperties: vi.fn(),
};

describe("mobile filter hardening", () => {
  it("keeps the 320px dock bounded with an active filter", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    const { container } = render(
      <I18nProvider locale="en">
        <AnimalFilters
          isEmpty={false}
          filters={{ ...EMPTY_FILTERS, sex: ["male"] }}
          speciesTally={{ all: 1, dog: 1, cat: 0, rabbit: 0, other: 0 }}
          groups={[
            { group: "sex", options: [{ value: "male", label: "Male" }] },
          ]}
          counts={{ ...emptyCounts, sex: new Map([["male", 1]]) }}
          toggles={[]}
          toggleTally={new Map()}
          shelters={[{ value: "test", label: "Test shelter" }]}
          shelterTally={new Map([["test", 1]])}
          chips={[]}
          resultCount={1}
          clearTrailKey={0}
          sort="longest-in-shelter"
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          onSortChange={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    const dock = container.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(dock?.className).toContain("p-1.5");
    expect(dock?.className).toContain("rounded-ui");
    expect(
      screen.getByRole("button", { name: "Filters, active sections: 1" }),
    ).toBeTruthy();
  });

  it("announces the active filter count and keeps a mobile-sized close target", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={2}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Filters, active sections: 2",
    });
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    expect((await screen.findByRole("button", { name: "Close" })).className).toContain(
      "size-11",
    );
  });

  it("scrolls the body inside its own overflow element, separate from the drawer content", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={0}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(scrollBody).toBeTruthy();
    expect(scrollBody?.className).toContain("overflow-y-auto");
    expect(scrollBody?.className).toContain("overscroll-contain");

    // DrawerContent renders the dialog element itself, so its content lives
    // on the dialog node rather than a descendant.
    const content = dialog;
    expect(content.getAttribute("data-slot")).toBe("drawer-content");
    expect(content.className).not.toContain("overflow-y-auto");
    expect(scrollBody).not.toBe(content);
  });

  it("disables the footer clear button only when no section is active", async () => {
    const { rerender } = render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={0}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled"),
    ).toBe(true);

    rerender(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={1}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Clear" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps the header outside the scrolling body", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={0}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const header = dialog.querySelector('[data-slot="filter-sheet-header"]');
    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(header).toBeTruthy();
    expect(scrollBody).toBeTruthy();
    expect(scrollBody?.contains(header as Node)).toBe(false);
  });

  it("keeps the species tabs outside the scrolling body", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          speciesTally={{ all: 0, dog: 0, cat: 0, rabbit: 0, other: 0 }}
          toggles={[]}
          toggleTally={new Map()}
          activeSectionCount={0}
          resultCount={0}
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const scrollBody = dialog.querySelector(".overflow-y-auto");
    const speciesToggle = screen.getByRole("button", { name: "All" });
    expect(scrollBody).toBeTruthy();
    expect(scrollBody?.contains(speciesToggle)).toBe(false);
  });

  it("returns focus to the shelter trigger after closing the dialog", async () => {
    render(
      <I18nProvider locale="en">
        <LocationPicker
          options={[
            { value: "test", label: "Test shelter", city: "Ljubljana" },
          ]}
          counts={new Map([["test", 1]])}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={1}
          species="all"
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("combobox", { name: /Shelter:/ });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" }).className).toContain(
      "size-11",
    );

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
