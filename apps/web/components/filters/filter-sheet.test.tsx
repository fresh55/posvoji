// @vitest-environment jsdom

import { type ComponentProps } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { getMessages } from "@/lib/i18n";
import { installFilterFoldSeams } from "@/test/filter-folds";
import { FilterSheet } from "./filter-sheet";
// The sheet's body is a chunk the first press fetches (filter-sheet.tsx).
// Imported here it loads while the file is collected, which has no time
// limit. Under the full suite, loading it inside the first test took longer
// than that test's five seconds.
import "./filter-sheet-content";

// vaul asks the viewport about itself; jsdom answers nothing, which is the
// phone case this sheet is drawn for.
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

const sl = getMessages("sl");

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

/** The sheet as a phone opens it, with nothing filtered. The sort row is the
 *  part most of these tests are about, so every list is empty by default:
 *  what is left is the title in the header and the caption and the control at
 *  the top of the body. The fold tests below pass sections in. */
function renderSheet(
  overrides: Partial<ComponentProps<typeof FilterSheet>> = {},
) {
  return render(
    <I18nProvider locale="sl">
      <FilterSheet
        sort="longest-in-shelter"
        onSortChange={vi.fn()}
        filters={EMPTY_FILTERS}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        activeCount={0}
        resultCount={3}
        onSpeciesChange={vi.fn()}
        onClearAll={vi.fn()}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        onToggleProperty={vi.fn()}
        onToggleManyProperties={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  );
}

/** Presses the trigger and hands back the sheet.
 *
 *  The act awaits nothing but the press. It used to await the chunk too, and
 *  a test that timed out inside it left React's act scope open: every render
 *  after that, in every later test in the file, queued behind it and drew
 *  nothing, so one slow test failed the whole file. The chunk is already
 *  loaded (the import at the top), so the sheet it resolves to still lands
 *  inside this act. */
async function openSheet(
  overrides: Partial<ComponentProps<typeof FilterSheet>> = {},
) {
  renderSheet(overrides);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: sl.filters }));
  });
  return screen.findByRole("dialog");
}

/** Spol and Velikost, one option each: the first opens by default and the
 *  second does not, which is what the fold tests below read. */
const SEX_AND_SIZE: Partial<ComponentProps<typeof FilterSheet>> = {
  groups: [
    { group: "sex", options: [{ value: "male", label: "Samec" }] },
    { group: "size", options: [{ value: "small", label: "Majhna" }] },
  ],
  counts: {
    ...emptyCounts,
    sex: new Map([["male", 1]]),
    size: new Map([["small", 1]]),
  },
};

