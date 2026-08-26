// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import {
  resetNearbyOriginStore,
  usePublishNearbyOrigin,
} from "@/hooks/use-nearby-origin";
import { EMPTY_FILTERS, GROUPS, type MultiGroup } from "@/lib/filters";
import type { ResolvedOrigin } from "@/lib/origin";
import type { Chip } from "./filter-chips";
import { FilterSheet } from "./filter-sheet";
import { FilterSidebar } from "./filter-sidebar";

// The Kje row, in the two panels that draw it. Where shelter used to live only
// behind the map's own trigger, both panels now open with the question, and a
// phone can take a picked shelter off without going back into the map.

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

afterEach(() => cleanup());

const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

// One registry shelter with nothing listed, so the roster the label counts
// against is three and not two.
const offSite = [{ value: "vzhod", label: "Zavetišče Vzhod", city: "Celje" }];

const emptyCounts = Object.fromEntries(
  GROUPS.map((group) => [group, new Map()]),
) as Record<MultiGroup, Map<string, number>>;

const filterActions = {
  onToggle: vi.fn(),
  onToggleMany: vi.fn(),
  onToggleProperty: vi.fn(),
  onToggleManyProperties: vi.fn(),
};

function renderSidebar({
  selected = [] as string[],
  onToggleMany = vi.fn(),
} = {}) {
  render(
    <I18nProvider locale="sl">
      <FilterSidebar
        filters={{ ...EMPTY_FILTERS, shelter: selected }}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        scope={{ options, counts, offSite, resultCount: 11 }}
        onClearAll={vi.fn()}
        {...filterActions}
        onToggleMany={onToggleMany}
      />
    </I18nProvider>,
  );
  return screen.getByRole("button", { name: /Zavetišče:/ });
}

function shelterChip(value: string, label: string, onRemove: () => void): Chip {
  return { key: `shelter:${value}`, facet: "shelter", value, label, onRemove };
}

function renderSheet({
  selected = [] as string[],
  chips = [] as Chip[],
  onOpen = vi.fn(),
  onReset = vi.fn(),
} = {}) {
  render(
    <I18nProvider locale="sl">
      <FilterSheet
        sort="longest-in-shelter"
        onSortChange={vi.fn()}
        filters={{ ...EMPTY_FILTERS, shelter: selected }}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        scope={{
          options,
          counts,
          offSite,
          selected,
          chips,
          onOpen,
          onReset,
        }}
        activeCount={selected.length}
        resultCount={11}
        onClearAll={vi.fn()}
        {...filterActions}
      />
    </I18nProvider>,
  );
}

async function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: /^Filtri/ }));
  return screen.findByRole("dialog");
}

describe("Kje scope row in the sidebar", () => {
  it("names the whole country until a shelter is picked", () => {
    const trigger = renderSidebar();

    expect(trigger.textContent).toContain("Vsa zavetišča");
    // The header is the panel's own, in the type every section above and below
    // it uses.
    const heading = screen.getByRole("heading", { name: "Kje" });
    expect(heading.className).toContain("uppercase");
  });

  it("counts the pick against the whole registry, off-roster shelters included", () => {
    const trigger = renderSidebar({ selected: ["jug"] });

    expect(trigger.textContent).toContain("1 od 3 zavetišč");
  });

  it("says how many once several are picked", () => {
    const trigger = renderSidebar({ selected: ["jug", "sever"] });

    expect(trigger.textContent).toContain("2 od 3 zavetišč");
  });

  it("opens the picker on press", async () => {
    const trigger = renderSidebar();

    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the attribute the browser tests locate the trigger by", () => {
    const trigger = renderSidebar();

    expect(trigger.hasAttribute("data-picker-trigger")).toBe(true);
  });

  it("drops the whole selection through Ponastavi", () => {
    const onToggleMany = vi.fn();
    renderSidebar({ selected: ["jug", "sever"], onToggleMany });

    fireEvent.click(
      screen.getByRole("button", { name: "Ponastavi izbor zavetišč" }),
    );

    expect(onToggleMany).toHaveBeenCalledWith("shelter", ["jug", "sever"]);
  });

  it("offers no reset while nothing is picked", () => {
    renderSidebar();

    // Present but hidden from the tree and untabbable, the way every other
    // section's reset waits for something to reset.
    expect(
      screen.queryByRole("button", { name: "Ponastavi izbor zavetišč" }),
    ).toBeNull();
  });

  it("draws no chips of its own: the sticky row above the grid has them", () => {
    renderSidebar({ selected: ["jug"] });

    expect(
      screen.queryByRole("button", { name: /^Odstrani filter/ }),
    ).toBeNull();
  });
});

