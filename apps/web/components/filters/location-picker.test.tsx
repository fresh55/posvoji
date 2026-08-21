// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cityAt } from "@/lib/geo";
import { OPEN_MUNICIPALITY_LOOKUP_EVENT } from "@/lib/found-animal";
import { I18nProvider } from "@/components/i18n-provider";
import { DENSITY_STEPS } from "@/lib/map-layout";
import type { ShelterSummary } from "@/lib/shelter-summary";
import { LocationPicker } from "./location-picker";
import { ShelterMap, type ShelterPin } from "./shelter-map";

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

async function openPicker(
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
        {...props}
      />
    </I18nProvider>,
  );

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

describe("LocationPicker legend", () => {
  it("carries the density ramp alone once nothing else needs explaining", async () => {
    // No off-site shelter here: every shelter lists animals, so no marker is
    // hollow and the empty-shelter row has nothing to say either.
    await openPicker();

    const legends = Array.from(
      screen.getByRole("dialog").querySelectorAll("[data-map-legend]"),
    );
    // Both copies exist in markup (an on-map row for md+, an inline row for
    // phones) with CSS choosing which one shows.
    expect(legends).toHaveLength(2);
    for (const legend of legends) {
      // The one encoding with no other way in, and nothing else: no paw
      // swatch, no marker sizes, no off-site ring. Those answer for
      // themselves on the map.
      expect(legend.textContent).toBe("Manj živaliVeč živali");
      expect(legend.querySelector(".lucide-paw-print")).toBeNull();
    }
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
    // Once per legend rendering: the panel column and the inline row are both
    // in the markup, and CSS picks which one shows. See the row's own test
    // below for which widths each of them draws it at.
    expect(screen.getAllByText("Zavetišče brez živali").length).toBe(2);
  });

  it("carries that row in both legends, and hides it below the marker breakpoint", async () => {
    await openPicker({ offSite });

    const legends = Array.from(
      screen.getByRole("dialog").querySelectorAll<HTMLElement>(
        "[data-map-legend]",
      ),
    );
    const panel = legends.find(
      (legend) => legend.dataset.mapLegend === "panel",
    )!;
    const inline = legends.find(
      (legend) => legend.dataset.mapLegend === "inline",
    )!;

    // The panel legend only exists from lg up, where markers are always drawn.
    expect(panel.textContent).toContain("Zavetišče brez živali");
    const panelRow = Array.from(panel.children).find((row) =>
      row.textContent?.includes("Zavetišče brez živali"),
    )!;
    expect(panelRow.className).not.toContain("hidden");

    // The inline legend now covers everything below lg, which straddles the
    // marker breakpoint: from md to lg the plate is full width and draws every
    // marker, below md it draws none. The row follows the markers, so it is in
    // the markup and gated on md rather than left out of the variant.
    expect(inline.textContent).toContain("Zavetišče brez živali");
    const inlineRow = Array.from(inline.children).find((row) =>
      row.textContent?.includes("Zavetišče brez živali"),
    )!;
    expect(inlineRow.className).toContain("max-md:hidden");
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

  function openMap(
    props: Partial<Parameters<typeof LocationPicker>[0]> = {},
  ) {
    const onToggle = vi.fn();
    const onToggleMany = vi.fn();
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={[]}
          onToggle={onToggle}
          onToggleMany={onToggleMany}
          resultCount={11}
          species="all"
          summaries={summaries}
          {...props}
        />
      </I18nProvider>,
    );
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

  it("replaces the card with the next click and takes it away on dismiss", () => {
    openMap();

    fireEvent.click(marker("maribor"));
    expect(card()?.textContent).toContain("Zavetišče Sever");

    fireEvent.click(marker("ljubljana"));
    expect(dialog().querySelectorAll("[data-map-pick-card]")).toHaveLength(1);
    expect(card()?.textContent).toContain("Zavetišče Jug");

    fireEvent.click(screen.getByRole("button", { name: "Zapri kartico" }));

    expect(card()).toBeNull();
  });

  it("applies and closes from the card, the same way the footer does", () => {
    openMap();

    fireEvent.click(marker("maribor"));
    fireEvent.click(screen.getByRole("button", { name: "Prikaži živali" }));

    expect(screen.queryByRole("dialog")).toBeNull();
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
    const block = legend.parentElement!.parentElement!;

    // Inside the map's own container, so below lg it is the next thing after
    // the plate in that container's column and moves with the plate's bottom
    // edge. Frame-anchored it sat 148px under the map on a 390px phone.
    expect(stage().contains(block)).toBe(true);
    expect(block.className).not.toContain("bottom-28");
    // At lg the container is the map, so the same block goes back to the
    // dialog's bottom-left corner.
    expect(block.className).toContain("lg:absolute");
    expect(block.className).toContain("lg:bottom-3");
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
});