describe("FilterSheet and the back gesture", () => {
  it("opens on a history entry of its own and closes when that entry pops", async () => {
    // Without the entry, one back from the open sheet left the results page
    // and took the filter with it, and on a tab that opened on the list it
    // closed the tab.
    const dialog = await openSheet();
    expect(typeof window.history.state?.locationPicker).toBe("string");

    // The Android back button and the iOS edge swipe, as the hook sees them:
    // the entry it pushed is no longer the current one.
    act(() => {
      window.history.replaceState({}, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    });

    await waitFor(() =>
      expect(dialog.getAttribute("data-state")).not.toBe("open"),
    );
  });
});

describe("FilterSheet sort caption", () => {
  it("says what the row at the top of the body does", async () => {
    // Without it the sheet opened on a bordered full-width select directly
    // under "Filtri", showing an order and a glyph and nothing saying it
    // ordered the list rather than narrowing it.
    const dialog = await openSheet();

    const caption = within(dialog).getByText(sl.sortCaption);
    expect(caption.textContent).toBe(sl.sortCaption);
    // And it leaves with the control, on the block holding both, so no label
    // is left standing over a control the toolbar has taken over, and neither
    // leaves on a landscape phone, where that toolbar scrolls away.
    const block = caption.closest('[data-slot="sheet-sort"]');
    expect(block?.contains(within(dialog).getByRole("combobox"))).toBe(true);
    expect(block?.className.split(" ")).toContain("md:not-short:hidden");
  });

  it("scrolls away with the sections instead of standing over them", async () => {
    // Pinned in the header, the caption and the control took 78px from the
    // sections for as long as the sheet was open: 388px of them were left at
    // 390x844, 189 at 320x568. At the top of the body, under the search that
    // leads it, they are what opens the sheet and what the first scroll takes
    // away.
    const dialog = await openSheet(SEX_AND_SIZE);

    const header = dialog.querySelector('[data-slot="filter-sheet-header"]');
    const body = dialog.querySelector(".overflow-y-auto");
    const block = dialog.querySelector('[data-slot="sheet-sort"]');
    expect(header?.contains(block)).toBe(false);
    expect(body?.firstElementChild?.getAttribute("role")).toBe("search");
    expect(body?.children[1]).toBe(block);
    expect(
      block?.compareDocumentPosition(
        within(dialog).getByRole("button", { name: /^Spol/ }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("names the control with the caption and the current order", async () => {
    const dialog = await openSheet();

    const caption = within(dialog).getByText(sl.sortCaption);
    const sort = within(dialog).getByRole("combobox");
    expect(sort.getAttribute("aria-labelledby")).toContain(caption.id);
    // The name a screen reader reads off the trigger: the word for sorting
    // from the caption, the order from the value the trigger draws.
    expect(
      within(dialog).getByRole("combobox", {
        name: (name: string) =>
          name.includes(sl.sortCaption) &&
          name.includes(sl.sortLongestInShelter),
      }),
    ).toBe(sort);
  });
});

describe("FilterSheet section folds", () => {
  it("folds the sections a visitor did not ask for, on the panel's defaults", async () => {
    // The sheet used to expand every section into whatever a phone had left:
    // 1586px of body in a 388px window at 390x844, 1649px in 189px at
    // 320x568, six to eight section names never seen. It folds on the same
    // defaults the panel uses, so Spol is open and Velikost is not.
    const dialog = await openSheet(SEX_AND_SIZE);

    const sex = within(dialog).getByRole("button", { name: /^Spol/ });
    expect(sex.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(dialog).getByRole("button", { name: /^Samec/ }),
    ).toBeTruthy();

    const size = within(dialog).getByRole("button", { name: /^Velikost/ });
    expect(size.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(dialog).queryByRole("button", { name: /^Majhna/ }),
    ).toBeNull();
    // And the header says what a closed section holds, so a body under the
    // fold is the only thing hidden.
    expect(size.getAttribute("aria-controls")).toBeTruthy();
  });

  it("opens a folded section from its header", async () => {
    const dialog = await openSheet(SEX_AND_SIZE);

    const size = within(dialog).getByRole("button", { name: /^Velikost/ });
    fireEvent.click(size);

    expect(size.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(dialog).getByRole("button", { name: /^Majhna/ }),
    ).toBeTruthy();
  });

  it("keeps the section's own reset in an open section", async () => {
    // The fold moves this button from the header's flex row to an absolute
    // place in it, which is the one thing about the sheet's sections the fold
    // changes besides the fold itself.
    // The section's own `active` is its selection and not the sheet's count,
    // so the trigger's name stays the plain one openSheet presses.
    const dialog = await openSheet({
      ...SEX_AND_SIZE,
      filters: { ...EMPTY_FILTERS, sex: ["male"] },
    });

    expect(
      within(dialog).getByRole("button", { name: sl.resetSexFilters }),
    ).toBeTruthy();
  });
});

describe("FilterSheet trigger badge", () => {
  it("draws the count at every width", () => {
    // The badge used to start at 360px, with a dot standing in below that
    // because the number was said not to fit. It fits: at 320 the trigger
    // draws "Filtri 2" whole and the dock stays 320 wide, and the dot left a
    // sighted visitor on the narrowest phone with no way to learn how many
    // filters were on short of opening the sheet.
    renderSheet({ activeCount: 2 });

    const badge = document.querySelector('[data-slot="badge"]');
    expect(badge?.textContent).toBe("2");
    expect(badge?.className).not.toContain("min-[360px]");
    // And the dot it stood in for is gone with it. The trigger's own spans,
    // since the badge holds the rolling number's.
    expect(document.querySelectorAll('[data-slot="badge"]').length).toBe(1);
    expect(
      screen
        .getByRole("button", { name: /^Filtri/ })
        .querySelectorAll(":scope > span").length,
    ).toBe(1);
  });
});
