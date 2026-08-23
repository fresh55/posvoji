// @vitest-environment jsdom

import { useState, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toggleValues } from "@/lib/filters";
import { cityAt } from "@/lib/geo";
import { sheltersDropped } from "@/lib/labels";
import { OPEN_MUNICIPALITY_LOOKUP_EVENT } from "@/lib/found-animal";
import { SHELTER_SPOTLIGHT_EVENT } from "@/lib/shelter-spotlight";
import { I18nProvider } from "@/components/i18n-provider";
import { DENSITY_STEPS } from "@/lib/map-layout";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { LocationPicker } from "./location-picker";
import { REGION_DWELL_MS, ShelterMap, type ShelterPin } from "./shelter-map";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// jsdom has no layout, so it has no scrollIntoView. The picker brings the
// picked row and the card it just opened into view; neither is worth a layout
// engine to assert.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => cleanup());

// Alphabetical order puts Sever first, and Sever is the far one from
// Ljubljana, so a nearest-first sort has to visibly move it.
const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

// Registry shelters with nothing to filter by. Celje places on the map, so
// they also become the faint markers the legend explains.
const offSite = [{ value: "vzhod", label: "Zavetišče Vzhod", city: "Celje" }];

// Stateful for the same reason the pick-card harness below is: the card
// folds once nothing it stands for is selected, so toggles have to land in
// the next render's `selected` the way animal-grid's real handlers land them.
async function openPicker({
  selected: initialSelected = [],
  ...props
}: Partial<ComponentProps<typeof LocationPicker>> = {}) {
  function Harness() {
    const [selected, setSelected] = useState<string[]>(initialSelected);
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
          species="all"
          {...props}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");

  return screen.getByLabelText("Bližina: kraj ali pošta");
}

// The rows are the only buttons in the dialog carrying a shelter's name, so
// reading their text in document order reads the list's order.
function rowOrder(): string[] {
  return Array.from(screen.getByRole("dialog").querySelectorAll("button"))
    .map((button) => button.textContent ?? "")
    .filter((text) => text.includes("Zavetišče Sever") || text.includes("Zavetišče Jug"))
    .map((text) => (text.includes("Sever") ? "sever" : "jug"));
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

// A region is named only once the pointer has settled on it (REGION_DWELL_MS
// in shelter-map.tsx). Fake timers are installed for the dwell alone: opening
// the dialog above is an async find, and it has no business running on a
// frozen clock.
function hoverRegion(node: Element) {
  vi.useFakeTimers();
  fireEvent.pointerOver(node);
  act(() => {
    vi.advanceTimersByTime(REGION_DWELL_MS);
  });
  vi.useRealTimers();
}

describe("LocationPicker trigger", () => {
  it("draws the live mini-map instead of a static glyph", () => {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={11}
          species="all"
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("combobox", { name: /Zavetišče:/ });
    const svg = trigger.querySelector("svg")!;

    expect(svg).toBeTruthy();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("[data-minimap-region-state]")).toHaveLength(
      12,
    );
  });

  it("shows the selection accent on a selected shelter's region", () => {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={["jug"]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={7}
          species="all"
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("combobox", { name: /Zavetišče:/ });
    const selectedRegion = trigger.querySelector(
      '[data-minimap-region-state="selected"]',
    );

    expect(selectedRegion).toBeTruthy();
    expect(selectedRegion?.getAttribute("class")).toContain(
      "fill-[var(--filter-accent-strong)]",
    );
  });
});

describe("LocationPicker typed location", () => {
  it("keeps the given order until a location is typed", async () => {
    await openPicker();

    expect(rowOrder()).toEqual(["sever", "jug"]);
  });

  it("sorts the nearer shelter first once a postcode resolves", async () => {
    const input = await openPicker();

    type(input, "1000");

    expect(rowOrder()).toEqual(["jug", "sever"]);
  });

  it("sorts from a town typed by name, and names the match in the status line", async () => {
    const input = await openPicker();

    type(input, "ajdovscina");

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(
      screen.getByText("Izhodišče: Ajdovščina. Razvrščeno po bližini."),
    ).toBeTruthy();
  });

  it("shows the distance to each shelter once an origin exists", async () => {
    const input = await openPicker();

    // Read off the rows and not off the whole dialog: the map carries a scale
    // bar, so "km" is on screen before any shelter has a distance.
    const rowText = () =>
      Array.from(screen.getByRole("dialog").querySelectorAll("button"))
        .map((button) => button.textContent ?? "")
        .filter((text) => text.includes("Zavetišče "))
        .join("|");

    expect(rowText()).not.toContain("km");

    type(input, "1000");

    expect(rowText()).toContain("km");
  });

  it("says nothing while the input is too short to be a finished attempt", async () => {
    const input = await openPicker();

    type(input, "10");

    expect(screen.queryByText(/Tega kraja ne najdem/)).toBeNull();
  });

  it("complains gently once a finished input matches nothing", async () => {
    const input = await openPicker();

    type(input, "qqqqq");

    expect(
      screen.getByText("Tega kraja ne najdem. Poskusi s poštno številko."),
    ).toBeTruthy();
    expect(rowOrder()).toEqual(["sever", "jug"]);
  });

  it("does not suggest a postcode to someone who just typed one", async () => {
    const input = await openPicker();

    type(input, "9998");

    expect(
      screen.getByText("Te poštne številke ne najdem. Preveri vnos."),
    ).toBeTruthy();
    expect(rowOrder()).toEqual(["sever", "jug"]);
  });

  it("restores the given order when the input is cleared", async () => {
    const input = await openPicker();

    type(input, "1000");
    expect(rowOrder()).toEqual(["jug", "sever"]);

    type(input, "");

    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
  });

  it("hides the geolocation button while a typed place drives the sort", async () => {
    const input = await openPicker();

    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();

    type(input, "1000");
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();

    type(input, "");
    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();
  });

  it("puts a geolocation error away once the user types a place", async () => {
    const input = await openPicker();

    // jsdom has no navigator.geolocation, so the toggle errors synchronously.
    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    expect(
      screen.getByText("Brskalnik ne pozna lokacije."),
    ).toBeTruthy();

    type(input, "1000");

    expect(
      screen.queryByText("Brskalnik ne pozna lokacije."),
    ).toBeNull();
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();
  });

  it("clears the input from its own button", async () => {
    const input = await openPicker();

    type(input, "1000");
    fireEvent.click(screen.getByRole("button", { name: "Počisti kraj" }));

    expect((input as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
  });
});

// Maribor, so a fix from here sorts Sever first and any typed Ljubljana has to
// visibly take the sort back.
const MARIBOR = { latitude: 46.5547, longitude: 15.6459 };

type Success = (position: { coords: typeof MARIBOR }) => void;

function mockGeolocation(): { succeed: () => void } {
  let pending: Success | undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: Success) => {
        pending = success;
      },
    },
  });
  return {
    succeed: () => {
      act(() => {
        pending?.({ coords: MARIBOR });
      });
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("LocationPicker most recent act", () => {
  it("hands the sort to a place typed while geolocation is on", async () => {
    const geolocation = mockGeolocation();
    const input = await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    geolocation.succeed();
    expect(rowOrder()).toEqual(["sever", "jug"]);

    type(input, "1000");

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();
  });

  it("discards a fix that arrives after the place was typed", async () => {
    const geolocation = mockGeolocation();
    const input = await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    type(input, "1000");
    expect(rowOrder()).toEqual(["jug", "sever"]);

    // The permission prompt is answered a moment too late to matter.
    geolocation.succeed();

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();
  });
});

describe("LocationPicker keyboard", () => {
  it("clears the place on Escape and keeps the dialog open", async () => {
    const input = await openPicker();

    type(input, "1000");
    fireEvent.keyDown(input, { key: "Escape" });

    expect((input as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("clears the shelter search on Escape and keeps the dialog open", async () => {
    await openPicker();
    const search = screen.getByLabelText("Išči zavetišče po imenu…");

    type(search, "Sever");
    expect(rowOrder()).toEqual(["sever"]);

    fireEvent.keyDown(search, { key: "Escape" });

    expect((search as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("takes the focus off the place input on Enter", async () => {
    const input = await openPicker();

    type(input, "1000");
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(document.activeElement).not.toBe(input);
    expect((input as HTMLInputElement).value).toBe("1000");
  });
});

describe("LocationPicker off-site shelters", () => {
  it("links a shelter with no animals to its page", async () => {
    await openPicker({ offSite });

    const link = screen.getByRole("link", { name: /Zavetišče Vzhod/ });

    expect(link.getAttribute("href")).toBe("/zavetisca/vzhod");
  });

  it("heads the rows it cannot filter by, and leaves the legend out of it", async () => {
    await openPicker();

    expect(screen.queryByText("Trenutno brez objavljenih živali")).toBeNull();

    cleanup();
    await openPicker({ offSite });

    // The heading over the rows, and nothing else. The legend explains the
    // hollow ring in its own words, which are not these.
    expect(
      screen.getAllByText("Trenutno brez objavljenih živali"),
    ).toHaveLength(1);
  });
});

// The off-site rows used to be hand-written <a> tags with none of ShelterRows'
// map-hover wiring. They go through ShelterRows now (see shelter-rows.tsx's
// href branch), so a marker hover has to echo on them exactly the way it
// already does on a live row.
describe("LocationPicker off-site hover echo", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  it("highlights the off-site row when its marker is hovered, the same as a live row", async () => {
    await openPicker({ offSite });

    const marker = screen
      .getByRole("dialog")
      .querySelector('[data-marker-key*="celje" i]')!;
    fireEvent.pointerEnter(marker);

    const link = screen.getByRole("link", { name: /Zavetišče Vzhod/ });
    expect(link.getAttribute("data-highlighted")).toBe("true");
  });

  it("scrolls the off-site row into view on that same hover", async () => {
    await openPicker({ offSite });

    const marker = screen
      .getByRole("dialog")
      .querySelector('[data-marker-key*="celje" i]')!;
    fireEvent.pointerEnter(marker);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
    });
  });

  it("holds that scroll while a card is up, and tints the row anyway", async () => {
    await openPicker({ offSite });
    const dialog = screen.getByRole("dialog");

    // A click first: from here on there is an answer on screen worth more
    // than any hover.
    fireEvent.click(dialog.querySelector('[data-marker-key*="maribor" i]')!);
    expect(dialog.querySelector("[data-map-pick-card]")).toBeTruthy();
    scrollIntoView.mockClear();

    fireEvent.pointerEnter(dialog.querySelector('[data-marker-key*="celje" i]')!);

    // The echo still happens where it costs nothing.
    expect(
      screen
        .getByRole("link", { name: /Zavetišče Vzhod/ })
        .getAttribute("data-highlighted"),
    ).toBe("true");
    // What is gone is the list being dragged out from under the card. The
    // off-site rows sit at the very bottom of the list under their own
    // heading, so this was the hover that threw the card furthest off.
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("LocationPicker legend", () => {
  it("carries the density ramp alone once nothing else needs explaining", async () => {
    // No off-site shelter here: every shelter lists animals, so no marker is
    // hollow and the empty-shelter row has nothing to say either.
    await openPicker();

    const legends = Array.from(
      screen.getByRole("dialog").querySelectorAll("[data-map-legend]"),
    );
    // One legend, in one place: a caption under the plate. It was two
    // renderings with CSS choosing between them while the wide one floated
    // into the map's own corner, which is the arrangement that put it on the
    // country.
    expect(legends).toHaveLength(1);
    // The one encoding with no other way in, and nothing else: no paw swatch,
    // no marker sizes, no off-site ring. Those answer for themselves on the
    // map.
    expect(legends[0].textContent).toBe("Manj živaliVeč živali");
    expect(legends[0].querySelector(".lucide-paw-print")).toBeNull();
  });

  it("sits under the plate rather than over it, at every width", async () => {
    await openPicker();

    const stage = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-map-stage]")!;
    const legend = stage.querySelector<HTMLElement>("[data-map-legend]")!;

    // In the stage's own flow and after the plate, so the map is given what
    // the caption leaves. jsdom lays nothing out, so what is checked here is
    // the construction: no absolute positioning anywhere between the legend
    // and the stage, and the plate's row ahead of it in document order.
    let node: HTMLElement | null = legend;
    while (node && node !== stage) {
      expect(node.className).not.toContain("absolute");
      node = node.parentElement;
    }
    expect(node).toBe(stage);
    expect(stage.className).toContain("flex-col");
    const plate = stage.querySelector("svg")!;
    expect(
      plate.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the swatches from the map's own ramp, colour and steps", async () => {
    await openPicker({ offSite });

    const legend = screen
      .getByRole("dialog")
      .querySelector("[data-map-legend]") as HTMLElement;
    const swatches = Array.from(
      legend.querySelectorAll<HTMLElement>("[style*='opacity']"),
    );

    expect(swatches).toHaveLength(DENSITY_STEPS.length);
    swatches.forEach((swatch, index) => {
      // The region fill itself, not a grey stand-in for it: same token, same
      // step, so the legend cannot drift from the map.
      expect(swatch.className).toContain("bg-[var(--map-density-fill)]");
      expect(swatch.className).not.toContain("bg-foreground");
      expect(swatch.style.opacity).toBe(String(DENSITY_STEPS[index]));
    });
  });

  it("explains the hatch only while a region is partly picked", async () => {
    // Two shelters in one region, so picking one of them leaves that region
    // between states and the map hatches it.
    const shared = [
      { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
      { value: "sever", label: "Zavetišče Sever", city: "Ljubljana" },
    ];
    const sharedCounts = new Map([
      ["jug", 7],
      ["sever", 4],
    ]);

    function renderWith(selected: string[]) {
      render(
        <I18nProvider locale="sl">
          <LocationPicker
            options={shared}
            counts={sharedCounts}
            selected={selected}
            onToggle={vi.fn()}
            onToggleMany={vi.fn()}
            resultCount={11}
            species="all"
          />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));
    }

    renderWith([]);
    expect(screen.queryByText("Delno izbrana regija")).toBeNull();

    cleanup();
    renderWith(["jug"]);
    expect(
      screen.getAllByText("Delno izbrana regija").length,
    ).toBeGreaterThan(0);

    cleanup();
    renderWith(["jug", "sever"]);
    expect(screen.queryByText("Delno izbrana regija")).toBeNull();

    // Fully picked instead: the hatch row stands down and the selected row
    // takes over, naming the solid green the moment it first lands on the
    // map. The ramp and the selection share a hue, so without this row the
    // darkest density step can be read as "already picked".
    expect(screen.getAllByText("Izbrana regija").length).toBeGreaterThan(0);
  });

  it("explains the selection green only while a region is fully picked", async () => {
    await openPicker();
    expect(screen.queryByText("Izbrana regija")).toBeNull();
  });

  it("draws the selected-region swatch from the map's own selected-fill token", async () => {
    // Both shelters share a city, so picking both fully picks that region and
    // the "Izbrana regija" row appears with a swatch to check.
    const shared = [
      { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
      { value: "sever", label: "Zavetišče Sever", city: "Ljubljana" },
    ];
    const sharedCounts = new Map([
      ["jug", 7],
      ["sever", 4],
    ]);

    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={shared}
          counts={sharedCounts}
          selected={["jug", "sever"]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={11}
          species="all"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));

    const label = screen.getAllByText("Izbrana regija")[0];
    const swatch = label.querySelector("span[aria-hidden]") as HTMLElement;
    // The same token the map's selected region fills with (shelter-map.tsx
    // REGION_LOOK.selected), not --filter-accent-border: that token sits too
    // close to the ramp's darkest step for the legend to teach the right
    // colour. See --map-selected-fill's definition in globals.css.
    expect(swatch.className).toContain("bg-[var(--map-selected-fill)]");
    expect(swatch.className).not.toContain("--filter-accent-border");
  });

  it("explains the hollow circle only while an empty shelter is on the map", async () => {
    await openPicker();
    expect(screen.queryByText("Zavetišče brez živali")).toBeNull();

    cleanup();
    // The off-site shelter places in Celje with nothing listed, which is the
    // hollow circle the row is about.
    await openPicker({ offSite });
    // Once, because there is one legend now.
    expect(screen.getAllByText("Zavetišče brez živali").length).toBe(1);
  });

  it("hides that row below the marker breakpoint, where there is no circle", async () => {
    await openPicker({ offSite });

    const legend = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-map-legend]")!;
    const row = Array.from(legend.children).find((child) =>
      child.textContent?.includes("Zavetišče brez živali"),
    )!;

    // The row follows the markers, which are drawn from md up, and not the
    // docks: from md to lg the plate is full width and draws every one of
    // them, below md it draws none.
    expect(row.className).toContain("max-md:hidden");
  });

  it("draws the legend glyph from the marker's own hollow-circle classes", async () => {
    await openPicker({ offSite });

    const glyph = screen
      .getByRole("dialog")
      .querySelector("[data-legend-empty]") as SVGCircleElement;

    expect(glyph).toBeTruthy();
    // The same stroke token the marker's circle wears, and no fill, so the two
    // marks cannot drift apart.
    expect(glyph.getAttribute("class")).toContain("stroke-foreground/45");
    expect(glyph.getAttribute("class")).toContain("fill-none");
  });
});

// The map lives in this dialog, and a shared town's per-shelter targets are
// the one part of it that needs a real DOM to answer a click. The static
// render test next door covers what those targets look like.
//
// A town lays its marks out one of two ways, and both answer the same: a town
// that shares its coin cuts wedges out of its target, and a town one shelter
// dominates covers its coin and its satellites with a circle each. Every case
// below is run through whichever of the two its counts earn.
describe("ShelterMap per-shelter targets", () => {
  function clusterPin(
    value: string,
    label: string,
    count: number,
    selectable?: boolean,
  ): ShelterPin {
    return {
      value,
      label,
      city: "Celje",
      count,
      at: cityAt("Celje")!,
      selectable,
    };
  }

  function renderCluster(pins: ShelterPin[]) {
    const onPick = vi.fn();
    const onHoverShelters = vi.fn();
    const { container } = render(
      <I18nProvider locale="sl">
        <ShelterMap
          pins={pins}
          selected={[]}
          onPick={onPick}
          onHoverShelters={onHoverShelters}
        />
      </I18nProvider>,
    );
    // The mark's own target, whichever shape the town's layout gave it: the
    // disc circle when there is one, the wedge otherwise.
    const target = (value: string) =>
      (container.querySelector(`[data-disc-shelter="${value}"]`) ??
        container.querySelector(`[data-wedge-shelter="${value}"]`))!;
    return { onPick, onHoverShelters, target };
  }

  it("picks only the shelter whose satellite was clicked", () => {
    const { onPick, target } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("sia-in-lu", "Zavetišče Sia in Lu", 11),
    ]);

    fireEvent.click(target("sia-in-lu"));

    expect(onPick).toHaveBeenCalledTimes(1);
    // The values a click toggles come first; the second argument only says
    // what was aimed at, so the panel can answer with a card.
    expect(onPick.mock.calls[0][0]).toEqual(["sia-in-lu"]);
    expect(onPick.mock.calls[0][1]).toEqual({
      kind: "shelter",
      value: "sia-in-lu",
    });
  });

  it("picks only the shelter whose wedge was clicked", () => {
    // 60 to 20 is under the four-times line, so this town still shares a coin
    // and answers through wedges.
    const { onPick, target } = renderCluster([
      clusterPin("sever", "Zavetišče Sever", 60),
      clusterPin("vzhod", "Zavetišče Vzhod", 20),
    ]);

    fireEvent.click(target("vzhod"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toEqual(["vzhod"]);
  });

  it("ignores a click on an off-site shelter's target", () => {
    const { onPick, target } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("vzhod", "Zavetišče Vzhod", 0, false),
    ]);

    fireEvent.click(target("vzhod"));

    expect(onPick).not.toHaveBeenCalled();
  });

  it("names the hovered shelter alone, not its town", () => {
    const { onHoverShelters, target } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("sia-in-lu", "Zavetišče Sia in Lu", 11),
    ]);

    fireEvent.pointerOver(target("sia-in-lu"));

    expect(onHoverShelters).toHaveBeenCalledWith(["sia-in-lu"]);
    expect(screen.getByText("Zavetišče Sia in Lu")).toBeTruthy();
    expect(screen.getByText("11 živali")).toBeTruthy();
    expect(screen.queryByText("Celje")).toBeNull();
  });
});

// A click on the map toggles as it always did, and now also says what it just
// toggled: a card at the top of the shelter panel.
describe("LocationPicker pick card", () => {
  const summaries = new Map([
    [
      "sever",
      {
        species: [
          { species: "dog", count: 3 },
          { species: "cat", count: 1 },
        ],
        longestWaiting: { name: "Mila", duration: "10 let" },
      },
    ],
  ]) as Map<string, ShelterSummary>;

  // Stateful on purpose: the card watches `selected` and folds once nothing
  // it stands for is on (see location-picker.tsx), so a harness whose toggles
  // land nowhere shows a card for exactly one render. The spies still record
  // every call; they just also do what animal-grid's real handlers do.
  function openMap({
    selected: initialSelected = [],
    ...props
  }: Partial<Parameters<typeof LocationPicker>[0]> = {}) {
    const onToggleMany = vi.fn();
    const onToggle = vi.fn();
    function Harness() {
      const [selected, setSelected] = useState<string[]>(initialSelected);
      const apply = (values: string[]) =>
        setSelected((current) => toggleValues(current, values));
      return (
        <I18nProvider locale="sl">
          <LocationPicker
            options={options}
            counts={counts}
            selected={selected}
            onToggle={(value) => {
              onToggle(value);
              apply([value]);
            }}
            onToggleMany={(values) => {
              onToggleMany(values);
              apply(values);
            }}
            resultCount={11}
            species="all"
            summaries={summaries}
            {...props}
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));
    return { onToggle, onToggleMany };
  }

  const dialog = () => screen.getByRole("dialog");
  const card = () =>
    dialog().querySelector<HTMLElement>("[data-map-pick-card]");

  /** The marker group of the town a shelter sits in. Single-shelter towns
   *  answer as a whole, so the group itself is what takes the click. */
  function marker(city: string): Element {
    return dialog().querySelector(`[data-marker-key*="${city}" i]`)!;
  }

  /** A shelter's own list row. Its name is on the marker as well, so the row
   *  is told apart by being the real <button> of the two. */
  /** A shelter's row in the list. The name is on the marker too, and a group
   *  card renders rows of its own at the head of the same scroller, so the
   *  list's row is the real <button> that is not inside the card. */
  function row(label: RegExp): HTMLElement | undefined {
    return screen
      .getAllByRole("button", { name: label })
      .find(
        (node) =>
          node.tagName === "BUTTON" && !node.closest("[data-map-pick-card]"),
      );
  }

  it("toggles the shelter and answers with its card in one click", () => {
    const { onToggleMany } = openMap();

    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledTimes(1);
    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(card()?.dataset.mapPickCard).toBe("shelter");
    expect(card()?.textContent).toContain("Zavetišče Sever");
    expect(card()?.textContent).toContain("Maribor");
  });

  it("breaks the shelter down by species and names who has waited longest", () => {
    openMap();

    fireEvent.click(marker("maribor"));

    // Every species the shelter has and only those: no rabbit row for a
    // shelter with no rabbits.
    expect(card()?.querySelector("[data-pick-species='dog']")?.textContent).toBe(
      "3",
    );
    expect(card()?.querySelector("[data-pick-species='cat']")?.textContent).toBe(
      "1",
    );
    expect(card()?.querySelector("[data-pick-species='rabbit']")).toBeNull();
    // The site's own species icons, not a stand-in.
    expect(card()?.querySelector(".lucide-dog")).toBeTruthy();
    expect(card()?.querySelector(".lucide-cat")).toBeTruthy();
    expect(card()?.textContent).toContain("Najdlje čaka: Mila, 10 let");
  });

  it("says less rather than guessing when a shelter has no summary", () => {
    openMap();

    fireEvent.click(marker("ljubljana"));

    expect(card()?.textContent).toContain("Zavetišče Jug");
    expect(card()?.textContent).not.toContain("Najdlje čaka");
  });

  it("answers a region click with the region and the shelters it just toggled", () => {
    const { onToggleMany } = openMap();

    fireEvent.click(
      screen.getByRole("button", { name: /^Podravska:/ }),
    );

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(card()?.dataset.mapPickCard).toBe("group");
    expect(card()?.textContent).toContain("Podravska");
    expect(card()?.textContent).toContain("1 zavetišče");
    expect(card()?.textContent).toContain("4 živali");
    // The region's shelters as rows, so the card spells out what was toggled.
    expect(
      card()?.querySelector("button[aria-pressed]")?.textContent,
    ).toContain("Zavetišče Sever");
  });

  it("replaces the card with the next click, and dismiss closes it without touching the selection", () => {
    openMap();

    fireEvent.click(marker("maribor"));
    expect(card()?.textContent).toContain("Zavetišče Sever");

    fireEvent.click(marker("ljubljana"));
    expect(dialog().querySelectorAll("[data-map-pick-card]")).toHaveLength(1);
    expect(card()?.textContent).toContain("Zavetišče Jug");

    // The X only ever closes the card now; both shelters stay picked, and
    // dropping one is left to clicking it again or its own row.
    fireEvent.click(screen.getByRole("button", { name: "Zapri kartico" }));

    expect(card()).toBeNull();
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
    expect(row(/^Zavetišče Jug/)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves confirming to the footer pill, which is the one that knows the count", () => {
    openMap();

    fireEvent.click(marker("maribor"));

    // The card used to end in its own "Prikaži živali", directly under one
    // shelter's own count, and clicking it applied every filter in the
    // dialog rather than that shelter's animals. One primary, in the footer,
    // wearing the number it actually means.
    expect(screen.queryByRole("button", { name: "Prikaži živali" })).toBeNull();
    expect(screen.getByRole("button", { name: /^Prikaži/ })).toBeTruthy();
  });

  it("drops an already-picked shelter on a single click, with no card on screen", () => {
    // Already picked and no card open for it: a click still un-chooses it
    // outright. There is no "ask first" step any more.
    const { onToggleMany } = openMap({ selected: ["sever"] });

    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(card()).toBeNull();
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("picks it straight back up on the click after a drop", () => {
    const { onToggleMany } = openMap({ selected: ["sever"] });

    fireEvent.click(marker("maribor"));
    onToggleMany.mockClear();

    // Every click is a plain toggle, so the next one on the same marker picks
    // Sever again and opens its card.
    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(card()?.dataset.mapPickCard).toBe("shelter");
    expect(card()?.textContent).toContain("Zavetišče Sever");
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("drops an already-picked shelter even while another shelter's card is on screen", () => {
    const { onToggleMany } = openMap({ selected: ["sever"] });

    fireEvent.click(marker("ljubljana"));
    expect(card()?.textContent).toContain("Zavetišče Jug");
    onToggleMany.mockClear();

    // Sever is already picked, so this click drops it outright, and dropping
    // clears whatever card happens to be up, Jug's included: a drop answers
    // nothing, so there is nothing left for a card to say.
    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(card()).toBeNull();
  });

  it("drops just its own shelter when a member of a picked region is clicked", () => {
    // Ptuj sits in Podravska with Maribor, so the region holds both.
    const { onToggleMany } = openMap({
      options: [
        ...options,
        { value: "vzhod", label: "Zavetišče Vzhod", city: "Ptuj" },
      ],
      counts: new Map([...counts, ["vzhod", 5]]),
    });

    fireEvent.click(screen.getByRole("button", { name: /^Podravska:/ }));
    expect(card()?.dataset.mapPickCard).toBe("group");
    onToggleMany.mockClear();

    // A marker click names one shelter, not the region it sits in, so it
    // drops only that shelter, in one click, and takes the card down with it:
    // dropping never leaves a card standing, even the region's own.
    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("true");
    expect(card()).toBeNull();
  });

  it("picks a region on one click and drops it on the next", () => {
    const { onToggleMany } = openMap({
      options: [
        ...options,
        { value: "vzhod", label: "Zavetišče Vzhod", city: "Ptuj" },
      ],
      counts: new Map([...counts, ["vzhod", 5]]),
    });
    const region = () => screen.getByRole("button", { name: /^Podravska:/ });

    fireEvent.click(region());
    expect(card()?.dataset.mapPickCard).toBe("group");
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("true");
    onToggleMany.mockClear();

    // The region is a plain toggle like everything else: it is fully picked,
    // so this click un-chooses every shelter it holds in one go.
    fireEvent.click(region());

    // The region hands its shelters over in map order, which is the layout's
    // business and not this test's, so the two are compared as a set.
    expect(onToggleMany).toHaveBeenCalledTimes(1);
    expect([...onToggleMany.mock.calls[0][0]].sort()).toEqual([
      "sever",
      "vzhod",
    ]);
    expect(card()).toBeNull();
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("drops the whole region in one click, clearing an unrelated card on screen", () => {
    // The old rule needed the region's own card on screen before a click
    // would drop it; a click on it while some other card was up only put the
    // region's card back. That "ask first" step is gone: a picked region
    // drops every shelter it holds on the very next click and clears
    // whatever card happens to be showing, related or not.
    const { onToggleMany } = openMap({
      options: [
        ...options,
        { value: "vzhod", label: "Zavetišče Vzhod", city: "Ptuj" },
      ],
      counts: new Map([...counts, ["vzhod", 5]]),
    });
    const region = () => screen.getByRole("button", { name: /^Podravska:/ });

    fireEvent.click(region());
    // Jug is not in Podravska; picking it replaces the card with one that has
    // nothing to do with the region.
    fireEvent.click(marker("ljubljana"));
    expect(card()?.textContent).toContain("Zavetišče Jug");
    onToggleMany.mockClear();

    fireEvent.click(region());

    // The region hands its shelters over in map order, which is the layout's
    // business and not this test's, so the two are compared as a set.
    expect(onToggleMany).toHaveBeenCalledTimes(1);
    expect([...onToggleMany.mock.calls[0][0]].sort()).toEqual([
      "sever",
      "vzhod",
    ]);
    expect(card()).toBeNull();
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("false");
    // Jug was never part of the region and was never dropped.
    expect(row(/^Zavetišče Jug/)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("announces how many shelters a region drop removed", () => {
    const { onToggleMany } = openMap({
      options: [
        ...options,
        { value: "vzhod", label: "Zavetišče Vzhod", city: "Ptuj" },
      ],
      counts: new Map([...counts, ["vzhod", 5]]),
    });
    const region = () => screen.getByRole("button", { name: /^Podravska:/ });

    fireEvent.click(region());
    onToggleMany.mockClear();
    // The region holds two shelters, so dropping it is a multi-shelter drop:
    // the one case the live region has something new to say about.
    fireEvent.click(region());

    const live = dialog().querySelector("p.sr-only[aria-live='polite']");
    expect(live?.textContent).toContain(sheltersDropped(2, "sl"));
  });

  it("says nothing extra when a single shelter is dropped", () => {
    openMap({ selected: ["sever"] });

    fireEvent.click(marker("maribor"));

    const live = dialog().querySelector("p.sr-only[aria-live='polite']");
    // A single shelter dropping is exactly what a plain toggle already reads
    // out through the trigger's own label; it earns no extra sentence.
    expect(live?.textContent).not.toMatch(/Odstranj/);
  });

  it("takes the card down once nothing it stands for is selected", () => {
    openMap();

    fireEvent.click(marker("maribor"));
    expect(card()?.textContent).toContain("Zavetišče Sever");

    // "Počisti (n)" empties the selection without going anywhere near the
    // card's own handlers; the card must go with it rather than stand over
    // an empty selection with an X that no longer drops anything.
    fireEvent.click(screen.getByRole("button", { name: /Počisti/ }));

    expect(card()).toBeNull();
  });

  it("answers a search-box Enter with the same card a row click earns", () => {
    openMap();

    const search = screen.getByPlaceholderText("Išči zavetišče po imenu…");
    fireEvent.change(search, { target: { value: "sever" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(card()?.textContent).toContain("Zavetišče Sever");
  });

  it("clears the card on a tab switch instead of replaying it on return", () => {
    openMap({
      municipalities: [
        { name: "Maribor", nearest: [], coverage: [] },
      ] as never,
    });

    fireEvent.click(marker("maribor"));
    expect(card()).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Najdena žival" }));
    fireEvent.click(screen.getByRole("button", { name: "Zavetišča" }));

    // The shelter is still selected; the card was the answer to a question
    // asked before the tab switch, and coming back is not asking it again.
    expect(card()).toBeNull();
  });

  it("stops the hovered marker repeating what the card already says", () => {
    openMap();

    // With no card up, the marker annotates in full.
    fireEvent.pointerEnter(marker("maribor"));
    expect(dialog().querySelector("[data-callout-metadata]")).toBeTruthy();
    expect(dialog().querySelector("[data-callout-species]")).toBeTruthy();

    fireEvent.pointerLeave(marker("maribor"));
    fireEvent.click(marker("maribor"));
    fireEvent.pointerEnter(marker("maribor"));

    // The name stays: a mark under the pointer still has to say what it is.
    // The count and the species breakdown go, because the card in the panel
    // is already carrying both.
    expect(dialog().querySelector("[data-callout-metadata]")).toBeNull();
    expect(dialog().querySelector("[data-callout-species]")).toBeNull();
    expect(screen.getAllByText("Zavetišče Sever").length).toBeGreaterThan(0);
  });

  it("comes back to the shelter tab when the map is clicked from the other one", () => {
    openMap({
      municipalities: [
        {
          name: "Maribor",
          nearest: [],
          coverage: [
            {
              shelterId: "sever",
              shelterName: "Zavetišče Sever",
              city: "Maribor",
              detailHref: "/zavetisca/sever",
              animals: 4,
              sourceLabel: "Test",
              sourceDate: "2026-01-01",
              confirmed: true,
            },
          ],
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Najdena žival" }));
    expect(screen.queryByLabelText("Išči zavetišče po imenu…")).toBeNull();

    fireEvent.click(marker("maribor"));

    expect(screen.getByLabelText("Išči zavetišče po imenu…")).toBeTruthy();
    expect(card()?.textContent).toContain("Zavetišče Sever");
  });
});

// The map is the stage now: the list floats on it in a panel that folds, the
// confirm button is a pill on the paper, and the credits are a line in the
// corner. What follows is that layout's own contract.
describe("LocationPicker floating panel", () => {
  const dialog = () => screen.getByRole("dialog");
  const stage = () =>
    dialog().querySelector<HTMLElement>("[data-map-stage]")!;
  const panel = () =>
    dialog().querySelector<HTMLElement>("[data-picker-panel]")!;

  it("folds to a rail and hands the width back to the map", async () => {
    await openPicker();

    expect(stage().dataset.mapStage).toBe("panel");
    // The map is given the stage less the panel, its inset and the gutter, so
    // nothing it draws can end up underneath the panel. lg and not md: the
    // two-column stage starts at 1024 now, because at 768 it left a 295px map
    // beside a 408px list.
    expect(stage().className).toContain("lg:w-[calc(100%-25.5rem)]");
    expect(screen.getByLabelText("Išči zavetišče po imenu…")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));

    expect(stage().dataset.mapStage).toBe("rail");
    expect(stage().className).toContain("lg:w-[calc(100%-4.5rem)]");
    expect(panel().className).toContain("lg:w-12");
    // The rail is what is left at lg: one control, and no list beside it. The
    // list block stays mounted because the sheet below lg is still out and both
    // docks share one copy of it, so what says "folded" here is the class that
    // takes it off the screen at lg.
    expect(dialog().querySelector("[data-picker-rail]")).toBeTruthy();
    const list = screen
      .getByLabelText("Išči zavetišče po imenu…")
      .closest("[data-picker-panel] > div")!;
    expect(list.className).toContain("lg:hidden");
  });

  it("puts the list back when the rail is pressed", async () => {
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));
    fireEvent.click(screen.getByRole("button", { name: "Pokaži seznam" }));

    expect(stage().dataset.mapStage).toBe("panel");
    expect(dialog().querySelector("[data-picker-rail]")).toBeNull();
    expect(screen.getByLabelText("Išči zavetišče po imenu…")).toBeTruthy();
  });

  it("counts the selection on the rail, so folding hides nothing", async () => {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={["jug"]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={7}
          species="all"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));

    const rail = screen.getByRole("button", { name: "Pokaži seznam" });
    expect(rail.textContent).toContain("1");
  });

  it("brings both docks back when the map is clicked with the panel folded", async () => {
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));
    expect(dialog().querySelector("[data-map-pick-card]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Podravska:/ }));

    // A click has to produce a visible answer, so the card's own dock unfolds:
    // the panel on a desktop, the sheet on a phone.
    expect(stage().dataset.mapStage).toBe("panel");
    expect(
      dialog().querySelector<HTMLElement>("[data-picker-panel]")!.dataset
        .pickerSheet,
    ).toBe("open");
    expect(
      dialog().querySelector("[data-map-pick-card]")?.textContent,
    ).toContain("Podravska");
  });

  it("opens with the sheet expanded, and folds it to a peek bar on request", async () => {
    await openPicker();

    const peek = dialog().querySelector<HTMLElement>("[data-picker-peek]")!;
    // The dialog lands with the list up. Below lg the plate is limited by the
    // width of the screen, so a folded sheet buys the map no pixels it can
    // use: at 390x844 it bought 356x234 of plate in a 739px stage.
    expect(peek.getAttribute("aria-expanded")).toBe("true");
    expect(panel().dataset.pickerSheet).toBe("open");
    // Same recentering as the panel, on the other axis: the container gives up
    // exactly the height the sheet takes.
    expect(panel().className).toContain("h-[55dvh]");
    expect(stage().className).toContain("bottom-[55dvh]");

    fireEvent.click(peek);

    // The fold is still there for anyone who wants the plate whole.
    expect(peek.getAttribute("aria-expanded")).toBe("false");
    expect(stage().className).toContain("bottom-13");
  });

  it("carries the current answer on the peek bar, not the name of the open tab", async () => {
    await openPicker();

    const peek = dialog().querySelector<HTMLElement>("[data-picker-peek]")!;
    // The same sentence the toolbar trigger wears, from the same computation:
    // the strip says what the picking adds up to, and the tab row inside the
    // sheet is what names and switches the tab.
    expect(peek.textContent).toContain("Obe zavetišči");
    expect(peek.textContent).not.toContain("Zavetišča");

    cleanup();
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={["jug"]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={7}
          species="all"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));

    const picked = dialog().querySelector<HTMLElement>("[data-picker-peek]")!;
    expect(picked.textContent).toContain("1 od 2 zavetišč");
    // And the badge it already had, which is the same fact at a glance.
    expect(picked.textContent).toContain("1");
  });

  it("hangs the legend and the credits off the plate, not off the dialog frame", async () => {
    await openPicker();

    const legend = dialog().querySelector<HTMLElement>("[data-map-legend]")!;
    // Three levels up, not two: the legend's own wrapper sits inside a group
    // that folds away with the sheet (so the always-visible CC BY attribution
    // paragraph can live as its sibling, outside that fold), and that group
    // sits inside the block this test means to find.
    const block = legend.parentElement!.parentElement!.parentElement!;

    // The stage's own last row at every width, so it moves with the plate's
    // bottom edge instead of being anchored to a frame the plate may not
    // reach. Frame-anchored it sat 148px under the map on a 390px phone;
    // floated into the map's corner at lg it sat on the country.
    expect(stage().contains(block)).toBe(true);
    expect(block.className).not.toContain("bottom-28");
    expect(block.className).not.toContain("absolute");
    expect(block.className).toContain("shrink-0");
    expect(block.parentElement).toBe(stage());
  });

  it("answers a marker tap in the sheet, the way it answers one in the panel", async () => {
    await openPicker();

    // Fold the sheet first: a tap has to produce a visible answer, so it has to
    // bring its own dock back up.
    const peek = dialog().querySelector<HTMLElement>("[data-picker-peek]")!;
    fireEvent.click(peek);
    expect(peek.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(dialog().querySelector('[data-marker-key*="maribor" i]')!);

    expect(panel().dataset.pickerSheet).toBe("open");
    expect(
      dialog().querySelector("[data-map-pick-card]")?.textContent,
    ).toContain("Zavetišče Sever");
  });

  // The paw layer asks this element how wide the plate is actually drawn, and
  // it can only ask an element that declares itself a container.
  it("names the stage a container, so the map can be measured by what holds it", async () => {
    await openPicker();

    expect(stage().className).toContain("@container/map-stage");
  });
});

// The other question this dialog answers, and the entry point that arrives
// already asking it. On a phone the whole answer lives in the sheet, so what
// the deep link does to the sheet is the feature.
describe("LocationPicker found-animal entry", () => {
  const dialog = () => screen.getByRole("dialog");

  const municipalities = [
    {
      name: "Maribor",
      nearest: [],
      coverage: [
        {
          shelterId: "sever",
          shelterName: "Zavetišče Sever",
          city: "Maribor",
          detailHref: "/zavetisca/sever",
          animals: 4,
          sourceLabel: "Test",
          sourceDate: "2026-01-01",
          confirmed: true,
        },
      ],
    },
  ];

  // deepLink="mobile" answers below 64rem, and the matchMedia stub at the top
  // of this file reports every query as unmatched, so this instance is the
  // visible one and the one that must respond.
  function openFromStrip() {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={11}
          species="all"
          municipalities={municipalities}
          deepLink="mobile"
        />
      </I18nProvider>,
    );
    act(() => {
      window.dispatchEvent(new Event(OPEN_MUNICIPALITY_LOOKUP_EVENT));
    });
  }

  it("brings the sheet up with it, so the občina field is the thing on screen", () => {
    openFromStrip();

    const panel = dialog().querySelector<HTMLElement>("[data-picker-panel]")!;
    // Not "collapsed": a phone opening this from the map would show a
    // shelter-density plate and no way to type an občina into it.
    expect(panel.dataset.pickerSheet).toBe("open");
    expect(screen.getByLabelText("Občina ali poštna številka …")).toBeTruthy();
  });

  it("titles the dialog with the question it was opened to ask", () => {
    openFromStrip();

    expect(screen.getByRole("dialog", { name: "Najdena žival" })).toBeTruthy();
    expect(dialog().textContent).toContain(
      "Zemljevid pokaže, katero zavetišče je pristojno.",
    );
    // The shelter-picking instructions belong to the other tab.
    expect(dialog().textContent).not.toContain(
      "Izberi regijo na zemljevidu ali zavetišče s seznama.",
    );
  });

  it("keeps the tabs in the sheet's fold, not behind the pointer breakpoint", async () => {
    await openPicker({ municipalities });

    const tabRow = () =>
      dialog().querySelector<HTMLElement>("[data-picker-tab='municipality']")!
        .parentElement!.parentElement!;
    // The sheet opens expanded, so the tabs are on screen from the start.
    expect(tabRow().className).not.toContain("max-lg:hidden");
    // Never hidden by breakpoint alone: that is what made the second question
    // unreachable on a phone.
    expect(tabRow().className).not.toContain("lg:flex");

    fireEvent.click(dialog().querySelector<HTMLElement>("[data-picker-peek]")!);

    // Folded with the sheet below lg and with the panel above it, the same way
    // the list below it folds.
    expect(tabRow().className).toContain("max-lg:hidden");
  });
});

// Picking a shelter off the list and picking the same shelter off the plate
// are one act with one answer. The map path had the card to itself for a
// while, which made the list the poor relation of a control that sits right
// beside it.
describe("LocationPicker row card", () => {
  const dialog = () => screen.getByRole("dialog");
  const card = () => dialog().querySelector<HTMLElement>("[data-map-pick-card]");

  const summaries = new Map<string, ShelterSummary>([
    ["jug", { species: [{ species: "dog", count: 7 }] }],
  ]);

  /** Selection has to be real here: the whole behaviour turns on whether the
   *  value was already picked, so a fixed `selected` prop would only ever
   *  exercise one half of it. */
  function openList(initial: string[] = []) {
    function Harness() {
      const [selected, setSelected] = useState(initial);
      return (
        <I18nProvider locale="sl">
          <LocationPicker
            options={options}
            counts={counts}
            selected={selected}
            onToggle={(value) =>
              setSelected((current) =>
                current.includes(value)
                  ? current.filter((entry) => entry !== value)
                  : [...current, value],
              )
            }
            onToggleMany={vi.fn()}
            resultCount={11}
            species="all"
            summaries={summaries}
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: /Zavetišče:/ }));
  }

  /** The list's own toggle for a shelter, by the name it carries. The pick
   *  card holds a button carrying the same name, so the search is scoped to
   *  the rows rather than to the panel. */
  function row(label: string): HTMLElement {
    return Array.from(
      dialog().querySelectorAll<HTMLElement>("[aria-pressed]"),
    ).find(
      (button) =>
        button.textContent?.includes(label) &&
        !button.closest("[data-map-pick-card]"),
    )!;
  }

  it("answers a row click with the same card a marker click leaves", () => {
    openList();

    fireEvent.click(row("Zavetišče Jug"));

    expect(card()?.dataset.mapPickCard).toBe("shelter");
    expect(card()?.textContent).toContain("Zavetišče Jug");
    // The breakdown the map's card carries, from the same summaries prop.
    expect(card()?.querySelector("[data-pick-species='dog']")?.textContent).toBe(
      "7",
    );
  });

  it("takes the card away when its own shelter is dropped", () => {
    openList();

    fireEvent.click(row("Zavetišče Jug"));
    expect(card()).not.toBeNull();

    fireEvent.click(row("Zavetišče Jug"));

    // Dropping a shelter is not a question about it, so nothing is left
    // standing to answer.
    expect(card()).toBeNull();
  });

  it("leaves a card about another shelter alone", () => {
    openList(["sever"]);

    fireEvent.click(row("Zavetišče Jug"));
    expect(card()?.textContent).toContain("Zavetišče Jug");

    // Sever was already picked, so this click drops it. The card on screen is
    // about Jug and has nothing to do with that.
    fireEvent.click(row("Zavetišče Sever"));

    expect(card()?.textContent).toContain("Zavetišče Jug");
  });
});

// The third way into this dialog, after the trigger and the found-animal
// strip: an animal card's shelter name, asking where that shelter is.
describe("LocationPicker shelter spotlight", () => {
  const dialog = () => screen.getByRole("dialog");

  function askForJug(
    props: Partial<ComponentProps<typeof LocationPicker>> = {},
  ) {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={11}
          species="all"
          // Answers below 64rem, and the matchMedia stub at the top of this
          // file reports every query as unmatched, so this is the instance on
          // screen and the one that must respond.
          deepLink="mobile"
          {...props}
        />
      </I18nProvider>,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SHELTER_SPOTLIGHT_EVENT, {
          detail: { shelterId: "jug" },
        }),
      );
    });
  }

  /** The spotlight's own annotation, found by the name it carries rather than
   *  by document order: the region holding the dialog's opening focus wears
   *  an annotation of its own, and it is drawn first. */
  const spotlightCallout = () =>
    Array.from(dialog().querySelectorAll("[data-map-callout]")).find(
      (callout) =>
        callout.querySelector("[data-callout-title]")?.textContent ===
        "Zavetišče Jug",
    );

  it("opens the map with the asked-for shelter ringed and named", () => {
    askForJug();

    // One ring, on the town Zavetišče Jug sits in.
    expect(dialog().querySelectorAll("[data-map-spotlight]")).toHaveLength(1);
    // The shelter by name, not its town: that is the whole answer a card came
    // here for.
    expect(spotlightCallout()).toBeTruthy();
  });

  it("does not caption a card's shelter as anybody's responsible one", () => {
    askForJug();

    // That note belongs to the municipality answer. This shelter is not
    // responsible for anywhere in particular; it is simply where this animal
    // lives, and the ring says so on its own.
    expect(screen.queryByText("pristojno zavetišče")).toBeNull();
    expect(
      spotlightCallout()!.querySelector("[data-callout-metadata]"),
    ).toBeNull();
  });

  it("leaves the ask to whichever instance is on screen", () => {
    askForJug({ deepLink: "desktop" });

    // Two pickers are mounted on the page at once. The hidden one answering
    // would put a second dialog behind the visible one.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("answers without a municipality table, which it has nothing to do with", () => {
    // The found-animal deep link needs the coverage data and refuses without
    // it. This ask does not, and folding the two guards together would have
    // made a card's shelter name inert wherever that table is missing.
    askForJug({ municipalities: undefined });

    expect(dialog().querySelectorAll("[data-map-spotlight]")).toHaveLength(1);
  });
});

// The map's own answer for a region it draws no shelters in. The coverage
// table is already in this component for the found-animal mode, and it knows
// who takes a stray found there.
describe("LocationPicker region coverage", () => {
  const dialog = () => screen.getByRole("dialog");

  // Nova Gorica lies in Goriška, which this roster leaves empty. Ljubljana
  // lies in Osrednjeslovenska, which has Zavetišče Jug and is therefore live.
  const municipalities = [
    {
      name: "Nova Gorica",
      nearest: [],
      coverage: [
        {
          shelterId: "zahod",
          shelterName: "Zavetišče Nova Gorica",
          city: "Nova Gorica",
          detailHref: "/zavetisca/zahod",
          animals: 0,
          sourceLabel: "Test",
          sourceDate: "2026-01-01",
          confirmed: true,
        },
      ],
    },
    {
      name: "Ljubljana",
      nearest: [],
      coverage: [
        {
          shelterId: "jug",
          shelterName: "Zavetišče Jug",
          city: "Ljubljana",
          detailHref: "/zavetisca/jug",
          animals: 7,
          sourceLabel: "Test",
          sourceDate: "2026-01-01",
          confirmed: true,
        },
      ],
    },
  ];

  const region = (name: string) =>
    dialog().querySelector<SVGPathElement>(`[aria-label^="${name}"]`)!;

  it("tells an empty region who answers for the občine inside it", async () => {
    await openPicker({ municipalities });

    hoverRegion(region("Goriška"));

    expect(screen.getByText("Ni zavetišč v tej regiji")).toBeTruthy();
    // Placed by the same two steps a town is placed by, so a name lands in
    // the region the map would have drawn that municipality in.
    expect(
      screen.getByText("Zanje skrbi Zavetišče Nova Gorica"),
    ).toBeTruthy();
  });

  it("carries the same fact in the region's own label", async () => {
    await openPicker({ municipalities });

    expect(region("Goriška").getAttribute("aria-label")).toBe(
      "Goriška: Ni zavetišč v tej regiji. Zanje skrbi Zavetišče Nova Gorica",
    );
  });

  it("leaves a live region's own counts to speak for it", async () => {
    await openPicker({ municipalities });

    // Keyboard focus, because a live region no longer answers a pointer at
    // all (see the region dwell tests in shelter-map.test.tsx): this is the
    // one path that still names one.
    fireEvent.focus(region("Osrednjeslovenska"));

    // Ljubljana's coverage entry names a shelter for this region too, and a
    // region that has its own shelters has no use for it: the counts are the
    // answer there.
    expect(dialog().querySelector("[data-callout-note]")).toBeNull();
    expect(screen.getByText(/1 zavetišče · 7 živali/)).toBeTruthy();
  });

  it("says nothing at all when a pointer crosses a live region", async () => {
    await openPicker({ municipalities });

    hoverRegion(region("Osrednjeslovenska"));

    // Not even after the dwell: the covered-by line exists for regions the map
    // draws no shelters in, and this one has its own. Asked by name rather
    // than by counting callouts, because the region holding the dialog's
    // opening focus is wearing one of its own the whole time.
    expect(screen.queryByText("Osrednjeslovenska")).toBeNull();
    expect(screen.queryByText(/1 zavetišče · 7 živali/)).toBeNull();
  });
});

describe("LocationPicker floating footer", () => {
  it("applies and closes from the pill on the paper", async () => {
    await openPicker();

    const pill = screen.getByRole("button", { name: /Prikaži/ });
    // Floating on the stage, not in a footer bar under the map.
    expect(pill.closest("[data-picker-panel]")).toBeNull();

    fireEvent.click(pill);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("floats the title on the paper and keeps it the dialog's own name", async () => {
    await openPicker();

    const title = screen.getByRole("heading", { name: "Kje iščeš?" });
    expect(title.closest("[data-slot='dialog-header']")).toBeTruthy();
    expect(title.closest("[data-picker-panel]")).toBeNull();
  });
});

describe("LocationPicker attribution", () => {
  it("covers the postal districts as well as the region boundaries", async () => {
    await openPicker();

    expect(
      screen.getByText(/Meje statističnih regij in poštni okoliši/),
    ).toBeTruthy();
  });

  it("credits the elevation model the relief is computed from", async () => {
    await openPicker();

    // The hillshade is real data and the source asks to be named, in the same
    // paragraph and the same quiet register as the GURS credit.
    expect(screen.getByText(/Senčenje reliefa/)).toBeTruthy();
    const link = screen.getByText("Terrain Tiles") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("tilezen/joerd");
    expect(screen.getByText(/SRTM \/ NASA/)).toBeTruthy();
  });

  it("explains the origin ring only once there is an origin", async () => {
    const input = await openPicker();

    expect(screen.queryByText("Izhodišče")).toBeNull();

    type(input, "1000");

    // The legend now renders twice in markup (an on-map panel for md+, an
    // inline row for phones) with CSS choosing which one shows, so both
    // copies exist in jsdom regardless of viewport.
    expect(screen.getAllByText("Izhodišče").length).toBeGreaterThan(0);
  });

  it("keeps the GURS credit outside the wrapper that hides with the sheet, CC BY 4.0 requires it visible", async () => {
    await openPicker();

    // The mobile sheet opens by default (data-picker-sheet="open"), which is
    // exactly the state that used to bury this paragraph: it lived inside the
    // wrapper that folds away with the sheet, so it disappeared on every phone
    // the moment the dialog opened.
    //
    // Asked by containment rather than by class: a restyle can rename every
    // utility on that wrapper and this has to keep failing if the credit is
    // moved inside it. The legend's own presence in the fold is what keeps
    // the question honest, since a hook on the wrong element would let the
    // credit pass by default.
    const credit = screen.getByRole("dialog").querySelector(
      "[data-slot='map-attribution']",
    )!;
    const fold = "[data-slot='map-legend-fold']";

    expect(credit.textContent).toContain("GURS");
    expect(screen.getByRole("dialog").querySelector(fold)).not.toBeNull();
    expect(
      screen.getByRole("dialog").querySelector("[data-map-legend]")!.closest(fold),
    ).not.toBeNull();
    expect(credit.closest(fold)).toBeNull();
  });
});
