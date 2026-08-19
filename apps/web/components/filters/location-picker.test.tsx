// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cityAt } from "@/lib/geo";
import { I18nProvider } from "@/components/i18n-provider";
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

async function openPicker(props: { offSite?: typeof offSite } = {}) {
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

    expect(screen.getByRole("dialog").textContent).not.toContain("km");

    type(input, "1000");

    expect(screen.getByRole("dialog").textContent).toContain("km");
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

  it("explains the faint marker only once there is one", async () => {
    await openPicker();

    expect(screen.queryByText("Trenutno brez objavljenih živali")).toBeNull();

    cleanup();
    await openPicker({ offSite });

    // The heading over the rows and the legend entry share the wording.
    expect(
      screen.getAllByText("Trenutno brez objavljenih živali"),
    ).toHaveLength(2);
  });
});

// The map lives in this dialog, and a cluster's wedges are the one part of it
// that needs a real DOM to answer a click. The static render test next door
// covers what the wedges look like.
describe("ShelterMap cluster wedges", () => {
  function clusterPin(
    value: string,
    label: string,
    count: number,
    selectable?: boolean,
  ): ShelterPin {
    return { value, label, city: "Celje", count, at: cityAt("Celje")!, selectable };
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
    const wedge = (value: string) =>
      container.querySelector(`[data-wedge-shelter="${value}"]`)!;
    return { onPick, onHoverShelters, wedge };
  }

  it("picks only the shelter whose wedge was clicked", () => {
    const { onPick, wedge } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("sia-in-lu", "Zavetišče Sia in Lu", 11),
    ]);

    fireEvent.click(wedge("sia-in-lu"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(["sia-in-lu"]);
  });

  it("ignores a click on an off-site shelter's wedge", () => {
    const { onPick, wedge } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("vzhod", "Zavetišče Vzhod", 0, false),
    ]);

    fireEvent.click(wedge("vzhod"));

    expect(onPick).not.toHaveBeenCalled();
  });

  it("names the hovered shelter alone, not its town", () => {
    const { onHoverShelters, wedge } = renderCluster([
      clusterPin("macja-hisa", "Zavetišče Mačja hiša", 185),
      clusterPin("sia-in-lu", "Zavetišče Sia in Lu", 11),
    ]);

    fireEvent.pointerOver(wedge("sia-in-lu"));

    expect(onHoverShelters).toHaveBeenCalledWith(["sia-in-lu"]);
    expect(screen.getByText("Zavetišče Sia in Lu")).toBeTruthy();
    expect(screen.getByText("11 živali")).toBeTruthy();
    expect(screen.queryByText("Celje")).toBeNull();
  });
});

describe("LocationPicker attribution", () => {
  it("covers the postal districts as well as the region boundaries", async () => {
    await openPicker();

    expect(
      screen.getByText(/Meje statističnih regij in poštni okoliši/),
    ).toBeTruthy();
  });

  it("explains the origin ring only once there is an origin", async () => {
    const input = await openPicker();

    expect(screen.queryByText("Izhodišče")).toBeNull();

    type(input, "1000");

    expect(screen.getByText("Izhodišče")).toBeTruthy();
  });
});
