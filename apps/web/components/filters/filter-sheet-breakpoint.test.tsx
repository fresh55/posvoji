// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { DESKTOP_QUERY } from "@/hooks/use-desktop-breakpoint-close";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import { installFilterFoldSeams } from "@/test/filter-folds";
import { FilterSheet } from "./filter-sheet";
import type { FilterSheetProps } from "./filter-sheet-contract";
import { PICKER_HANDOFF_MS } from "./filter-sheet-content";

installFilterFoldSeams();

let desktop = false;
let desktopQuery: EventTarget;

beforeEach(() => {
  desktop = false;
  desktopQuery = new EventTarget();
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    get matches() { return media === DESKTOP_QUERY && desktop; },
    media,
    addEventListener: media === DESKTOP_QUERY
      ? desktopQuery.addEventListener.bind(desktopQuery) : vi.fn(),
    removeEventListener: media === DESKTOP_QUERY
      ? desktopQuery.removeEventListener.bind(desktopQuery) : vi.fn(),
  })));
  window.history.replaceState(null, "", "/");
});

afterEach(async () => {
  cleanup();
  // Let the history owner's queued pop finish before resetting the address.
  await new Promise((resolve) => setTimeout(resolve, 20));
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

function setDesktop(next: boolean) {
  desktop = next;
  const event = new Event("change");
  Object.defineProperty(event, "matches", { value: next });
  act(() => desktopQuery.dispatchEvent(event));
}

function sheet(overrides: Partial<FilterSheetProps> = {}) {
  return render(<I18nProvider locale="sl"><FilterSheet
    filters={EMPTY_FILTERS}
    groups={[]}
    counts={Object.fromEntries(GROUPS.map((group) => [group, new Map()])) as Record<MultiGroup, Map<string, number>>}
    toggles={[]}
    toggleTally={new Map()}
    activeCount={0}
    resultCount={3}
    sort="longest-in-shelter"
    onSortChange={vi.fn()}
    onSpeciesChange={vi.fn()}
    speciesTally={{ all: 3, dog: 3, cat: 0, other: 0 }}
    speciesRoster={{ all: 3, dog: 3, cat: 0, other: 0 }}
    onClearAll={vi.fn()}
    onToggle={vi.fn()}
    onToggleMany={vi.fn()}
    onToggleProperty={vi.fn()}
    onToggleManyProperties={vi.fn()}
    {...overrides}
  /></I18nProvider>);
}

async function openSheet() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Filtri" })));
  return screen.findByRole("dialog");
}

describe("retained filter sheet across the desktop breakpoint", () => {
  it("removes an already-closed retained panel and recreates it only on a later mobile open", async () => {
    sheet();
    const first = await openSheet();
    fireEvent.click(within(first).getByRole("button", { name: "Zapri" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(first.isConnected).toBe(true);

    setDesktop(true);
    expect(first.isConnected).toBe(false);
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
    setDesktop(false);
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
    const second = await openSheet();
    expect(second).not.toBe(first);

    fireEvent.click(within(second).getByRole("button", { name: "Zapri" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(second.isConnected).toBe(true);
    expect(await openSheet()).toBe(second);
  });

  it("tears down an open panel, releases its modal effects, and pops its history entry", async () => {
    sheet();
    const panel = await openSheet();
    expect(window.history.state?.locationPicker).toBeTruthy();
    setDesktop(true);
    expect(panel.isConnected).toBe(false);
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
    await waitFor(() => expect(window.history.state?.locationPicker).toBeUndefined());
    await waitFor(() => expect(document.body.hasAttribute("data-scroll-locked")).toBe(false));
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(screen.getByRole("button", { name: "Filtri" }).closest('[aria-hidden="true"]')).toBeNull();

    setDesktop(false);
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Filtri" }).getAttribute("aria-expanded")).toBe("false");
    const reopened = await openSheet();
    expect(reopened).not.toBe(panel);
    expect(reopened.contains(document.activeElement)).toBe(true);
  });

  it.each([false, true])("%s desktop transition preserves or cancels a pending picker handoff", async (toDesktop) => {
    const onOpen = vi.fn();
    sheet({ scope: {
      options: [{ value: "test-shelter", label: "Test shelter", city: "Ljubljana" }],
      counts: new Map([["test-shelter", 3]]),
      selected: [],
      chips: [],
      onOpen,
      onReset: vi.fn(),
    } });
    const panel = await openSheet();
    fireEvent.click(within(panel).getByRole("button", { name: /Izberi zavetišča/ }));
    if (toDesktop) setDesktop(true);
    await waitFor(() => expect(window.history.state?.locationPicker).toBeUndefined());
    if (toDesktop) {
      expect(panel.isConnected).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, PICKER_HANDOFF_MS + 50));
      expect(onOpen).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    }
  });
});
