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

// The two placements, by the props each one is mounted with: the desktop
// toolbar's quiet trigger and the mobile sheet header's full-width control.
// See the component's own "Two placements, one control" note.
const PLACEMENTS = {
  "desktop toolbar": {},
  "mobile sheet header": { quiet: false, className: "mt-3 h-11 w-full" },
} as const;

function mount(
  resolved: ResolvedOrigin,
  props: Record<string, unknown> = {},
  value: Parameters<typeof SortPicker>[0]["value"] = "longest-in-shelter",
) {
  return render(
    <I18nProvider locale="sl">
      <GrantOrigin resolved={resolved} />
      <SortPicker value={value} onChange={vi.fn()} {...props} />
    </I18nProvider>,
  );
}

function openList() {
  const trigger = screen.getByRole("combobox");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.getAllByRole("option").map((option) => option.textContent);
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

describe("SortPicker fallback for a link with no origin", () => {
  it("names the default order on the trigger and does not crash", () => {
    mount(NOTHING, {}, "nearest");

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain(sl.sortLongestInShelter);
    expect(trigger.getAttribute("aria-label")).toBe(
      `${sl.sortBy}: ${sl.sortLongestInShelter}`,
    );
  });

  it("names nearest once the same link's visitor grants one", () => {
    mount(LJUBLJANA, {}, "nearest");

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain(sl.sortNearest);
    expect(trigger.getAttribute("aria-label")).toBe(
      `${sl.sortBy}: ${sl.sortNearest}`,
    );
  });
});