describe("Kje scope row in the filter sheet", () => {
  it("sits above the first filter section", async () => {
    renderSheet();
    const dialog = await openSheet();

    const body = dialog.querySelector(".overflow-y-auto") as HTMLElement;
    expect(body.firstElementChild?.getAttribute("data-slot")).toBe(
      "location-scope-row",
    );
  });

  it("closes the drawer before asking for the map", async () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    renderSheet({ onOpen });

    fireEvent.click(screen.getByRole("button", { name: /^Filtri/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Zavetišče:/ }));

    // The drawer is on its way out and the map has not been asked for yet:
    // two focus traps and two scroll locks over one press is what the wait is
    // avoiding.
    expect(onOpen).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not nest the picker's own dialog inside the drawer", async () => {
    renderSheet();
    const dialog = await openSheet();

    const row = within(dialog).getByRole("button", { name: /Zavetišče:/ });
    expect(row.hasAttribute("data-picker-trigger")).toBe(false);
    expect(dialog.querySelector("[data-picker-stage]")).toBeNull();
  });

  it("takes a picked shelter off through its chip", async () => {
    const onRemove = vi.fn();
    renderSheet({
      selected: ["jug"],
      chips: [shelterChip("jug", "Jug", onRemove)],
    });
    const dialog = await openSheet();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Odstrani filter Jug" }),
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("folds the tail of a long selection behind a +N", async () => {
    renderSheet({
      selected: ["a", "b", "c", "d"],
      chips: ["A", "B", "C", "D"].map((label) =>
        shelterChip(label.toLowerCase(), label, vi.fn()),
      ),
    });
    const dialog = await openSheet();

    expect(
      within(dialog).queryByRole("button", { name: "Odstrani filter D" }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Pokaži še 1" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Odstrani filter D" }),
    ).toBeTruthy();
  });

  it("counts the picked shelters on the Filtri badge", () => {
    renderSheet({ selected: ["jug", "sever"] });

    expect(
      screen.getByRole("button", { name: "Filtri, aktivnih: 2" }),
    ).toBeTruthy();
  });
});

// The glyph grown into a strip, and the one-shot flash the strip's region
// gets when a fresh pick reaches it. The strip is still the row's single
// press target, so every assertion below reads it off the same trigger the
// tests above already locate by its "Zavetišče:" label.
function sidebarElement(selected: string[]) {
  return (
    <I18nProvider locale="sl">
      <FilterSidebar
        filters={{ ...EMPTY_FILTERS, shelter: selected }}
        groups={[]}
        counts={emptyCounts}
        toggles={[]}
        toggleTally={new Map()}
        scope={{ options, counts, offSite, resultCount: 11 }}
        onClearAll={vi.fn()}
        {...filterActions}
        onToggleMany={vi.fn()}
      />
    </I18nProvider>
  );
}

function pulseRegion(trigger: HTMLElement): Element | null {
  return trigger.querySelector("[data-minimap-celebration-region]");
}

describe("Kje strip", () => {
  it("draws the live glyph as one centered plate inside the single press target", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    // Two svgs live in the trigger: the plate and the map-pin affordance.
    // The plate is the one centered at plate height. Width follows the
    // country's own viewBox ratio; stretching the silhouette to the row's
    // width is exactly the regression this pins against.
    const plate = trigger.querySelector('svg[class*="self-center"]');
    expect(plate).not.toBeNull();
    expect(plate?.getAttribute("class")).not.toContain("w-full");
    expect(plate?.getAttribute("preserveAspectRatio")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Zavetišče:/ })).toHaveLength(
      1,
    );
  });

  it("asks for the detail only this size can carry", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
    const plate = trigger.querySelector('svg[class*="self-center"]');

    // Seams between the regions and a dot per shelter town. Both are the
    // plate's own reading; the picker's 16px trigger draws neither.
    expect(
      plate
        ?.querySelector("[data-minimap-region-state]")
        ?.getAttribute("class"),
    ).toContain("stroke-background");
    expect(plate?.querySelectorAll("[data-minimap-town-dot]").length).toBe(3);
  });

  it("frames the country rather than outlining it", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
    const plate = trigger.querySelector('svg[class*="self-center"]');

    // The rim came down from 2.5 units of foreground/70 once the seams
    // carried the structure inside it.
    expect(plate?.getAttribute("class")).toContain("text-foreground/60");
    const outline = plate?.querySelector("path[stroke-linecap]");
    expect(outline?.getAttribute("stroke-width")).toBe("2");
  });
});

