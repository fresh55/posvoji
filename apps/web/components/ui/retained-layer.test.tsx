// @vitest-environment jsdom

import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "./drawer";
import { I18nProvider } from "@/components/i18n-provider";
import { FilterSheetContent } from "@/components/filters/filter-sheet-content";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";

const EXIT_MS = 500;
let reduced = false;
let scrollDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    matches: reduced && media === "(prefers-reduced-motion: reduce)",
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(async () => {
  cleanup();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (scrollDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

function EffectProbe({ mounted, cleaned }: { mounted: () => void; cleaned: () => void }) {
  useEffect(() => {
    mounted();
    return cleaned;
  }, [mounted, cleaned]);
  return null;
}

function Fixture({ mounted, cleaned }: {
  mounted: () => void;
  cleaned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const fields = <>
    <label>Remembered value<input aria-label="Remembered value" defaultValue="initial" /></label>
    <EffectProbe mounted={mounted} cleaned={cleaned} />
  </>;
  return (
    <main data-testid="background">
      <a href="#background">Background link</a>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild><button>Open retained panel</button></DrawerTrigger>
        <DrawerContent retainWhileClosed={{ open }} closeLabel="Close retained panel">
          <DrawerTitle>Retained panel</DrawerTitle>
          <DrawerDescription>A real modal with a retained field.</DrawerDescription>
          {fields}
        </DrawerContent>
      </Drawer>
    </main>
  );
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // Radix returns focus on a task after Activity cleans up its FocusScope.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}

function expectPageReleased() {
  expect(screen.getByTestId("background").closest('[aria-hidden="true"]')).toBeNull();
  expect(document.body.style.pointerEvents).not.toBe("none");
  expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Remembered value" })).toBeNull();
  expect(screen.getByRole("link", { name: "Background link" })).not.toBeNull();
}

describe("retained drawer modal lifecycle", () => {
  it("retains the actual DOM and input state while releasing hidden effects and returning focus", async () => {
    const mounted = vi.fn();
    const cleaned = vi.fn();
    render(<Fixture mounted={mounted} cleaned={cleaned} />);
    const trigger = screen.getByRole("button", { name: "Open retained panel" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Retained panel" });
    const field = within(panel).getByRole("textbox", { name: "Remembered value" }) as HTMLInputElement;
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(screen.getByTestId("background").closest('[aria-hidden="true"]')).not.toBeNull();
    expect(document.body.style.pointerEvents).toBe("none");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
    fireEvent.change(field, { target: { value: "kept after close" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close retained panel" }));
    await advance(EXIT_MS);
    expect(panel.isConnected).toBe(true);
    expectPageReleased();
    expect(cleaned).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Retained panel" });
    expect(reopened).toBe(panel);
    expect(within(reopened).getByRole("textbox", { name: "Remembered value" })).toBe(field);
    expect(field.value).toBe("kept after close");
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("cancels pending hiding when reopened during the exit", async () => {
    const mounted = vi.fn();
    const cleaned = vi.fn();
    render(<Fixture mounted={mounted} cleaned={cleaned} />);
    const trigger = screen.getByRole("button", { name: "Open retained panel" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Retained panel" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close retained panel" }));
    await advance(Math.floor(EXIT_MS / 2));
    fireEvent.click(trigger);
    await advance(EXIT_MS + 50);
    expect(screen.getByRole("dialog", { name: "Retained panel" })).toBe(panel);
    expect(cleaned).not.toHaveBeenCalled();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("releases the closed panel promptly under reduced motion", async () => {
    reduced = true;
    render(<Fixture mounted={vi.fn()} cleaned={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Open retained panel" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Retained panel" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close retained panel" }));
    await advance(0);
    expect(panel.isConnected).toBe(true);
    expectPageReleased();
    expect(document.activeElement).toBe(trigger);
  });
});

it("reopens the actual retained filter sheet with its nested SortPicker collapsed", async () => {
  const counts = Object.fromEntries(GROUPS.map((group) => [group, new Map()])) as Record<MultiGroup, Map<string, number>>;
  const content = (open: boolean) => (
    <I18nProvider locale="sl">
      <main data-testid="background">
        <a href="#background">Background link</a>
        <FilterSheetContent
          open={open}
          onOpenChange={vi.fn()}
          trigger={<button>Open actual filters</button>}
          filters={EMPTY_FILTERS}
          groups={[]}
          counts={counts}
          toggles={[]}
          toggleTally={new Map()}
          activeCount={0}
          resultCount={3}
          sort="longest-in-shelter"
          onSortChange={vi.fn()}
          onSpeciesChange={vi.fn()}
          speciesTally={{ all: 0, dog: 0, cat: 0, other: 0 }}
          speciesRoster={{ all: 0, dog: 0, cat: 0, other: 0 }}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          onToggleProperty={vi.fn()}
          onToggleManyProperties={vi.fn()}
          onClearAll={vi.fn()}
        />
      </main>
    </I18nProvider>
  );
  const view = render(content(true));
  const panel = screen.getByRole("dialog");
  fireEvent.keyDown(within(panel).getByRole("combobox"), { key: "ArrowDown" });
  await advance(0);
  expect(screen.getByRole("listbox")).not.toBeNull();
  // The parent closing for Back does not blur or resize the nested dropdown.
  view.rerender(content(false));
  await advance(500);
  expect(panel.isConnected).toBe(true);
  expectPageReleased();
  expect(screen.queryByRole("listbox")).toBeNull();
  view.rerender(content(true));
  await advance(50);
  expect(screen.getByRole("dialog")).toBe(panel);
  expect(within(panel).getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(document.body.getAttribute("data-scroll-locked")).toBe("1");
  expect(panel.contains(document.activeElement)).toBe(true);
});
