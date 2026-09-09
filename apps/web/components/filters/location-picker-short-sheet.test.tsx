// @vitest-environment jsdom

import { resetNearbyOriginStore } from "@/hooks/use-nearby-origin";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleValues } from "@/lib/filters";
import { I18nProvider } from "@/components/i18n-provider";
import { LocationPicker } from "./location-picker";

// jsdom cannot measure clipping at 320x568 or 844x390. These tests preserve
// the structural protections: independent content views, scrollable content,
// and persistent controls outside every scrolling or hidden area. Browser
// checks cover the resulting dimensions and hit targets.

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
});

const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

async function openPicker() {
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    const toggleMany = (values: string[]) =>
      setSelected((current) => toggleValues(current, values));
    return (
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={selected}
          onToggle={(value) => toggleMany([value])}
          onToggleMany={toggleMany}
          resultCount={11}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");
}

const dialog = () => screen.getByRole("dialog");
const ground = () =>
  dialog().querySelector<HTMLElement>("[data-picker-stage]")!;
const stage = () => dialog().querySelector<HTMLElement>("[data-map-stage]")!;
const panel = () => dialog().querySelector<HTMLElement>("[data-picker-panel]")!;
const column = () => dialog().querySelector<HTMLElement>("[data-picker-panel-content]")!;
const list = () => dialog().querySelector<HTMLElement>("[data-picker-list-scroll]")!;

function declaration(element: Element, name: string): string | undefined {
  return element.className.split(/\s+/)
    .find((token) => token.startsWith(`[${name}:`))
    ?.slice(name.length + 2, -1);
}

describe("LocationPicker on a short viewport", () => {
  it("keeps search and shelter content scrollable without washing out their edges", async () => {
    await openPicker();
    expect(list().className).toContain("min-h-0");
    expect(list().className).toContain("flex-1");
    expect(list().className).toContain("overflow-y-auto");
    expect(column().className).toContain("overflow-y-auto");
    expect(list().className).not.toContain("fade-scroll");
    expect(column().contains(list())).toBe(true);
  });

  it("keeps the view switch outside both content areas and their scroll", async () => {
    await openPicker();
    const control = dialog().querySelector<HTMLElement>("[data-picker-view-switch]")!;
    const showMap = control.querySelector<HTMLElement>("[data-picker-show-map]")!;
    const showList = control.querySelector<HTMLElement>("[data-picker-show-list]")!;
    expect(panel().contains(control)).toBe(false);
    expect(stage().contains(control)).toBe(false);
    expect(column().contains(control)).toBe(false);
    expect(showList.getAttribute("aria-checked")).toBe("true");
    expect(stage().className).toContain("max-lg:hidden");

    fireEvent.click(showMap);
    expect(showMap.getAttribute("aria-checked")).toBe("true");
    expect(panel().className).toContain("max-lg:hidden");
    expect(stage().className).not.toContain("max-lg:hidden");
    fireEvent.click(showList);
    expect(panel().className).not.toContain("max-lg:hidden");
    expect(stage().className).toContain("max-lg:hidden");
  });

  it("keeps results outside either view with matching safe-area space", async () => {
    await openPicker();
    const action = screen.getByRole("button", { name: "Pokaži 11 živali" });
    const footer = action.closest<HTMLElement>("[data-picker-footer]")!;
    expect(footer.parentElement).toBe(ground());
    expect(panel().contains(footer)).toBe(false);
    expect(stage().contains(footer)).toBe(false);
    expect(footer.className).toContain("absolute");
    expect(footer.className).toContain("bottom-0");
    expect(footer.className).toContain("bg-background");
    expect(declaration(ground(), "--picker-footer-h")).toBe(
      "calc(var(--picker-footer-base)_+_env(safe-area-inset-bottom,0px))",
    );
    expect(footer.className).toContain(
      "pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]",
    );

    fireEvent.click(dialog().querySelector("[data-picker-show-map]")!);
    fireEvent.click(dialog().querySelector("[data-picker-collapse]")!);
    expect(footer.contains(action)).toBe(true);
    expect(footer.parentElement).toBe(ground());
    fireEvent.click(action);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
