// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { AnimalFilters } from "./animal-filters";
import { FilterChips } from "./filter-chips";
import { FilterSheet } from "./filter-sheet";
import { LocationPicker } from "./location-picker";
import { SpeciesTabs } from "./species-tabs";

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
  it("spans the 320px viewport and shares the dock between both actions", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    const { container } = render(
      <I18nProvider locale="en">
        <AnimalFilters
          isEmpty={false}
          filters={{ ...EMPTY_FILTERS, sex: ["male"] }}
          speciesTally={{ all: 1, dog: 1, cat: 0, other: 0 }}
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
          sort="longest-in-shelter"
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          onSortChange={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    const dock = container.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Filters, 1 active" }),
    ).toBeTruthy();

    // Both actions are in the dock, and each is a direct child, which is what
    // splits the width between them evenly.
    expect(dock?.children.length).toBe(2);
    for (const slot of Array.from(dock?.children ?? [])) {
      expect(slot.querySelector("button") ?? slot.closest("button")).toBeTruthy();
    }
  });

  it("keeps the species tabs and a 44px sort control in the mobile toolbar", () => {
    render(
      <I18nProvider locale="en">
        <AnimalFilters
          isEmpty={false}
          filters={EMPTY_FILTERS}
          speciesTally={{ all: 2, dog: 1, cat: 1, other: 0 }}
          groups={[
            { group: "sex", options: [{ value: "male", label: "Male" }] },
          ]}
          counts={{ ...emptyCounts, sex: new Map([["male", 1]]) }}
          toggles={[]}
          toggleTally={new Map()}
          shelters={[{ value: "test", label: "Test shelter" }]}
          shelterTally={new Map([["test", 2]])}
          chips={[]}
          resultCount={2}
          sort="longest-in-shelter"
          onSpeciesChange={vi.fn()}
          onClearAll={vi.fn()}
          onSortChange={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    // The tabs live in the same sticky row as sort, not only behind the sheet.
    const mobileToolbar = document.querySelector(
      '[data-slot="mobile-toolbar"]',
    ) as HTMLElement;
    expect(mobileToolbar).toBeTruthy();
    // The name carries the tab's count too, so the match is a prefix.
    const mobileTab = within(mobileToolbar).getByRole("button", {
      name: /^Dogs/,
    });
    expect(mobileTab.closest('[data-slot="drawer-content"]')).toBe(null);

    // The pills are drawn smaller than a finger, so each carries the shared
    // utility that grows the tap target around the drawing.
    expect(mobileTab.className).toContain("max-lg:tap-target");

    // Hiding the sort label on the narrowest phones must not take the current
    // sort with it: it moves into the control's name.
    const sort = within(mobileToolbar).getByRole("combobox");
    expect(sort.getAttribute("aria-label")).toBe(
      "Sort animals: Longest in shelter",
    );
    expect(sort.className).toContain("max-lg:min-h-11");
  });

  it("announces the active filter count and keeps a mobile-sized close target", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          toggles={[]}
          toggleTally={new Map()}
          activeCount={2}
          resultCount={0}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", {
      name: "Filters, 2 active",
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
          toggles={[]}
          toggleTally={new Map()}
          activeCount={0}
          resultCount={0}
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
          toggles={[]}
          toggleTally={new Map()}
          activeCount={0}
          resultCount={0}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Clear all" }).hasAttribute("disabled"),
    ).toBe(true);

    rerender(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          toggles={[]}
          toggleTally={new Map()}
          activeCount={1}
          resultCount={0}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Clear all" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps the header outside the scrolling body", async () => {
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          toggles={[]}
          toggleTally={new Map()}
          activeCount={0}
          resultCount={0}
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

  it("does not repeat the species tabs inside the sheet", async () => {
    // The sticky bar behind the trigger already carries them; a second copy
    // here used to cost the sheet 56px on top of an 85dvh takeover.
    render(
      <I18nProvider locale="en">
        <FilterSheet
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={emptyCounts}
          toggles={[]}
          toggleTally={new Map()}
          activeCount={0}
          resultCount={0}
          onClearAll={vi.fn()}
          {...filterActions}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "All" })).toBeNull();
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
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Shelter:/ });
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

  it("makes the whole chip the 44px remove target rather than a circle inside it", () => {
    render(
      <I18nProvider locale="en">
        <FilterChips
          chips={[
            {
              key: "a",
              facet: "sex",
              value: "male",
              label: "Dogs",
              onRemove: vi.fn(),
            },
            {
              key: "b",
              facet: "sex",
              value: "female",
              label: "Cats",
              onRemove: vi.fn(),
            },
          ]}
          onClearAll={vi.fn()}
        />
      </I18nProvider>,
    );

    // The pill is the button. There used to be a 24px circle inside a 28px
    // pill, with the rest of the pill inert, and below md an invisible 44px
    // overlay over the circle that reached into the next chip's row gap.
    const removeDogs = screen.getByRole("button", {
      name: "Remove filter Dogs",
    });
    expect(removeDogs.className).toContain("max-md:min-h-11");
    expect(removeDogs.className).not.toContain("tap-target");
    expect(removeDogs.querySelector("button")).toBeNull();

    // And the row still keeps adjacent pills apart.
    expect(removeDogs.closest("span")?.parentElement?.className).toContain(
      "max-md:gap-2",
    );
  });

  it("scrolls the active species tab into view on mount, for a deep link that lands off-screen", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <I18nProvider locale="en">
        <SpeciesTabs
          value="other"
          onChange={vi.fn()}
          counts={{ all: 4, dog: 1, cat: 1, other: 2 }}
          fullWidth
        />
      </I18nProvider>,
    );

    expect(scrollIntoView).toHaveBeenCalled();
    HTMLElement.prototype.scrollIntoView = original;
  });

  it("lets a fullWidth species tab shrink and truncate instead of forcing the row past the sheet's padding", () => {
    render(
      <I18nProvider locale="en">
        <SpeciesTabs
          value="all"
          onChange={vi.fn()}
          counts={{ all: 4, dog: 1, cat: 1, other: 2 }}
          fullWidth
        />
      </I18nProvider>,
    );

    const otherTab = screen.getByRole("button", { name: /^Other/ });
    expect(otherTab.className).toContain("flex-1");
    expect(otherTab.className).not.toContain("shrink-0");
    expect(otherTab.querySelector("span")?.className).toContain("truncate");
    // The row itself keeps a scroll escape hatch rather than spilling past
    // the sheet's padding when the tabs still don't fit.
    const row = otherTab.parentElement;
    expect(row?.className).toContain("overflow-x-auto");
  });
});
