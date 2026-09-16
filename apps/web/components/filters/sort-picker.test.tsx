// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  resetNearbyOriginStore,
  usePublishNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import { cityAt } from "@/lib/geo";
import type { ResolvedOrigin } from "@/lib/origin";
import { getMessages } from "@/lib/i18n";
import { SortPicker } from "./sort-picker";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// Radix opens the listbox into a portal it measures and scrolls; jsdom has
// neither an observer nor a layout engine to do it with. Same two stand-ins
// filter-sections.test.tsx puts up for the same reason.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  NoopResizeObserver as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

const sl = getMessages("sl");

// The place the picker's nearby control resolves to when somebody types a town
// into it. The store does not care which of the two sources granted the point,
// only that one did.
const LJUBLJANA: ResolvedOrigin = {
  at: cityAt("Ljubljana")!,
  source: "typed",
  label: "Ljubljana",
};
const NOTHING: ResolvedOrigin = { source: "none" };

// The writer, standing in for location-picker.tsx. It draws nothing: the whole
// of its contribution is the origin it publishes, which is exactly the shape
// the picker's own call has.
function GrantOrigin({ resolved }: { resolved: ResolvedOrigin }) {
  usePublishNearbyOrigin(resolved);
  return null;
}

// The id of the caption the filter sheet draws above its sort row, standing in
// for the sheet itself: the component takes the id and nothing else of it.
const CAPTION_ID = "sheet-sort-caption";

// The two dresses, by the props each one is mounted with: the quiet trigger
// the toolbar wears (on the desktop row and on the md-to-lg one, which mount
// it identically) and the sheet header's full-width control, which is drawn
// below md only and takes its name from the caption over it. See the
// component's own "Three placements, two dresses" note.
const PLACEMENTS = {
  "toolbar row": {},
  "mobile sheet header": {
    quiet: false,
    labelledBy: CAPTION_ID,
    className: "mt-1.5 h-11 w-full text-sm",
  },
} as const;

function mount(
  resolved: ResolvedOrigin,
  props: Record<string, unknown> = {},
  value: Parameters<typeof SortPicker>[0]["value"] = "longest-in-shelter",
) {
  return render(
    <I18nProvider locale="sl">
      <GrantOrigin resolved={resolved} />
      {typeof props.labelledBy === "string" ? (
        <div id={props.labelledBy}>{sl.sortCaption}</div>
      ) : null}
      <SortPicker value={value} onChange={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

function openOptions() {
  const trigger = screen.getByRole("combobox");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.getAllByRole("option");
}

function openList() {
  return openOptions().map((option) => option.textContent);
}

beforeEach(() => resetNearbyOriginStore());

afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
});

describe("SortPicker nearest option", () => {
  for (const [placement, props] of Object.entries(PLACEMENTS)) {
    it(`omits it in the ${placement} while nobody has granted an origin`, () => {
      mount(NOTHING, props);

      const options = openList();
      expect(options).not.toContain(sl.sortNearest);
      expect(options).toContain(sl.sortLongestInShelter);
    });

    it(`offers it in the ${placement} once an origin exists`, () => {
      mount(LJUBLJANA, props);

      expect(openList()).toContain(sl.sortNearest);
    });
  }

  it("keeps every other order on offer either way", () => {
    const { unmount } = mount(NOTHING);
    const without = openList();
    unmount();
    resetNearbyOriginStore();

    mount(LJUBLJANA);
    const with_ = openList();

    expect(with_).toEqual([...without, sl.sortNearest]);
  });
});

describe("SortPicker label placement", () => {
  for (const [placement, props] of Object.entries(PLACEMENTS)) {
    it(`gives the label the room between the icons in the ${placement}`, () => {
      mount(NOTHING, props);

      // The trigger is justify-between and the label is the middle of its
      // three children, so a trigger given a width to spread over -- w-full in
      // the sheet -- sent the icons to the ends and left the name floating in
      // the middle, reading as a caption. The value takes the room instead.
      // jsdom lays nothing out, so this is asserted on the classes, and on the
      // trigger rather than on the value: Radix drops the className handed to
      // SelectValue, so the rule has to come down the child variant the same
      // way ui/select.tsx dresses the value. Both placements carry it, and the
      // toolbar's w-fit trigger has no spare width for flex-1 to claim.
      const trigger = screen.getByRole("combobox");
      expect(trigger.className).toContain("*:data-[slot=select-value]:flex-1");
      expect(trigger.className).toContain("*:data-[slot=select-value]:min-w-0");
      expect(trigger.className).toContain(
        "*:data-[slot=select-value]:text-left",
      );
      // And the name still gives way rather than pushing the chevron off.
      const value = trigger.querySelector('[data-slot="select-value"]');
      expect(value?.querySelector("span")?.className).toContain("truncate");
    });
  }
});

describe("SortPicker visible caption", () => {
  it("says what the toolbar's trigger is, in front of the order", () => {
    mount(NOTHING);

    // Quiet in the toolbar, this trigger draws no border until it is hovered,
    // so without the word it is a phrase between a small arrow and a chevron.
    // On the home page that phrase comes to rest under Srečko's caption and
    // was read as a fact about the cat rather than as the order of the grid.
    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain(
      `${sl.sortCaption}:${sl.sortLongestInShelter}`,
    );
    // And it is the order that gives way inside the trigger, not the word in
    // front of it. jsdom lays nothing out, so this is asserted on the class.
    expect(screen.getByText(`${sl.sortCaption}:`).className).toContain(
      "shrink-0",
    );
  });

  it("leaves it to the caption above the sheet's", () => {
    mount(NOTHING, PLACEMENTS["mobile sheet header"]);

    // filter-sheet.tsx draws the same word over the row. Drawn here as well it
    // would be the second copy of it within 6px.
    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).not.toContain(`${sl.sortCaption}:`);
    expect(trigger.textContent).toContain(sl.sortLongestInShelter);
  });
});

