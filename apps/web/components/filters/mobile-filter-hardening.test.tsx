// @vitest-environment jsdom

import { type ComponentProps } from "react";
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
 *  the one reason it holds that runs out at md (filter-sheet.tsx). The tests
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
  it("spans the 320px viewport and shares the dock between both actions", () => {
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
      screen.getByRole("button", { name: "Filters, 1 active" }),
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

  it("takes the trigger and the plate away at md, where the order is all the sheet holds", () => {
    // The state above, asked the other question. The order is the sheet's one
    // reason to exist here and the toolbar draws the order itself from md, so
    // the trigger stands down at that width rather than opening on a title, a
    // footer and nothing between them. With no picker to keep it company the
    // plate goes with it. Classes and not measurements, because jsdom
    // resolves no breakpoint and these are the whole of the rule.
    renderFilters({ ...ORDER_ONLY, ...NO_SHELTERS });

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).toContain("md:hidden");
    expect(
      screen.getByRole("button", { name: "Filters" }).className.split(" "),
    ).toContain("md:hidden");
  });

  it("leaves the picker the whole plate where the order-only sheet stands down at md", () => {
    // The same order-only state with a shelter left to pick. The trigger goes
    // at md and the picker stays, so the plate stays with it and needs no
    // second rule to fill: a flex item that is not drawn is not an item, and
    // the picker's flex-1 takes the row on its own (animal-filters.tsx).
    renderFilters(ORDER_ONLY);

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).not.toContain("md:hidden");
    expect(
      screen.getByRole("button", { name: "Filters" }).className.split(" "),
    ).toContain("md:hidden");
  });

  it("keeps the trigger at every width once a filter is on, order or no order", () => {
    // Three results and a shelter picked, so the order and the way back out
    // are both reasons to open. The order is the only one that runs out at
    // md, so it is the last answer the sheet tries: a picked shelter has the
    // Kje row and the footer's clear, drawn at every width below lg, and the
    // trigger has to be there at every one of them.
    renderFilters({
      ...ORDER_ONLY,
      filters: { ...EMPTY_FILTERS, shelter: ["test"] },
      shelterTally: new Map([["test", 3]]),
    });

    const dock = document.querySelector('[data-slot="mobile-filter-dock"]');
    expect(dock?.className.split(" ")).not.toContain("md:hidden");
    expect(
      screen
        .getByRole("button", { name: "Filters, 1 active" })
        .className.split(" "),
    ).not.toContain("md:hidden");
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

    fireEvent.click(screen.getByRole("button", { name: "Filters, 1 active" }));

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
    // utility that grows the tap target around the drawing.
    expect(mobileTab.className).toContain("max-lg:tap-target");

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
    // A chips row would be the fourth surface stating the filter state on one
    // screen, so it is not in the bar either.
    expect(
      within(mobileToolbar).queryByRole("toolbar", { name: /filter/i }),
    ).toBeNull();

    // The count is heard and not seen: its digits moved onto the tabs, but a
    // tab changing quietly announces nothing, so the live region stays.
    const live = document.querySelector("[aria-live]");
    expect(live?.textContent).toContain("2 animals");
    expect(live?.closest(".sr-only")).toBeTruthy();
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
      screen.getByRole("button", { name: "Clear all" }).hasAttribute("disabled"),
    ).toBe(true);

    rerender({ activeCount: 1 });

    expect(
      screen.getByRole("button", { name: "Clear all" }).hasAttribute("disabled"),
    ).toBe(false);
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

  it("stands the sheet's sort row down from md, where the toolbar carries it", async () => {
    // Below md this row is the only way to change the order; from md the
    // toolbar behind the sheet has 336px spare and carries the same control,
    // and two triggers for one setting on one screen is one too many. jsdom
    // resolves no breakpoint, so the band is asserted on the class.
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    const sort = within(dialog).getByRole("combobox");
    expect(sort.className.split(" ")).toContain("md:hidden");
  });

  it("does not repeat the species tabs inside the sheet", async () => {
    // The sticky bar behind the trigger already carries them; a second copy
    // here used to cost the sheet 56px on top of an 85dvh takeover.
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "All" })).toBeNull();
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
    // lg and not md: the chips share a bar with the species tabs and the sort,
    // and those two grow their reach at lg. At md this one bar mixed 44px
    // targets with 28px ones across the tablet band.
    expect(removeDogs.className).toContain("max-lg:min-h-11");
    // One pill shape in the bar. rounded-full is reserved for counts now.
    expect(removeDogs.className).toContain("rounded-ui");
    expect(removeDogs.className).not.toContain("rounded-full");
    expect(removeDogs.className).not.toContain("tap-target");
    expect(removeDogs.querySelector("button")).toBeNull();

    // And the row still keeps adjacent pills apart.
    expect(removeDogs.closest("span")?.parentElement?.className).toContain(
      "max-lg:gap-2",
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
          // No filters on in this harness, so the roster and the tally are
          // the same numbers.
          roster={{ all: 4, dog: 1, cat: 1, other: 2 }}
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
