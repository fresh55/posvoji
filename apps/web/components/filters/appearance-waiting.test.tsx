// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { EMPTY_FILTERS, facetCounts, careOptions, groupOptions, type Filters } from "@/lib/filters";
import { installFilterFoldSeams, openFilterSection } from "@/test/filter-folds";
import { FilterGroupList } from "./filter-groups";

installFilterFoldSeams();
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

function show(layout: "sheet" | "sidebar", locale: "sl" | "en", filters: Filters = EMPTY_FILTERS) {
  const onToggle = vi.fn();
  const onCare = vi.fn();
  const counts = facetCounts([], EMPTY_FILTERS, new Date("2026-09-21"));
  counts.coatColor.set("black", 2);
  counts.coatColor.set("white", 1);
  counts.coatColor.set("orange-white", 1);
  // Live, so the sidebar draws it: the palette leaves a zero-count colour out
  // the way every other section leaves out a zero-count row.
  counts.coatColor.set("multicolour", 1);
  counts.coatLength.set("long", 1);
  counts.waiting.set("over-1-year", 1);
  render(<I18nProvider locale={locale}>
    <FilterGroupList layout={layout} filters={filters}
      groups={(["coatColor", "coatLength", "waiting"] as const).map(group => ({ group, options: groupOptions(group, [], locale) }))}
      counts={counts} toggles={[]} toggleTally={new Map()} onToggle={onToggle} onToggleMany={vi.fn()}
      onToggleProperty={vi.fn()} onToggleManyProperties={vi.fn()}
      care={{ options: careOptions(locale), counts: new Map([["patient", 1]]), resultCount: 1, total: 3, onToggle: onCare, onToggleMany: vi.fn() }} />
  </I18nProvider>);
  return { onToggle, onCare };
}

describe.each(["sidebar", "sheet"] as const)("appearance and waiting in %s", layout => {
  it("starts appearance collapsed and exposes labelled colour, length, time and care controls", () => {
    const { onToggle, onCare } = show(layout, "sl");
    expect(screen.getByRole("button", { name: "Videz" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Črna,/ })).toBeNull();
    openFilterSection("Videz");
    expect(screen.getByText("Manjših lis pri barvi ne upoštevamo.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Barva" })).toBeTruthy();
    // Multicolour is three drawn wedges in both layouts. It was a
    // conic-gradient on a span, which printed as one muddy brown at the size
    // either layout gives it.
    const swatch = screen
      .getByRole("button", { name: /^Večbarvna,/ })
      .querySelector('[data-swatch="multicolour"]');
    expect(swatch?.querySelectorAll("path").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: /^Črna,/ }));
    expect(onToggle).toHaveBeenLastCalledWith("coatColor", "black");
    fireEvent.click(screen.getByRole("button", { name: /^Oranžno-bela,/ }));
    expect(onToggle).toHaveBeenLastCalledWith("coatColor", "orange-white");
    fireEvent.click(screen.getByRole("button", { name: /^Dolga,/ }));
    expect(onToggle).toHaveBeenLastCalledWith("coatLength", "long");
    openFilterSection("Čas v zavetišču");
    fireEvent.click(screen.getByRole("button", { name: /^Nad 1 leto,/ }));
    expect(onToggle).toHaveBeenLastCalledWith("waiting", "over-1-year");
    openFilterSection("Lahko ponudim");
    fireEvent.click(screen.getByRole("button", { name: /^Potrpežljivost,/ }));
    expect(onCare).toHaveBeenCalledWith("patient");
  });

  it("shows English labels and allows a selected zero-result colour to be removed", () => {
    const { onToggle } = show(layout, "en", { ...EMPTY_FILTERS, coatColor: ["orange"] });
    openFilterSection("Appearance");
    const selected = screen.getByRole("button", { name: /^Orange,/ }) as HTMLButtonElement;
    expect(selected.disabled).toBe(false);
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(selected);
    expect(onToggle).toHaveBeenCalledWith("coatColor", "orange");
    // Videz answers a zero-count option the way every other section does now:
    // the sheet greys the tile out, the sidebar leaves the row out. Before,
    // it was the one block that drew dead rows in the column.
    const brown = screen.queryByRole("button", { name: /^Brown,/ });
    if (layout === "sheet") {
      expect((brown as HTMLButtonElement).disabled).toBe(true);
    } else {
      expect(brown).toBeNull();
    }
  });
});