describe("SortPicker menu heading", () => {
  it("names the list its options belong to", () => {
    mount(NOTHING);

    const options = openOptions();
    const label = screen.getByText(sl.sortBy);
    expect(label.dataset.slot).toBe("select-label");
    // Radix hands the label the group's own id and points the group back at
    // it, so the heading is announced with the list rather than as a line of
    // text that happens to sit above it.
    expect(
      label
        .closest('[data-slot="select-group"]')
        ?.getAttribute("aria-labelledby"),
    ).toBe(label.id);
    // A heading and not a seventh order: nothing focuses it and nothing picks
    // it.
    expect(label.getAttribute("role")).toBeNull();
    expect(label.hasAttribute("tabindex")).toBe(false);
    expect(options.map((option) => option.textContent)).not.toContain(
      sl.sortBy,
    );
  });
});

describe("SortPicker option rows", () => {
  it("keeps every option thumb-sized on a coarse pointer", () => {
    mount(LJUBLJANA);

    // The stock item measures 32px, which is what a phone was getting while
    // every other control in the filter sheet kept 44px. The floor asks the
    // pointer rather than the width, so a touch tablet past md gets it too.
    // jsdom lays nothing out, so it is asserted on the class that sets it.
    const options = openOptions();
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.className.split(" ")).toContain("pointer-coarse:min-h-11");
    }
  });
});

describe("SortPicker accessible name", () => {
  for (const [placement, props] of Object.entries(PLACEMENTS)) {
    it(`says both the sorting and the order in the ${placement}`, () => {
      mount(NOTHING, props);

      // Two ways to the same name, and both of them the words on screen. The
      // toolbar's trigger draws the word and the order and carries them again
      // in an aria-label, because a combobox takes no name from its contents.
      // The sheet's has a caption above it and borrows that, plus the value it
      // draws, through aria-labelledby. Either way a control showing an order
      // and two glyphs announces what it orders and where it stands.
      expect(
        screen.getByRole("combobox", {
          name: (name: string) =>
            name.includes(sl.sortCaption) &&
            name.includes(sl.sortLongestInShelter),
        }),
      ).toBeTruthy();
    });
  }
});

describe("SortPicker fallback for a link with no origin", () => {
  it("names the default order on the trigger and does not crash", () => {
    mount(NOTHING, {}, "nearest");

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain(sl.sortLongestInShelter);
    // The written name is the drawn one, word for word: a visitor speaking
    // the label at their machine says what the screen says.
    expect(trigger.getAttribute("aria-label")).toBe(
      `${sl.sortCaption}: ${sl.sortLongestInShelter}`,
    );
  });

  it("names nearest once the same link's visitor grants one", () => {
    mount(LJUBLJANA, {}, "nearest");

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain(sl.sortNearest);
    expect(trigger.getAttribute("aria-label")).toBe(
      `${sl.sortCaption}: ${sl.sortNearest}`,
    );
  });
});
