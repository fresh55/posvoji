// @vitest-environment jsdom

import { type ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { chipPill, phoneRow, stickyRow } from "@/test/filter-rows";
import {
  EMPTY_FILTERS,
  FILTER_FACETS,
  GROUPS,
  type MultiGroup,
} from "@/lib/filters";
import { AnimalFilters } from "./animal-filters";
import { FilterChips } from "./filter-chips";
import { FilterSheet } from "./filter-sheet";
import { LocationPicker } from "./location-picker";
import { installFilterFoldSeams } from "@/test/filter-folds";
import { SpeciesTabs } from "./species-tabs";
import { resetFilterSectionsStore } from "./use-filter-sections";
// The chunks a press on the sheet or the picker fetches, loaded with the file
// so the first test to open either does not wait for them inside its find
// (test/picker-chunks.ts says why).
import "./filter-sheet-content";
import "@/test/picker-chunks";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// The fold's jsdom seams, and the stored folds dropped around every test.
installFilterFoldSeams();

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

const filterActions = {
  onToggle: vi.fn(),
  onToggleMany: vi.fn(),
  onToggleProperty: vi.fn(),
  onToggleManyProperties: vi.fn(),
};

type SheetProps = Partial<ComponentProps<typeof FilterSheet>>;

/** One FilterSheet with every prop no test cares about already filled in.
 *  Six tests below render it and each of them varies one thing; spelling the
 *  other eleven props out per test hid which one that was. The returned
 *  `rerender` takes the same overrides, so the one test that changes a prop
 *  on a live mount keeps doing exactly that. */
function renderSheet(overrides: SheetProps = {}) {
  const element = (props: SheetProps) => (
    <I18nProvider locale="en">
      <FilterSheet
        sort="longest-in-shelter"
        onSortChange={vi.fn()}
        filters={EMPTY_FILTERS}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        activeCount={0}
        resultCount={0}
        onSpeciesChange={vi.fn()}
        onClearAll={vi.fn()}
        {...filterActions}
        {...props}
      />
    </I18nProvider>
  );
  const result = render(element(overrides));
  return {
    ...result,
    rerender: (next: SheetProps) => result.rerender(element(next)),
  };
}

type FiltersProps = Partial<ComponentProps<typeof AnimalFilters>>;

/** One AnimalFilters with every prop no test cares about already filled in,
 *  the same bargain renderSheet above strikes and for the same reason: the
 *  tests below each vary two or three things, and spelling the other fifteen
 *  out per test hid which ones those were. One dog at one shelter,
 *  nothing filtered, which is the smallest state the dock still draws.
 *
 *  The roster and the tally start as the same numbers because nothing is
 *  filtered here; a test that filters something says so by overriding both. */
function renderFilters(overrides: FiltersProps = {}) {
  return render(
    <I18nProvider locale="en">
      <AnimalFilters
        isEmpty={false}
        filters={EMPTY_FILTERS}
        speciesTally={{ all: 1, dog: 1, cat: 0, other: 0 }}
        speciesRoster={{ all: 1, dog: 1, cat: 0, other: 0 }}
        groups={[]}
        counts={emptyCounts}
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
        {...overrides}
      />
    </I18nProvider>,
  );
}

/** Three animals no facet can tell apart: every group and toggle list is
 *  empty, which is what a shelter's single-species roster produces. The sheet
 *  behind the dock has nothing in it but the order at this state, which is
 *  the one reason it holds that runs out where the toolbar pins and stays
 *  pinned (SORT_ROW_HIDDEN in filter-sheet.tsx). The tests
 *  below start here and each varies one thing from it. */
const ORDER_ONLY: FiltersProps = {
  speciesTally: { all: 3, dog: 3, cat: 0, other: 0 },
  speciesRoster: { all: 3, dog: 3, cat: 0, other: 0 },
  resultCount: 3,
};

/** A dataset with no shelters to choose between, which leaves the dock's
 *  trigger without the picker beside it. */
const NO_SHELTERS: FiltersProps = {
  shelters: undefined,
  shelterTally: new Map(),
};

/** The one sex facet the dock tests lean on, as a group and its count. */
const SEX_GROUP: FiltersProps = {
  groups: [{ group: "sex", options: [{ value: "male", label: "Male" }] }],
  counts: { ...emptyCounts, sex: new Map([["male", 1]]) },
};

describe("mobile filter hardening", () => {
  it("spans the 320px viewport and shares the dock between both actions", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    const { container } = renderFilters({
      filters: { ...EMPTY_FILTERS, sex: ["male"] },
      ...SEX_GROUP,
    });

    const dock = container.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Filters, 1 active" }),
    ).toBeTruthy();

    // Both actions are in the dock, and each is a direct child, which is what
    // splits the width between them evenly.
    expect(dock?.children.length).toBe(2);
    for (const slot of Array.from(dock?.children ?? [])) {
      expect(slot.querySelector("button") ?? slot.closest("button")).toBeTruthy();
    }

    // Edge to edge is for this width and the phone widths above it. The
    // classes are asserted rather than measured because jsdom resolves no
    // breakpoint, and they are the whole of the rule: pinned to both edges up
    // to lg, a 768px tablet drew a 736px plate with a 639px pill on it for the
    // 13 characters of "Vsa zavetišča". From sm the plate is capped and
    // centred instead.
    expect(dock?.className).toContain("sm:left-1/2");
    expect(dock?.className).toContain("sm:right-auto");
    expect(dock?.className).toContain("sm:w-[min(28rem,calc(100vw-2rem))]");
    expect(dock?.className).toContain("sm:-translate-x-1/2");
    // The bottom edge is not part of the cap. The footer measures its docked
    // padding against this inset, so only the horizontal edges may move.
    expect(dock?.className).toContain(
      "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]",
    );
  });

  it("puts the sticky toolbar band over the dock", () => {
    // At 200% text on a 390x844 phone the band lands at y 687-792 and this
    // plate covers 698-812, so with the dock on top the species tabs were
    // behind it at landing and the page's one species control could not be
    // pressed until the visitor scrolled. The band is where the tabs live and
    // the dock is fixed, so the dock is the one that gives way.
    const { container } = renderFilters();

    const band = container
      .querySelector('[data-slot="mobile-toolbar"]')
      ?.parentElement;
    const dock = container.querySelector('[data-slot="mobile-filter-dock"]');
    expect(band?.className.split(" ")).toContain("z-40");
    expect(dock?.className.split(" ")).toContain("z-30");
  });

  it("keeps the sheet mounted for a homogeneous multi-result set, so the sort control stays reachable", async () => {
    // Three results, no facet with more than one value between them: every
    // group and toggle list is empty, exactly what a shelter's single-species
    // roster produces. hasFilterSheet used to read only those facets, so the
    // dock (and the sort control living inside its sheet) vanished here even
    // though there was still an order to pick.
    renderFilters({ ...ORDER_ONLY, ...NO_SHELTERS });

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(await screen.findByRole("combobox")).toBeTruthy();
  });

  it("hides the order-only trigger at md only while the toolbar stays pinned", () => {
    // The state above, asked the other question. The order is the sheet's one
    // reason to exist here and the toolbar draws the order itself from md, so
    // the trigger stands down there rather than opening on a title, a footer
    // and nothing between them. With no picker to keep it company the plate
    // goes with it. Classes and not measurements, because jsdom resolves no
    // breakpoint and these are the whole of the rule.
    //
    // Width and height both: a landscape phone is wide enough for the
    // toolbar's copy of the sort control and short enough that the toolbar
    // unpins and scrolls away with the page, so the sheet keeps its own sort
    // row there and the trigger that opens it has to stay (filter-sheet.tsx).
    renderFilters({ ...ORDER_ONLY, ...NO_SHELTERS });

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).toContain("md:not-short:hidden");
    expect(
      screen.getByRole("button", { name: "Filters" }).className.split(" "),
    ).toContain("md:not-short:hidden");
  });

  it("leaves the picker the whole plate where the order-only sheet stands down", () => {
    // The same order-only state with a shelter left to pick. The trigger goes
    // and the picker stays, so the plate stays with it and needs no second
    // rule to fill: a flex item that is not drawn is not an item, and the
    // picker's flex-1 takes the row on its own (animal-filters.tsx).
    renderFilters(ORDER_ONLY);

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).not.toContain("md:not-short:hidden");
    expect(
      screen.getByRole("button", { name: "Filters" }).className.split(" "),
    ).toContain("md:not-short:hidden");
  });

  it("keeps the trigger at every size once a filter is on, order or no order", () => {
    // Three results and a shelter picked, so the order and the way back out
    // are both reasons to open. The order is the only one that runs out, so
    // it is the last answer the sheet tries: a picked shelter has the Kje row
    // and the footer's clear, drawn at every size below lg, and the trigger
    // has to be there at every one of them.
    renderFilters({
      ...ORDER_ONLY,
      filters: { ...EMPTY_FILTERS, shelter: ["test"] },
      shelterTally: new Map([["test", 3]]),
    });

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).not.toContain("md:not-short:hidden");
    expect(
      screen
        .getByRole("button", { name: "Filters, 1 active" })
        .className.split(" "),
    ).not.toContain("md:not-short:hidden");
  });

  it("keeps the sheet mounted at zero results while a filter is on", async () => {
    // The other flat state, and the worse one: the Ostale tab with a shelter
    // picked matches nothing, so every facet is empty and resultCount is 0
    // rather than the >1 the clause above holds on. The sheet went with it,
    // and with the sheet went the sort control and the shelter chips inside
    // it, in the one state a visitor is looking for a way back out. A filter
    // is on here, so there is something in the sheet to take off.
    renderFilters({
      filters: { ...EMPTY_FILTERS, shelter: ["test"] },
      speciesTally: { all: 0, dog: 0, cat: 0, other: 0 },
      speciesRoster: { all: 1, dog: 0, cat: 0, other: 1 },
      shelterTally: new Map([["test", 0]]),
      resultCount: 0,
    });

    // The toolbar's own sort is gone with the results, on the same guard the
    // desktop row keeps: nothing is left for an order to apply to.
    const mobileToolbar = document.querySelector(
      '[data-slot="mobile-toolbar"]',
    ) as HTMLElement;
    expect(within(mobileToolbar).queryByRole("combobox")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Filters, 1 active" }));

    expect(await screen.findByRole("combobox")).toBeTruthy();
  });

  it("keeps the species tabs and a 44px sort control in the mobile toolbar", () => {
    renderFilters({
      speciesTally: { all: 2, dog: 1, cat: 1, other: 0 },
      speciesRoster: { all: 2, dog: 1, cat: 1, other: 0 },
      ...SEX_GROUP,
      shelterTally: new Map([["test", 2]]),
      resultCount: 2,
    });

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
    // utility that grows the tap target around the drawing. Gated on the
    // pointer and not the width: measured at 1180x820 with a coarse pointer
    // every tab was 28px, because the copy drawn there is the desktop one and
    // the width gate had already let go.
    expect(mobileTab.className).toContain("pointer-coarse:tap-target");

    // Sort is on this row too, from md up. At 768 the row is 720px and the
    // tabs end at 384, so the 336px after them were empty while the tablet
    // had no sort control on screen at all; on a phone the tabs still take
    // the row and the sheet behind the dock keeps the order.
    //
    // Scoped to the mobile branch: only CSS separates the two toolbars, so
    // jsdom renders the desktop one too and its Select is a real combobox.
    // jsdom resolves no breakpoint either, so the band this control is drawn
    // in is asserted on the classes rather than on what is visible.
    const mobileSort = within(mobileToolbar).getByRole("combobox");
    const sortClasses = mobileSort.className.split(" ");
    expect(sortClasses).toContain("max-md:hidden");
    expect(sortClasses).toContain("short:hidden");
    expect(sortClasses).toContain("shrink-0");
    // The row only becomes a flex box at md. Below it the strip's -my-2/py-2
    // collapse through this block and hold the row at 44px; flex at every
    // width measures the 28px margin box instead and the phone loses 16px.
    expect(mobileToolbar.className).toContain("md:flex");
    expect(mobileToolbar.className).not.toMatch(/(^|\s)flex(\s|$)/);
    expect(mobileToolbar.className).toContain("md:min-h-11");
    // And the tabs keep the rest of it, in the same min-w-0 box the desktop
    // toolbar wraps them in, so the strip can still scroll inside the row.
    const tabsBox = mobileTab.closest('[data-slot="mobile-toolbar"] > div');
    expect(tabsBox?.className).toContain("min-w-0");
    // The chips row is not in the bar. It states the filters below lg now,
    // but under the band and in flow (the test below), not inside a sticky
    // header that would hold its height for the whole scroll and push the
    // grid down the moment a filter landed.
    expect(
      within(mobileToolbar).queryByRole("toolbar", { name: /filter/i }),
    ).toBeNull();

    // The count is heard and not seen: its digits moved onto the tabs, but a
    // tab changing quietly announces nothing, so the live region stays.
    const live = document.querySelector("[aria-live]");
    expect(live?.textContent).toContain("2 animals");
    expect(live?.closest(".sr-only")).toBeTruthy();
  });

  it("states the filters under the band on a phone, wrapping and capped at five", () => {
    // Below lg the count on the Filtri button was the whole statement of what
    // was on. The row names the filters instead, in flow under the band: it
    // pushes the grid down once, where a row inside the sticky bar holds its
    // height for the whole scroll, and it wraps rather than laying a second
    // sideways scroller under the species strip.
    const six = FILTER_FACETS.slice(0, 6).map((facet) => ({
      key: `${facet}:0`,
      facet,
      value: "0",
      label: `${facet}0`,
      onRemove: vi.fn(),
    }));
    const { container } = renderFilters({
      ...SEX_GROUP,
      chips: six,
      speciesTally: { all: 2, dog: 1, cat: 1, other: 0 },
      speciesRoster: { all: 2, dog: 1, cat: 1, other: 0 },
      shelterTally: new Map([["test", 2]]),
      resultCount: 2,
    });

    // This suite's share of the pair is where the row sits: outside the
    // sticky band and outside the toolbar the species strip rides in. What
    // each row holds is asserted next door (animal-grid.test.tsx), and the
    // caps themselves in filter-chips.test.tsx.
    const row = phoneRow(container);
    expect(row.className).toContain("lg:hidden");
    expect(row.closest('[class~="sticky"]')).toBeNull();
    expect(row.closest('[data-slot="mobile-toolbar"]')).toBeNull();

    // One assertion on the contents, because it is the one that says the two
    // rows are not the same row: five pills here against the band's eight.
    expect(
      within(row).getAllByRole("button", { name: /^Remove filter/ }),
    ).toHaveLength(5);
    expect(
      within(stickyRow(container)).getAllByRole("button", {
        name: /^Remove filter/,
      }),
    ).toHaveLength(6);
  });

  it("keeps a flick off the end of the tab strip out of the browser's back gesture", () => {
    renderFilters({
      speciesTally: { all: 2, dog: 1, cat: 1, other: 0 },
      speciesRoster: { all: 2, dog: 1, cat: 1, other: 0 },
      ...SEX_GROUP,
      shelterTally: new Map([["test", 2]]),
      resultCount: 2,
    });

    const mobileToolbar = document.querySelector(
      '[data-slot="mobile-toolbar"]',
    ) as HTMLElement;
    const strip = mobileToolbar.querySelector(
      "[data-scroll-strip]",
    ) as HTMLElement;

    // At 320 the strip is 360px inside 288, so reaching the fourth species
    // means flicking into the end of it, and an uncontained sideways
    // overscroll is handed to the browser as back/forward.
    expect(strip.className).toContain("overscroll-x-contain");

    // Bare buttons, so neither of these comes from ui/button. Walking
    // Vse -> Psi -> Mačke is the fastest double tap in the product.
    const mobileTab = within(mobileToolbar).getByRole("button", {
      name: /^Dogs/,
    });
    expect(mobileTab.className).toContain("touch-manipulation");
    expect(mobileTab.className).toContain("select-none");
  });

  it("announces the active filter count and keeps a mobile-sized close target", async () => {
    renderSheet({ activeCount: 2 });

    const trigger = screen.getByRole("button", {
      name: "Filters, 2 active",
    });
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    expect((await screen.findByRole("button", { name: "Close" })).className).toContain(
      "size-11",
    );

    // ui/drawer halves that button to 32px from sm, which is a width and not a
    // hand: on a 768 tablet and on a landscape phone the one way out of this
    // sheet that is not a gesture measured 32x32. The primitive is shared and
    // this is its only caller, so the override rides on the content.
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("[&>button]:pointer-coarse:size-11");
  });

  it("scrolls the body inside its own overflow element, separate from the drawer content", async () => {
    renderSheet();

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
    const { rerender } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Clear filters" }).hasAttribute("disabled"),
    ).toBe(true);

    rerender({ activeCount: 1 });

    expect(
      screen.getByRole("button", { name: "Clear filters" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("reveals initially active sheet sections and lets the visitor fold them", async () => {
    window.localStorage.clear();
    window.localStorage.setItem("posvoji:filter-sections", JSON.stringify({ size: false }));
    resetFilterSectionsStore();
    renderSheet({
      filters: { ...EMPTY_FILTERS, size: ["small"] },
      groups: [{ group: "size", options: [{ value: "small", label: "Small" }] }],
      counts: { ...emptyCounts, size: new Map([["small", 3]]) },
      activeCount: 1,
      resultCount: 3,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Filters, 1 active" }));
    const dialog = await screen.findByRole("dialog");
    const section = within(dialog).getByRole("button", { name: /^Size/ });
    expect(section.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByRole("button", { name: /^Small/ })).toBeTruthy();

    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("false");
    expect(section.textContent).toContain("Small");
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /^Small/ })).toBeNull());
    fireEvent.click(section);
    expect(section.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByRole("button", { name: /^Small/ })).toBeTruthy();
  });

  it("keeps the header outside the scrolling body", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const header = dialog.querySelector('[data-slot="filter-sheet-header"]');
    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(header).toBeTruthy();
    expect(scrollBody).toBeTruthy();
    expect(scrollBody?.contains(header as Node)).toBe(false);
  });

  it("keeps the sheet's sort row on short landscape screens where the toolbar scrolls away", async () => {
    // Below md or on a short viewport the sheet is the only sort placement.
    // From md in a taller viewport the sticky toolbar carries it instead. jsdom
    // resolves no breakpoint, so the band is asserted on the class.
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const sort = within(dialog).getByRole("combobox");
    expect(sort.className.split(" ")).toContain("md:not-short:hidden");
  });

  it("does not repeat the species tabs inside the sheet", async () => {
    // The sticky bar behind the trigger already carries them; a second copy
    // here used to cost the sheet 56px on top of an 85dvh takeover. What the
    // sheet states instead is the one species chosen, as a pill on its title
    // line (the tests below).
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "All" })).toBeNull();
  });

  it("draws no species pill while every species is shown", async () => {
    // On Vse every count in the sheet means what it says and there is no
    // scope to state, so the sheet is exactly what it was.
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector('[data-slot="species-scope"]')).toBeNull();
  });

  it("names the chosen species on the title line and sets it back to all", async () => {
    // A visitor who chose Ostale and opened the sheet found "Samica 0" with
    // nothing on screen saying the 0 was counted among two rabbits: the strip
    // behind the trigger is under the sheet at the top of the page and under
    // the overlay's blur once scrolled. The pill is the sheet's own statement
    // of its scope, in the pressed tab's token, and the x on it is the one
    // species action wanted from in here.
    const onSpeciesChange = vi.fn();
    renderSheet({
      filters: { ...EMPTY_FILTERS, species: "other" },
      onSpeciesChange,
    });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const pill = within(dialog).getByRole("button", {
      name: "Species: Other animals. Show all animals",
    });
    // The pill lives in the header block, which never scrolls, not in the
    // body under it: the step the report fails on is the sheet body scrolled
    // to a section whose counts make no sense without the species.
    expect(
      pill.closest('[data-slot="filter-sheet-header"]'),
    ).not.toBeNull();
    expect(pill.textContent).toBe("Other animals");
    expect(pill.querySelector("svg")).not.toBeNull();

    fireEvent.click(pill);

    expect(onSpeciesChange).toHaveBeenCalledWith("all");
  });

  it("clears filters, in the footer's own words", async () => {
    // "Clear filters" and not "Clear all": the species pill survives the
    // press (use-animal-filters.ts), and a button that says everything while
    // a dark pill beside it stays put is a button that lies.
    renderSheet({
      filters: { ...EMPTY_FILTERS, species: "cat" },
      activeCount: 1,
    });

    // The trigger names its count once a filter is on (filtersWithCount).
    fireEvent.click(await screen.findByRole("button", { name: "Filters, 1 active" }));

    const dialog = await screen.findByRole("dialog");
    // The premise: the pill is on screen beside the footer being argued about.
    expect(dialog.querySelector('[data-slot="species-scope"]')).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Clear filters" }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "Clear all" }),
    ).toBeNull();
  });

  it("moves focus inside the drawer content when it opens", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
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

  it("hands focus to the trigger that is on screen when the two have swapped", async () => {
    // The page mounts this dialog twice and hides one with CSS: the desktop
    // toolbar's instance and the mobile dock's (animal-filters.tsx). Rotating
    // a device past lg while the dialog is open swaps which of the two is
    // drawn, so the trigger that opened it can be display:none by the time it
    // closes, and radix's own restore then lands focus on the body.
    const picker = (deepLink: "desktop" | "mobile") => (
      <LocationPicker
        options={[{ value: "test", label: "Test shelter", city: "Ljubljana" }]}
        counts={new Map([["test", 1]])}
        selected={[]}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        resultCount={1}
        deepLink={deepLink}
      />
    );
    render(
      <I18nProvider locale="en">
        <>
          {picker("desktop")}
          {picker("mobile")}
        </>
      </I18nProvider>,
    );

    const [opened, other] = screen.getAllByRole("button", {
      name: /Shelter:/,
    });
    opened.focus();
    fireEvent.click(opened);
    expect(await screen.findByRole("dialog")).toBeTruthy();

    // The rotation, as the only part of it this component can see: one
    // trigger stops being drawn and the other starts. jsdom lays nothing out,
    // so both halves are stated here rather than inferred from a class.
    opened.getClientRects = () => [] as unknown as DOMRectList;
    other.getClientRects = () =>
      [{ width: 120, height: 32 }] as unknown as DOMRectList;

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    await waitFor(() => expect(document.activeElement).toBe(other));
  });

  it("gives a finger the whole pill at 44px rather than a circle inside it", () => {
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

    // There used to be a 24px circle inside a 28px pill, with the rest of the
    // pill inert, and below md an invisible 44px overlay over the circle that
    // reached into the next chip's row gap. What replaced it was the pill
    // itself as the target: one button, the press that takes the filter off.
    const pill = chipPill("Dogs");
    // The pointer and not the width: the bar's other controls ask the same
    // question now, and at 1180x820 with a coarse pointer every pill in this
    // row measured 28px while a 1024px mouse window was getting 44.
    expect(pill.className).toContain("pointer-coarse:min-h-11");
    // One pill shape in the bar. rounded-full is reserved for counts now.
    expect(pill.className).toContain("rounded-ui");
    expect(pill.className).not.toContain("rounded-full");
    expect(pill.className).not.toContain("tap-target");
    // No control inside a control.
    expect(pill.querySelector("button")).toBeNull();

    // And the row still keeps adjacent pills apart.
    expect(pill.parentElement?.parentElement?.className).toContain(
      "pointer-coarse:gap-2",
    );
  });

  it("lets a fullWidth species tab shrink and truncate instead of forcing the row past the sheet's padding", () => {
    render(
      <I18nProvider locale="en">
        <SpeciesTabs
          value="all"
          onChange={vi.fn()}
          counts={{ all: 4, dog: 1, cat: 1, other: 2 }}
          // No filters on in this harness, so the roster and the tally are
          // the same numbers.
          roster={{ all: 4, dog: 1, cat: 1, other: 2 }}
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

describe("the sheet's surfaces", () => {
  // The sidebar took the sex and size sections onto the row treatment the
  // rest of that column already wore. The sheet did not come with them: it
  // is three columns of a drawer with the room for tiles, and a tile is what
  // a thumb aims at there. One prop apart, same components, so this is the
  // half of the change that has to stay put.
  it("keeps the sex and size options as tiles", async () => {
    renderSheet({
      filters: { ...EMPTY_FILTERS, size: ["small"] },
      groups: [
        { group: "sex", options: [{ value: "male", label: "Male" }] },
        { group: "size", options: [{ value: "small", label: "Small" }] },
      ],
      counts: {
        ...emptyCounts,
        sex: new Map([["male", 1]]),
        size: new Map([["small", 1]]),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const dialog = await screen.findByRole("dialog");

    // Size folds by default in here now, the way it does in the panel
    // (use-filter-sections.ts), so its tiles are asked for before they are
    // read. Sex is open already.
    fireEvent.click(within(dialog).getByRole("button", { name: /^Size/ }));

    for (const name of [/^Male, /, /^Small, /]) {
      const option = within(dialog).getByRole("button", { name });
      expect(option.className).toContain("4.75rem");
      expect(option.className).not.toContain("border-transparent");
    }
  });
});