describe("Kje row invitation", () => {
  it("asks for a pick while nothing is picked", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    expect(trigger.textContent).toContain("Izberi zavetišča na zemljevidu");
  });

  it("drops the invitation once a shelter is picked", () => {
    render(sidebarElement(["jug"]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    expect(trigger.textContent).not.toContain("Izberi zavetišča");
  });

  it("names what the press opens, beside the pin the chips already wear", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    const caption = within(trigger).getByText("Zemljevid");
    expect(caption.querySelector("svg")).not.toBeNull();
    // The aria contract is the button's own label; the caption and its glyph
    // are decoration inside it.
    expect(trigger.getAttribute("aria-label")).toContain("Odpri zemljevid");
  });
});

describe("Kje scope sentence crossfade", () => {
  function labelNode(trigger: HTMLElement, text: string): HTMLElement {
    return within(trigger).getByText(text);
  }

  it("paints the first sentence settled rather than fading it in", () => {
    render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    // A mount that starts at opacity 0 is the hydration flicker this guards
    // against: the boundary carries initial={false}, so the first sentence is
    // simply there.
    const settled = labelNode(trigger, "Vsa zavetišča").style.opacity;
    expect(settled === "" || settled === "1").toBe(true);
  });

  it("fades the next sentence in when the selection changes", () => {
    const { rerender } = render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    rerender(sidebarElement(["jug"]));

    expect(labelNode(trigger, "1 od 3 zavetišč").style.opacity).toBe("0");
  });
});

describe("Kje strip celebration pulse", () => {
  it("does not pulse on mount, even when the selection already holds a pick", () => {
    render(sidebarElement(["jug"]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    expect(pulseRegion(trigger)).toBeNull();
  });

  it("pulses the newest pick's region once the selection grows by exactly one", () => {
    const { rerender } = render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
    expect(pulseRegion(trigger)).toBeNull();

    rerender(sidebarElement(["jug"]));

    expect(pulseRegion(trigger)).not.toBeNull();
  });

  it("stays quiet when several picks land in the same update", () => {
    const { rerender } = render(sidebarElement([]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    rerender(sidebarElement(["jug", "sever"]));

    expect(pulseRegion(trigger)).toBeNull();
  });

  it("stays quiet when a pick is removed rather than added", () => {
    const { rerender } = render(sidebarElement(["jug", "sever"]));
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    rerender(sidebarElement(["jug"]));

    expect(pulseRegion(trigger)).toBeNull();
  });
});

describe("Kje row origin hint", () => {
  afterEach(() => act(() => resetNearbyOriginStore()));

  // The writer the row listens to, standing in for the picker's nearby
  // control. Rendered alongside the sidebar the way the real picker is
  // mounted beside it.
  function Granting({ resolved }: { resolved: ResolvedOrigin }) {
    usePublishNearbyOrigin(resolved);
    return null;
  }

  it("names a typed origin in the colon shape", async () => {
    renderSidebar();
    render(
      <Granting
        resolved={{
          at: { lat: 46.23, lon: 15.26 },
          source: "typed",
          label: "Celje",
        }}
      />,
    );

    expect(await screen.findByText("Izhodišče: Celje")).toBeTruthy();
  });

  it("stays silent for a geolocation fix, which carries no words", () => {
    renderSidebar();
    render(
      <Granting
        resolved={{ at: { lat: 46.05, lon: 14.51 }, source: "geolocation" }}
      />,
    );

    expect(screen.queryByText(/Izhodišče:/)).toBeNull();
  });

  it("shows nothing while nobody has granted an origin", () => {
    renderSidebar();

    expect(screen.queryByText(/Izhodišče:/)).toBeNull();
  });
});
