// @vitest-environment jsdom

import { type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { getMessages } from "@/lib/i18n";
import { FilterSheet } from "./filter-sheet";
import { resetFilterSectionsStore } from "./use-filter-sections";

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

// jsdom lays nothing out and ships no scrollIntoView, so the pull into view a
// freshly opened section runs would throw from a timeout after the test that
// opened it. The fold also measures its own height, and motion restores the
// scroll position around the measurement.
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();

// The folds outlive a render, so a test that opened one would hand its state
// to the next.
beforeEach(() => {
  window.localStorage.clear();
  resetFilterSectionsStore();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetFilterSectionsStore();
});

const sl = getMessages("sl");

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

/** The sheet as a phone opens it, with nothing filtered. The sort row is the
 *  part most of these tests are about, so every list is empty by default:
 *  what is left in the header is the title, the caption and the control under
 *  it. The fold tests below pass sections in. */
async function openSheet(
  overrides: Partial<ComponentProps<typeof FilterSheet>> = {},
) {
  render(
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
  fireEvent.click(screen.getByRole("button", { name: sl.filters }));
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
  it("says what the row under the title does", async () => {
    // Without it the sheet opened on a bordered full-width select directly
    // under "Filtri", showing an order and a glyph and nothing saying it
    // ordered the list rather than narrowing it.
    const dialog = await openSheet();

    const caption = within(dialog).getByText(sl.sortCaption);
    expect(caption.textContent).toBe(sl.sortCaption);
    // And it leaves at exactly the width the row leaves at, so no label is
    // left standing over a control the toolbar has taken over.
    expect(caption.className.split(" ")).toContain("md:hidden");
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
