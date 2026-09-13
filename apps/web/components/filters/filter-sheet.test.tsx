// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { getMessages } from "@/lib/i18n";
import { FilterSheet } from "./filter-sheet";

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

afterEach(() => cleanup());

const sl = getMessages("sl");

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

/** The sheet as a phone opens it, with nothing filtered. The sort row is the
 *  part these tests are about, so every list is empty: what is left in the
 *  header is the title, the caption and the control under it. */
async function openSheet() {
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
        onClearAll={vi.fn()}
        onToggle={vi.fn()}
        onToggleMany={vi.fn()}
        onToggleProperty={vi.fn()}
        onToggleManyProperties={vi.fn()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: sl.filters }));
  return screen.findByRole("dialog");
}

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
