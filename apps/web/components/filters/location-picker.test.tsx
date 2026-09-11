// @vitest-environment jsdom

import { resetNearbyOriginStore } from "@/hooks/use-nearby-origin";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toggleValues } from "@/lib/filters";
import { FINE_POINTER } from "./location-picker/motion";
import { cityAt } from "@/lib/geo";
import { shelterCount, sheltersDropped } from "@/lib/labels";
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

afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
});

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
          {...props}
        />
      </I18nProvider>
    );
  }
  render(<Harness />);

  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");

  return screen.getByLabelText("Kraj, pošta ali zavetišče");
}

// The registry shelters with nothing listed sit behind a fold now, shut on
// arrival: none of them is pickable, so their rows are scroll the picker would
// otherwise charge before reaching anything that is. Anything asserting about
// those rows has to open the group first, the same press a visitor makes.
function openOffGroup() {
  fireEvent.click(
    screen.getByRole("button", { name: /Trenutno brez objavljenih živali/ }),
  );
}

// Selection chips carry the same names, so read only the actual list toggles.
function rowOrder(): string[] {
  return Array.from(screen.getByRole("dialog").querySelectorAll("[data-shelter-row] button[aria-pressed]"))
    .map((button) => button.textContent ?? "")
    .filter(
      (text) =>
        text.includes("Zavetišče Sever") || text.includes("Zavetišče Jug"),
    )
    .map((text) => (text.includes("Sever") ? "sever" : "jug"));
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function choosePlace() {
  fireEvent.click(screen.getByRole("button", { name: /^V bližini / }));
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
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
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
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
    const selectedRegion = trigger.querySelector(
      '[data-minimap-region-state="selected"]',
    );

    expect(selectedRegion).toBeTruthy();
    expect(selectedRegion?.getAttribute("class")).toContain(
      "fill-brand-strong",
    );
  });

  it("opens a dialog and says so, rather than posing as a combobox", () => {
    render(
      <I18nProvider locale="sl">
        <LocationPicker
          options={options}
          counts={counts}
          selected={[]}
          onToggle={vi.fn()}
          onToggleMany={vi.fn()}
          resultCount={11}
        />
      </I18nProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });

    // A combobox promises a value and a list to choose it from. This one has
    // neither: it opens a map in a dialog, which is what haspopup says and
    // what expanded then tracks.
    expect(trigger.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("LocationPicker typed location", () => {
  it("keeps the given order until a location is typed", async () => {
    await openPicker();

    expect(rowOrder()).toEqual(["sever", "jug"]);
  });

  it("sorts the nearer shelter first only after the suggested postcode is chosen", async () => {
    const input = await openPicker();

    type(input, "1000");

    expect(rowOrder()).toEqual([]);
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    expect(screen.getByRole("button", { name: /^V bližini Ljubljana/ })).toBeTruthy();
    choosePlace();

    expect(rowOrder()).toEqual(["jug", "sever"]);
  });

  it("sorts from a town typed by name, and names the match in the status line", async () => {
    const input = await openPicker();

    type(input, "ajdovscina");
    choosePlace();

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
    choosePlace();

    expect(rowText()).toContain("km");
  });

  it("says nothing while the input is too short to be a finished attempt", async () => {
    const input = await openPicker();

    type(input, "10");

    expect(screen.queryByText(/Tega kraja ne najdem/)).toBeNull();
  });

  it("says nothing about a place when the words were a name all along", async () => {
    const input = await openPicker();

    type(input, "qqqqq");

    // The one box takes both, so a word the postal table does not know is a
    // shelter being searched for, not a mistake. Calling it one used to be the
    // reflex of a field that could hold nothing else; the list is the answer
    // now, and it is already on screen saying so.
    expect(screen.queryByText(/Tega kraja ne najdem/)).toBeNull();
    expect(screen.getAllByText(/Ni zadetkov za/).length).toBeGreaterThan(0);
  });

  it("still names a postcode that resolves to nothing", async () => {
    const input = await openPicker();

    type(input, "9998");

    // Four digits are the one input that cannot have been a shelter's name, so
    // the empty list has a reason worth giving: the number was wrong, not the
    // roster. The list says it found nothing either, which is true.
    expect(
      screen.getByText("Te poštne številke ne najdem. Preveri vnos."),
    ).toBeTruthy();
    expect(rowOrder()).toEqual([]);
  });

  it("retains the explicitly chosen origin when the input is cleared", async () => {
    const input = await openPicker();

    type(input, "1000");
    choosePlace();
    expect(rowOrder()).toEqual(["jug", "sever"]);

    type(input, "");

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(screen.getByText(/Izhodišče: Ljubljana/)).toBeTruthy();
  });

  it("removes a chosen origin explicitly and restores the unsorted list", async () => {
    const input = await openPicker();
    type(input, "1000");
    choosePlace();
    expect(rowOrder()).toEqual(["jug", "sever"]);

    fireEvent.click(screen.getByRole("button", { name: "Odstrani izhodišče" }));

    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();
  });

  it("hides the geolocation button while a typed place drives the sort", async () => {
    const input = await openPicker();

    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();

    type(input, "1000");
    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();
    choosePlace();
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();

    type(input, "");
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();
  });

  it("puts a geolocation error away once the user types a place", async () => {
    const input = await openPicker();

    // jsdom has no navigator.geolocation, so the toggle errors synchronously.
    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    expect(screen.getByText("Brskalnik ne pozna lokacije.")).toBeTruthy();

    type(input, "1000");
    choosePlace();

    expect(screen.queryByText("Brskalnik ne pozna lokacije.")).toBeNull();
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();
  });

  it("clears the input from its own button", async () => {
    const input = await openPicker();

    type(input, "1000");
    fireEvent.click(screen.getByRole("button", { name: "Počisti vnos" }));

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
  it("hands the sort to a place chosen while geolocation is on", async () => {
    const geolocation = mockGeolocation();
    const input = await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    geolocation.succeed();
    expect(rowOrder()).toEqual(["sever", "jug"]);

    type(input, "1000");
    choosePlace();

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();
  });

  it("discards a fix that arrives after the place was chosen", async () => {
    const geolocation = mockGeolocation();
    const input = await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    type(input, "1000");
    choosePlace();
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
  it("clears a typed place on Escape and keeps the dialog open", async () => {
    const input = await openPicker();

    type(input, "1000");
    fireEvent.keyDown(input, { key: "Escape" });

    expect((input as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("clears a typed name on Escape and keeps the dialog open", async () => {
    const input = await openPicker();

    type(input, "Sever");
    expect(rowOrder()).toEqual(["sever"]);

    fireEvent.keyDown(input, { key: "Escape" });

    // One box, one rung on the Escape ladder, whichever of the two things it
    // was holding.
    expect((input as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("focuses the place suggestion on Enter without silently choosing it", async () => {
    const input = await openPicker();

    type(input, "1000");
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^V bližini Ljubljana/ }));
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    expect(rowOrder()).toEqual([]);
    expect((input as HTMLInputElement).value).toBe("1000");
  });

  it("follows the visible order into the place suggestion when a city also matches a shelter", async () => {
    const input = await openPicker();
    type(input, "Ljubljana");
    expect(rowOrder()).toEqual(["jug"]);
    input.focus();
    fireEvent.keyDown(input, { key: "Enter" });
    const suggestion = screen.getByRole("button", { name: /^V bližini Ljubljana/ });
    expect(document.activeElement).toBe(suggestion);
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    expect(document.querySelector("[data-picker-trigger]")?.getAttribute("aria-label")).toContain("Vsa zavetišča");

    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).toBe(suggestion);
  });
});

// Where focus lands when the dialog opens on a fine pointer. The stub at the
// top of this file answers every query with false, which is the touch path
// where radix keeps its default; these tests answer the pointer query alone
// so the open reaches the branch that has to choose. A text input draws its
// focus ring however focus arrived, so a mouse open must not land in the box,
// and a keyboard open must: the ring is noise over one and the point of the
// other.
describe("LocationPicker open focus", () => {
  const onAFinePointer = (fine: boolean) => {
    (
      window.matchMedia as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((media: string) => ({
      matches: fine && media === FINE_POINTER,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  };

  afterEach(() => onAFinePointer(false));

  it("lands a mouse open on the dialog itself, not in the box", async () => {
    onAFinePointer(true);
    const input = await openPicker();

    // openPicker opens with a click, and a jsdom click moves no focus, so the
    // body is still what activeElement holds. A body is never focus-visible,
    // which is the same answer a real mouse gives.
    expect(document.activeElement).not.toBe(input);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("lands a keyboard open in the box", async () => {
    onAFinePointer(true);
    await openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Zapri" }));

    // jsdom has no keyboard, but it does answer :focus-visible for anything
    // focused, so focusing the trigger is the whole of what a keyboard open
    // looks like from openedWithKeyboard's side.
    const trigger = screen.getByRole("button", { name: /Zavetišče:/ });
    trigger.focus();
    fireEvent.click(trigger);

    const input = await screen.findByLabelText("Kraj, pošta ali zavetišče");
    expect(document.activeElement).toBe(input);
  });
});

// The field searches shelter names and cities; a recognized place offers an
// explicit nearby action. Completing a town name must never silently change
// the question or hide the shelter match the visitor was looking for.
describe("LocationPicker merged field", () => {
  const field = () => screen.getByLabelText("Kraj, pošta ali zavetišče");

  /** Which glyph the box is wearing, which is the only thing on screen that
   *  says which of the two questions it is currently asking. */
  const mode = () =>
    screen
      .getByRole("dialog")
      .querySelector("[data-picker-field-mode]")
      ?.getAttribute("data-picker-field-mode");

  it("offers one box and not two", async () => {
    await openPicker();

    // Both old labels are gone, and exactly one text input stands in the
    // panel: the merge is a merge, not a third field added beside them.
    expect(screen.queryByLabelText("Išči zavetišče po imenu…")).toBeNull();
    expect(screen.queryByLabelText("Bližina: kraj ali pošta")).toBeNull();
    expect(
      screen
        .getByRole("dialog")
        .querySelectorAll("input[aria-label='Kraj, pošta ali zavetišče']"),
    ).toHaveLength(1);
  });

  it("filters the list by name while the words are not a place", async () => {
    await openPicker({ offSite });

    type(field(), "Sever");

    expect(rowOrder()).toEqual(["sever"]);
    expect(mode()).toBe("name");
    // A name says nothing about an origin, so no row has a distance and the
    // geolocation toggle is still on offer.
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    expect(screen.getByRole("button", { name: "Najbližje prvo" })).toBeTruthy();
  });

  it("sorts the whole list from a place without filtering it", async () => {
    await openPicker();

    type(field(), "Maribor");
    expect(rowOrder()).toEqual(["sever"]);
    expect(mode()).toBe("name");
    choosePlace();

    // Every row is still there. "Maribor" is in Zavetišče Sever's own row text
    // as its city, so a field that went on filtering after resolving the place
    // would have thrown Ljubljana's shelter away from the visitor who just
    // said where they were.
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(mode()).toBe("place");
    expect(
      screen.getByText("Izhodišče: Maribor. Razvrščeno po bližini."),
    ).toBeTruthy();
  });

  it("keeps city-name matches until the nearby suggestion is chosen", async () => {
    await openPicker();
    const input = field();

    // "Lju" is not a place yet: five districts are named "Ljubljana - X" and
    // the table refuses to guess between them (see findByKey). So it is a
    // name, and the only row carrying it is the Ljubljana one.
    type(input, "Lju");
    expect(rowOrder()).toEqual(["jug"]);
    expect(mode()).toBe("name");

    type(input, "Ljubljana");

    expect(rowOrder()).toEqual(["jug"]);
    expect(mode()).toBe("name");
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    choosePlace();

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(mode()).toBe("place");
    expect(
      screen.getByText("Izhodišče: Ljubljana. Razvrščeno po bližini."),
    ).toBeTruthy();

    // Editing searches within the chosen origin instead of dropping it.
    type(input, "Lju");
    expect(rowOrder()).toEqual(["jug"]);
    expect(mode()).toBe("name");
    expect(screen.getByText(/Izhodišče: Ljubljana/)).toBeTruthy();
  });

  it("focuses the top name match on Enter without selecting it", async () => {
    await openPicker();
    const input = field();

    type(input, "sever");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(document.activeElement?.textContent).toContain("Zavetišče Sever");
    expect(
      screen
        .getByRole("dialog")
        .querySelector('[data-shelter-row="sever"] button[aria-pressed]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("turns geolocation off when the nearby suggestion is chosen", async () => {
    const geolocation = mockGeolocation();
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    geolocation.succeed();
    expect(rowOrder()).toEqual(["sever", "jug"]);

    // The most recent act wins, exactly as it did in the place box: a typed
    // town is a newer answer than a fix, so the fix goes off rather than
    // quietly outranking what was just typed.
    type(field(), "1000");
    choosePlace();

    expect(rowOrder()).toEqual(["jug", "sever"]);
    expect(screen.queryByRole("button", { name: "Najbližje prvo" })).toBeNull();
  });

  it("selects what is in the box when the field is focused again", async () => {
    const input = await openPicker();

    type(input, "1000");
    input.focus();

    // The box holds one answer at a time, so coming back to it means
    // replacing, not appending.
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(4);
  });

  it("walks into the list on ArrowDown, in either mode", async () => {
    const input = await openPicker();

    type(input, "Sever");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Zavetišče Sever");

    type(input, "1000");
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^V bližini Ljubljana/ }));
    choosePlace();
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Zavetišče Jug");
  });

  it("clears the box from its own button, whichever mode it is in", async () => {
    const input = await openPicker();

    type(input, "Sever");
    fireEvent.click(screen.getByRole("button", { name: "Počisti vnos" }));

    expect((input as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(document.activeElement).toBe(input);
  });
});

describe("LocationPicker search announcement", () => {
  const live = () =>
    screen.getByRole("dialog").querySelector('[aria-live="polite"].sr-only')!
      .textContent ?? "";

  it("says how many shelters the query left", async () => {
    await openPicker();
    const search = screen.getByLabelText("Kraj, pošta ali zavetišče");

    // Nothing typed is nothing to say: the region carries the selection alone
    // until there is a search to report on.
    expect(live()).not.toContain("Zadetki");

    type(search, "Sever");

    expect(live()).toContain(`Zadetki: ${shelterCount(1, "sl")}`);
    // The selection summary the region already carried is still in it. The
    // search is a clause on the end, not a replacement.
    expect(live()).toContain("Vsa zavetišča");
  });

  it("counts the off-site rows too, because the query narrowed them as well", async () => {
    await openPicker({ offSite });
    const search = screen.getByLabelText("Kraj, pošta ali zavetišče");

    // "Zavetišče" matches all three rows, the two live ones and the registry
    // one under its own heading.
    type(search, "Zavetišče");

    expect(live()).toContain(`Zadetki: ${shelterCount(3, "sl")}`);
  });

  it("announces the empty state in the same words it draws it", async () => {
    await openPicker();
    const search = screen.getByLabelText("Kraj, pošta ali zavetišče");

    type(search, "zzzzz");

    // The visible empty state is inside the list scroller, which nobody is
    // looking at while typing into the box above it. Same sentence either way,
    // so the two cannot drift apart: the drawn one and the announced one are
    // both here, which is why this has to pick the drawn one out by hand.
    const drawn = screen
      .getAllByText(/Ni zadetkov za/)
      .find((node) => !node.classList.contains("sr-only"))!;
    expect(drawn.textContent).toContain("zzzzz");
    expect(live()).toContain("Ni zadetkov za »zzzzz«");
  });

  it("goes quiet again when the query is cleared", async () => {
    await openPicker();
    const search = screen.getByLabelText("Kraj, pošta ali zavetišče");

    type(search, "zzzzz");
    type(search, "");

    expect(live()).not.toContain("Ni zadetkov");
    expect(live()).not.toContain("Zadetki");
  });
});

describe("LocationPicker responsive body", () => {
  const dialog = () => screen.getByRole("dialog");

  it("reserves the body for content below its persistent header", async () => {
    await openPicker();
    const stage = dialog().querySelector("[data-picker-stage]")!;
    const title = screen.getByRole("heading", { name: "Izberi zavetišča" });
    const header = title.closest("[data-picker-header]")!;
    expect(stage.contains(header)).toBe(false);
    expect(header.parentElement).toBe(stage.parentElement);
    expect(stage.className).toContain("min-h-0");
    expect(stage.className).toContain("flex-1");
  });

  it("gives map and list their own phone view above the same footer", async () => {
    await openPicker();
    const stage = dialog().querySelector("[data-map-stage]")!;
    const panel = dialog().querySelector("[data-picker-panel]")!;
    expect(stage.className).toContain("max-lg:hidden");
    expect(panel.className).not.toContain("max-lg:hidden");
    expect(stage.className).toContain("bottom-(--picker-footer-h)");
    expect(panel.className).toContain("bottom-(--picker-footer-h)");

    fireEvent.click(dialog().querySelector("[data-picker-show-map]")!);
    expect(stage.className).not.toContain("max-lg:hidden");
    expect(panel.className).toContain("max-lg:hidden");
    expect(screen.getByRole("button", { name: "Pokaži 11 živali" })).toBeTruthy();
  });

  it("keeps the shelter list scrollable without fading its text", async () => {
    await openPicker();
    const list = dialog().querySelector("[data-picker-list-scroll]")!;
    expect(list.className).toContain("min-h-0");
    expect(list.className).toContain("overflow-y-auto");
    expect(list.className).not.toContain("fade-scroll");
  });
});

describe("LocationPicker off-site shelters", () => {
  it("links a shelter with no animals to its page", async () => {
    await openPicker({ offSite });
    openOffGroup();

    const link = screen.getByRole("link", { name: /Zavetišče Vzhod/ });

    expect(link.getAttribute("href")).toBe("/zavetisca/vzhod");
  });

  it("heads the rows it cannot filter by, and leaves the legend out of it", async () => {
    await openPicker();

    expect(screen.queryByText(/Trenutno brez objavljenih živali/)).toBeNull();

    cleanup();
    await openPicker({ offSite });

    // The heading over the rows, and nothing else. The legend explains the
    // hollow ring in its own words, which are not these.
    const heading = screen.getAllByText(/Trenutno brez objavljenih živali/);
    expect(heading).toHaveLength(1);
    // It counts what it is holding shut, which is where "Zavetišč z živalmi:
    // 11 od 17" went: that fraction was only ever an explanation of this
    // group, so it is said on the group rather than in a status line above a
    // list the group sits at the foot of.
    expect(heading[0].textContent).toContain("(1)");
  });

  it("folds the group shut on arrival, and opens it on a press", async () => {
    await openPicker({ offSite });

    // Nothing in the group is pickable, so every row of it is scroll charged
    // before the list reaches anything that is.
    expect(screen.queryByRole("link", { name: /Zavetišče Vzhod/ })).toBeNull();

    openOffGroup();

    expect(screen.getByRole("link", { name: /Zavetišče Vzhod/ })).toBeTruthy();
  });

  it("opens itself when it holds the only answer to a search", async () => {
    const place = await openPicker({ offSite });
    const search = screen.getByLabelText(/Kraj, pošta ali zavetišče/);

    // A fold hiding the sole match draws a live list with nothing in it over a
    // group holding the answer, which reads as "not found" on a list that
    // found it.
    fireEvent.change(search, { target: { value: "Vzhod" } });

    expect(screen.getByRole("link", { name: /Zavetišče Vzhod/ })).toBeTruthy();
    expect(place).toBeTruthy();
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
    openOffGroup();

    const marker = screen
      .getByRole("dialog")
      .querySelector('[data-marker-key*="celje" i]')!;
    fireEvent.pointerEnter(marker);

    const link = screen.getByRole("link", { name: /Zavetišče Vzhod/ });
    expect(link.getAttribute("data-highlighted")).toBe("true");
  });

  it("reveals the off-site row within its list without shifting the search controls", async () => {
    await openPicker({ offSite });
    openOffGroup();
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector<HTMLElement>("[data-picker-list-scroll]")!;
    const column = dialog.querySelector<HTMLElement>("[data-picker-panel-content]")!;
    const link = screen.getByRole("link", { name: /Zavetišče Vzhod/ });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 100 });
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 }) as DOMRect;
    link.getBoundingClientRect = () => ({ top: 180, bottom: 224, height: 44 }) as DOMRect;
    const marker = dialog.querySelector('[data-marker-key*="celje" i]')!;
    fireEvent.pointerEnter(marker);

    await waitFor(() => expect(scroller.scrollTop).toBe(124));
    expect(column.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("holds that scroll while a shelter's details are open, and tints the row anyway", async () => {
    // Sever needs something to say, or it is offered no info control to press:
    // the chevron is gated on the same hasDetails test the panel's own fill is
    // drawn behind.
    await openPicker({
      offSite,
      summaries: new Map<string, ShelterSummary>([
        ["sever", { species: [{ species: "dog", count: 3 }] }],
      ]),
    });
    openOffGroup();
    const dialog = screen.getByRole("dialog");

    // Someone asked about a shelter, so from here on the list is carrying an
    // answer worth more than any hover. A map click cannot produce this state
    // any more; the row's own info control is the only thing that can.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaži podrobnosti za Zavetišče Sever",
      }),
    );
    expect(
      dialog.querySelector('[data-slot="collapsible"][data-state="open"]'),
    ).toBeTruthy();
    scrollIntoView.mockClear();

    fireEvent.pointerEnter(
      dialog.querySelector('[data-marker-key*="celje" i]')!,
    );

    // The echo still happens where it costs nothing.
    expect(
      screen
        .getByRole("link", { name: /Zavetišče Vzhod/ })
        .getAttribute("data-highlighted"),
    ).toBe("true");
    // What is gone is the list being dragged out from under the open panel.
    // The off-site rows sit at the very bottom of the list under their own
    // heading, so this was the hover that threw the answer furthest off.
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

  it("explains the dashed boundary only while a region is partly picked", async () => {
    // Two shelters in one region, so picking one of them leaves that region
    // between states and the map outlines it with dashes.
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
          />
        </I18nProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
    }

    renderWith([]);
    expect(screen.queryByText("Delno izbrana regija")).toBeNull();

    cleanup();
    renderWith(["jug"]);
    expect(screen.getAllByText("Delno izbrana regija").length).toBeGreaterThan(
      0,
    );

    cleanup();
    renderWith(["jug", "sever"]);
    expect(screen.queryByText("Delno izbrana regija")).toBeNull();

    // Fully picked instead: the mixed-state row stands down and the selected row
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
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));

    const label = screen.getAllByText("Izbrana regija")[0];
    const swatch = label.querySelector("span[aria-hidden]") as HTMLElement;
    // The same token the map's selected region fills with (shelter-map.tsx
    // REGION_LOOK.selected), not --brand-border: that token sits too
    // close to the ramp's darkest step for the legend to teach the right
    // colour. See --map-selected-fill's definition in globals.css.
    expect(swatch.className).toContain("bg-[var(--map-selected-fill)]");
    expect(swatch.className).not.toContain("brand-border");
  });

  it("explains the hollow circle only while an empty shelter is on the map", async () => {
    await openPicker();
    expect(screen.queryByText("Brez objavljenih živali")).toBeNull();

    cleanup();
    // The off-site shelter places in Celje with nothing listed, which is the
    // hollow circle the row is about.
    await openPicker({ offSite });
    // Once, because there is one legend now.
    expect(screen.getAllByText("Brez objavljenih živali").length).toBe(1);
  });

  it("draws that row without a breakpoint deciding it", async () => {
    await openPicker({ offSite });

    const legend = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-map-legend]")!;
    const row = Array.from(legend.children).find((child) =>
      child.textContent?.includes("Brez objavljenih živali"),
    )!;

    // The row follows the markers, and the markers follow the plate the map
    // has measured rather than a width the row could guess at. So there is no
    // max-md:hidden left here: the row exists exactly when the map says it is
    // drawing hollow circles. "LocationPicker marker copy" below is where the
    // two sides of that are pinned together.
    expect(row.className).not.toContain("max-md:hidden");
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

// Choosing on the map reveals the corresponding shelter details and keeps
// the list in context. Removing a selection preserves the details being read.
describe("LocationPicker map picking", () => {
  // Both shelters, because the info control is only offered for a shelter
  // there is something to say about: a row with no summary behind it gets no
  // chevron rather than one that turns and reveals a blank strip, so a test
  // reaching for Jug's details has to give Jug something to show.
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
    ["jug", { species: [{ species: "cat", count: 8 }] }],
  ]) as Map<string, ShelterSummary>;

  // Stateful on purpose: half of what a click does turns on whether the value
  // was already picked, so a harness whose toggles land nowhere would only
  // ever exercise the picking half. The spies still record every call; they
  // just also do what animal-grid's real handlers do.
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
            summaries={summaries}
            {...props}
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
    return { onToggle, onToggleMany };
  }

  const dialog = () => screen.getByRole("dialog");

  /** The one shelter whose details are open, by value, or null. The row sits
   *  inside the collapsible that opens, so the open cell names its own
   *  shelter. Read this rather than the panel's contents: a shelter the picker
   *  has no summary for opens to nothing at all, and "nothing to say" is not
   *  the same state as "closed". */
  const expanded = () =>
    dialog()
      .querySelector('[data-slot="collapsible"][data-state="open"]')
      ?.querySelector("[data-shelter-row]")
      ?.getAttribute("data-shelter-row") ?? null;

  /** The info control on a shelter's row, by the shelter's name. */
  const info = (label: string) =>
    screen.getByRole("button", { name: `Pokaži podrobnosti za ${label}` });

  /** The marker group of the town a shelter sits in. Single-shelter towns
   *  answer as a whole, so the group itself is what takes the click. */
  function marker(city: string): Element {
    return dialog().querySelector(`[data-marker-key*="${city}" i]`)!;
  }

  /** A shelter's own list row. Its name is on the marker as well, so the row
   *  is told apart by being the real <button> of the two. The info control
   *  beside it carries a name of its own and never matches an anchored one. */
  function row(label: RegExp): HTMLElement | undefined {
    return screen
      .getAllByRole("button", { name: label })
      .find((node) => node.tagName === "BUTTON");
  }

  it("selects the shelter and opens its matching details", () => {
    const { onToggleMany } = openMap();

    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledTimes(1);
    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
    expect(expanded()).toBe("sever");
    expect(dialog().querySelector("[data-shelter-details]")).not.toBeNull();
  });

  it("selects a region and reveals the first matching shelter", () => {
    const { onToggleMany } = openMap();

    fireEvent.click(screen.getByRole("button", { name: /^Podravska:/ }));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(expanded()).toBe("sever");
    expect(dialog().querySelector("[data-shelter-details]")).not.toBeNull();
    expect(
      dialog()
        .querySelector("[data-shelter-row='sever'] button")!
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Počisti izbor (1)" }),
    ).toBeTruthy();
  });

  it("picks a second shelter on the next click, leaving both picked", () => {
    openMap();

    fireEvent.click(marker("maribor"));
    fireEvent.click(marker("ljubljana"));

    // Nothing to replace and nothing to dismiss: two clicks are two toggles.
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
    expect(row(/^Zavetišče Jug/)?.getAttribute("aria-pressed")).toBe("true");
    expect(expanded()).toBe("jug");
  });

  it("leaves the way out to the footer pill, and the map claims nothing", () => {
    openMap();

    fireEvent.click(marker("maribor"));

    // The deleted card used to end in its own "Prikaži živali", directly under
    // one shelter's own count, and clicking it applied every filter in the
    // dialog rather than that shelter's animals. One button in the footer now,
    // and the number it wears is the whole dialog's, not one shelter's: the
    // objection to the card's button was never the count, it was a primary
    // action sitting under a single shelter's row and answering for every
    // other one.
    expect(screen.queryByRole("button", { name: "Prikaži živali" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Prikaži/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Pokaži 11 živali" }),
    ).toBeTruthy();
  });

  it("drops an already-picked shelter on a single click", () => {
    // Already picked: a click un-chooses it outright. There is no "ask first"
    // step, and nothing on screen decides what the click does.
    const { onToggleMany } = openMap({ selected: ["sever"] });

    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("picks it straight back up on the click after a drop", () => {
    const { onToggleMany } = openMap({ selected: ["sever"] });

    fireEvent.click(marker("maribor"));
    onToggleMany.mockClear();

    // Every click is a plain toggle, so the next one on the same marker picks
    // Sever again.
    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
    expect(expanded()).toBe("sever");
  });

  it("reveals a new map choice when an old query and another shelter's details are active", () => {
    openMap();
    fireEvent.click(info("Zavetišče Jug"));
    const search = screen.getByLabelText("Kraj, pošta ali zavetišče");
    type(search, "Jug");
    expect(rowOrder()).toEqual(["jug"]);

    fireEvent.click(marker("maribor"));

    expect((search as HTMLInputElement).value).toBe("");
    expect(rowOrder()).toEqual(["sever", "jug"]);
    expect(expanded()).toBe("sever");
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("true");
  });

  it("drops one shelter without collapsing another's details", () => {
    const { onToggleMany } = openMap({ selected: ["sever"] });

    // Jug is being read about while Sever is being dropped. The two acts have
    // nothing to say to each other.
    fireEvent.click(info("Zavetišče Jug"));
    expect(expanded()).toBe("jug");
    onToggleMany.mockClear();

    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(expanded()).toBe("jug");
  });

  it("leaves a dropped shelter's own details standing", () => {
    openMap({ selected: ["sever"] });

    fireEvent.click(info("Zavetišče Sever"));
    expect(dialog().querySelector("[data-shelter-details]")).toBeTruthy();

    fireEvent.click(marker("maribor"));

    // The converse of the rule the info control keeps: collapsing never
    // un-chooses, and un-choosing never collapses. Taking a shelter out of the
    // filter says nothing about whether you had finished reading about it, and
    // this is the pairing the old card got backwards.
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(expanded()).toBe("sever");
    expect(dialog().querySelector("[data-shelter-details]")).toBeTruthy();
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
    onToggleMany.mockClear();

    // A marker click names one shelter, not the region it sits in, so it
    // drops only that shelter, in one click.
    fireEvent.click(marker("maribor"));

    expect(onToggleMany).toHaveBeenCalledWith(["sever"]);
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("true");
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
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Zavetišče Vzhod/)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("drops the whole region in one click, leaving an unrelated shelter picked", () => {
    // The old rule needed the region's own card on screen before a click
    // would drop it; a click on it while some other card was up only put the
    // region's card back. That "ask first" step is gone with the cards
    // themselves: a picked region drops every shelter it holds on the very
    // next click, and touches nothing outside itself.
    const { onToggleMany } = openMap({
      options: [
        ...options,
        { value: "vzhod", label: "Zavetišče Vzhod", city: "Ptuj" },
      ],
      counts: new Map([...counts, ["vzhod", 5]]),
    });
    const region = () => screen.getByRole("button", { name: /^Podravska:/ });

    fireEvent.click(region());
    // Jug is not in Podravska, so it is the shelter the region drop below has
    // no business reaching.
    fireEvent.click(marker("ljubljana"));
    expect(row(/^Zavetišče Jug/)?.getAttribute("aria-pressed")).toBe("true");
    onToggleMany.mockClear();

    fireEvent.click(region());

    // The region hands its shelters over in map order, which is the layout's
    // business and not this test's, so the two are compared as a set.
    expect(onToggleMany).toHaveBeenCalledTimes(1);
    expect([...onToggleMany.mock.calls[0][0]].sort()).toEqual([
      "sever",
      "vzhod",
    ]);
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

  it("leaves open details standing when the whole selection is cleared", () => {
    openMap({ selected: ["sever"] });

    fireEvent.click(info("Zavetišče Sever"));
    expect(expanded()).toBe("sever");

    // "Počisti izbor (n)" empties the selection. The card this replaces folded
    // with it, because it was an answer about something picked; open details
    // are an answer about a shelter, picked or not, and nobody asked for them
    // to go.
    fireEvent.click(screen.getByRole("button", { name: /Počisti izbor/ }));

    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(expanded()).toBe("sever");
  });

  it("lets Enter focus a search match without changing selection or details", () => {
    const { onToggle } = openMap();

    const search = screen.getByPlaceholderText("Kraj, pošta ali zavetišče");
    fireEvent.change(search, { target: { value: "sever" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onToggle).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row(/^Zavetišče Sever/));
    expect(row(/^Zavetišče Sever/)?.getAttribute("aria-pressed")).toBe("false");
    expect(expanded()).toBeNull();
  });

  it("stops the hovered marker repeating what the open details already say", () => {
    openMap();

    // With nothing open, the marker annotates in full.
    fireEvent.pointerEnter(marker("maribor"));
    expect(dialog().querySelector("[data-callout-metadata]")).toBeTruthy();
    expect(dialog().querySelector("[data-callout-species]")).toBeTruthy();

    fireEvent.pointerLeave(marker("maribor"));
    fireEvent.click(info("Zavetišče Sever"));
    fireEvent.pointerEnter(marker("maribor"));

    // The name stays: a mark under the pointer still has to say what it is.
    // The count and the species breakdown go, because the panel open in the
    // list is already carrying both. It is the open details that suppress
    // them now, never a click: a click leaves nothing on screen to repeat.
    expect(dialog().querySelector("[data-callout-metadata]")).toBeNull();
    expect(dialog().querySelector("[data-callout-species]")).toBeNull();
    expect(screen.getAllByText("Zavetišče Sever").length).toBeGreaterThan(0);
  });
});

// Desktop keeps the map and list side by side; phones switch between them.
describe("LocationPicker map and list views", () => {
  const dialog = () => screen.getByRole("dialog");
  const stage = () => dialog().querySelector<HTMLElement>("[data-map-stage]")!;
  const panel = () =>
    dialog().querySelector<HTMLElement>("[data-picker-panel]")!;

  it("folds to a rail and hands the width back to the map", async () => {
    await openPicker();

    expect(stage().dataset.mapStage).toBe("panel");
    // The flat desktop panel and map divide the body at lg. Collapsing the
    // panel hands its width back to the map without either overlapping.
    expect(stage().className).toContain("lg:w-[calc(100%-24rem)]");
    expect(screen.getByLabelText("Kraj, pošta ali zavetišče")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));

    expect(stage().dataset.mapStage).toBe("rail");
    expect(stage().className).toContain("lg:w-[calc(100%-3rem)]");
    expect(panel().className).toContain("lg:w-12");
    // The rail is what is left at lg: one control, and no list beside it. The
    // list block stays mounted because the sheet below lg is still out and both
    // docks share one copy of it, so what says "folded" here is the class that
    // takes it off the screen at lg.
    expect(dialog().querySelector("[data-picker-rail]")).toBeTruthy();
    const list = screen
      .getByLabelText("Kraj, pošta ali zavetišče")
      .closest("[data-picker-panel] > div")!;
    expect(list.className).toContain("lg:hidden");
  });

  it("keeps the current scope beside the desktop list control", async () => {
    await openPicker();
    const head = dialog().querySelector<HTMLElement>("[data-picker-panel-head]")!;
    expect(head.textContent).toContain("Vsa zavetišča");
    expect(head.querySelector("[data-picker-collapse]")).not.toBeNull();
  });

  it("counts the picked shelters beside that heading", async () => {
    await openPicker({ selected: ["jug"] });

    const head = dialog().querySelector<HTMLElement>(
      "[data-picker-panel-head]",
    )!;
    // A selected shelter is named in full rather than represented by an
    // unnamed count of selected shelters.
    const group = head.firstElementChild!;
    expect(group.textContent).toContain("Zavetišče Jug");
    expect(group.textContent).not.toContain("1 od 2");
  });

  it("puts the list back when the rail is pressed", async () => {
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));
    fireEvent.click(dialog().querySelector<HTMLElement>("[data-picker-rail]")!);

    expect(stage().dataset.mapStage).toBe("panel");
    expect(dialog().querySelector("[data-picker-rail]")).toBeNull();
    expect(screen.getByLabelText("Kraj, pošta ali zavetišče")).toBeTruthy();
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
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));

    const rail = dialog().querySelector<HTMLElement>("[data-picker-rail]")!;
    expect(rail.textContent).toContain("1");
  });

  it("brings both docks back when the map is clicked with the panel folded", async () => {
    await openPicker();

    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));
    // Folded to the rail. The rows stay mounted behind it, which is the whole
    // reason the fold has to give way below: the trace of a click is in a list
    // nobody can see from here.
    expect(dialog().querySelector<HTMLElement>("[data-picker-rail]")!).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Podravska:/ }));

    // A click has to leave a visible trace, so the dock holding the list
    // unfolds: the panel on a desktop, the sheet on a phone. The trace is the
    // list itself, which is why the fold is what has to give: a picked row
    // nobody can see is not an answer.
    expect(stage().dataset.mapStage).toBe("panel");
    expect(
      dialog().querySelector<HTMLElement>("[data-picker-panel]")!.dataset
        .pickerSheet,
    ).toBe("open");
    expect(
      dialog()
        .querySelector("[data-shelter-row='sever'] button")!
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows the active phone view and never deselects both segments", async () => {
    await openPicker();
    const showList = dialog().querySelector<HTMLElement>("[data-picker-show-list]")!;
    const showMap = dialog().querySelector<HTMLElement>("[data-picker-show-map]")!;
    expect(showList.getAttribute("aria-checked")).toBe("true");
    expect(showMap.getAttribute("aria-checked")).toBe("false");
    expect(panel().dataset.pickerSheet).toBe("open");

    fireEvent.click(showMap);
    expect(showMap.getAttribute("aria-checked")).toBe("true");
    expect(showList.getAttribute("aria-checked")).toBe("false");
    expect(panel().dataset.pickerSheet).toBe("collapsed");
    fireEvent.click(showMap);
    expect(showMap.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(showList);
    expect(showList.getAttribute("aria-checked")).toBe("true");
    expect(panel().dataset.pickerSheet).toBe("open");
  });

  it("keeps selected shelter names in the footer when switching views", async () => {
    await openPicker({ selected: ["jug"] });
    const chip = screen.getByRole("button", { name: "Odstrani zavetišče: Zavetišče Jug" });
    fireEvent.click(dialog().querySelector("[data-picker-show-map]")!);
    expect(chip.closest("[data-picker-footer]")).not.toBeNull();
    expect(panel().contains(chip)).toBe(false);
    expect(chip.textContent).toContain("Zavetišče Jug");
  });

  it("hangs the legend and the credits off the plate, not off the dialog frame", async () => {
    await openPicker();

    const legend = dialog().querySelector<HTMLElement>("[data-map-legend]")!;
    // One level up. It was three while a fold sat between them, taking the
    // legend off a phone and leaving the CC BY credit behind as its sibling,
    // and two while the credit shared the caption and needed its own
    // pointer-events wrapper to sit beside. The credit floats on the plate now
    // and the legend is the caption's only child, so the caption is its parent.
    const block = legend.parentElement!;

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

  it("moves a map selection and focus into the list even without shelter details", async () => {
    await openPicker();

    // Fold the sheet first: a tap has to produce a visible answer, so it has to
    // bring its own dock back up.
    const showMap = dialog().querySelector<HTMLElement>("[data-picker-show-map]")!;
    fireEvent.click(showMap);
    expect(showMap.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(dialog().querySelector('[data-marker-key*="maribor" i]')!);

    expect(panel().dataset.pickerSheet).toBe("open");
    const selectedRow = dialog().querySelector("[data-shelter-row='sever'] button")!;
    expect(selectedRow.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(selectedRow);
  });

  // The paw layer asks this element how wide the plate is actually drawn, and
  // it can only ask an element that declares itself a container.
  it("names the stage a container, so the map can be measured by what holds it", async () => {
    await openPicker();

    expect(stage().className).toContain("@container/map-stage");
  });
});

// This dialog used to answer two questions from one panel, with a tab row to
// switch between them. The found-animal lookup is a page now
// (found-animal-page.tsx), so what is left to assert is the absence: no second
// tab, and no lone first one standing where a row of two used to be.
describe("LocationPicker one question", () => {
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

  it("offers no found-animal tab, with the coverage table in hand", async () => {
    // The table is what used to gate the tab row, so this is the case that
    // would have drawn it.
    await openPicker({ municipalities });

    expect(dialog().querySelector("[data-picker-tab]")).toBeNull();
    expect(dialog().textContent).not.toContain("Najdena žival");
    // Nor the finder's own field, which was the whole of that tab.
    expect(screen.queryByLabelText("Občina ali poštna številka …")).toBeNull();
  });

  it("titles itself with the one question it asks", async () => {
    await openPicker({ municipalities });

    expect(screen.getByRole("dialog", { name: "Izberi zavetišča" })).toBeTruthy();
  });

  it("keeps the way out and the selection news, which the tab used to hide", async () => {
    await openPicker({ municipalities, selected: ["sever"] });

    expect(screen.getByRole("button", { name: "Pokaži 11 živali" })).toBeTruthy();
    const footer = dialog().querySelector("[data-picker-footer]")!;
    expect(footer.textContent).toContain("Zavetišče Sever");
  });

  // The coverage table stays a prop of this dialog for one thing only: naming
  // who answers for the občine inside a region the roster leaves empty. That
  // is map furniture rather than a mode, and it is covered by its own
  // describe, "LocationPicker region coverage", further down.
});

// What a shelter is, asked of the list and answered in the list. The floating
// card that used to answer it was opened by the row's own click, which is the
// click that toggles, so a picked shelter could never be asked about and a
// phone could never ask at all. The answer is a collapsible under the
// shelter's own row now, opened by a second control the row carries whether or
// not it is picked.
describe("LocationPicker shelter details", () => {
  const dialog = () => screen.getByRole("dialog");

  const summaries = new Map<string, ShelterSummary>([
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
    ["jug", { species: [{ species: "dog", count: 7 }] }],
  ]);

  /** Selection has to be real here: the whole behaviour is that inspecting and
   *  picking never reach each other, and a fixed `selected` prop could only
   *  ever show one half of that. */
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
            summaries={summaries}
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  }

  /** The open panel's content, or null when nothing is open. */
  const details = () =>
    dialog().querySelector<HTMLElement>("[data-shelter-details]");

  /** Every shelter whose collapsible is open, by value. Read off the cell
   *  rather than off the content, because a shelter the picker knows nothing
   *  about opens to nothing at all and "nothing to say" is not "closed". */
  const expanded = () =>
    Array.from(
      dialog().querySelectorAll('[data-slot="collapsible"][data-state="open"]'),
    ).map((cell) =>
      cell
        .querySelector("[data-shelter-row]")
        ?.getAttribute("data-shelter-row"),
    );

  /** The list scroller, reached the way the sheet-height block reaches it. */
  const list = () =>
    screen
      .getByLabelText("Kraj, pošta ali zavetišče")
      .closest("[data-picker-panel]")!
      .querySelector("[data-picker-list-scroll]")!;

  const show = (label: string) =>
    screen.getByRole("button", { name: `Pokaži podrobnosti za ${label}` });
  const hide = (label: string) =>
    screen.getByRole("button", { name: `Skrij podrobnosti za ${label}` });

  /** The list's own toggle for a shelter. Named by value: the map carries
   *  aria-pressed on every one of its targets too, and several of them wear
   *  the same shelter's name. */
  const row = (value: string) =>
    dialog().querySelector<HTMLElement>(
      `[data-shelter-row="${value}"] button[aria-pressed]`,
    )!;

  it("offers the control on an unpicked row too", () => {
    openList(["sever"]);

    // Looking a shelter over before committing to it is the ordinary use, and
    // the row's own click cannot serve it because that click toggles. The
    // control used to appear only on a picked row, which is the one row whose
    // details you have already decided you do not need.
    expect(show("Zavetišče Jug")).toBeTruthy();
    expect(show("Zavetišče Sever")).toBeTruthy();

    fireEvent.click(show("Zavetišče Jug"));

    expect(details()).toBeTruthy();
    expect(row("jug").getAttribute("aria-pressed")).toBe("false");
  });

  it("opens the panel under that shelter's own row, inside the list", () => {
    openList();

    fireEvent.click(show("Zavetišče Sever"));

    const cell = details()!.closest('[data-slot="collapsible"]')!;
    // Row and panel are one cell: the answer is attached to the shelter it is
    // about instead of floating at the head of the scroller, and it scrolls
    // with the rows rather than covering them.
    expect(
      cell
        .querySelector("[data-shelter-row]")
        ?.getAttribute("data-shelter-row"),
    ).toBe("sever");
    expect(
      row("sever").compareDocumentPosition(details()!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(list().contains(cell)).toBe(true);
  });

  it("breaks the shelter down by species and names who has waited longest", () => {
    openList();

    fireEvent.click(show("Zavetišče Sever"));

    // Every species the shelter has and only those: no rabbit row for a
    // shelter with no rabbits.
    expect(
      details()!.querySelector("[data-pick-species='dog']")?.textContent,
    ).toBe("Pes: 3");
    expect(
      details()!.querySelector("[data-pick-species='cat']")?.textContent,
    ).toBe("Mačka: 1");
    expect(details()!.querySelector("[data-pick-species='rabbit']")).toBeNull();
    // The site's own species icons, not a stand-in.
    expect(details()!.querySelector(".lucide-dog")).toBeTruthy();
    expect(details()!.querySelector(".lucide-cat")).toBeTruthy();
    expect(details()!.textContent).toContain("Najdlje čaka: Mila, 10 let");
  });

  it("says less rather than guessing where a shelter has nothing to say", () => {
    openList();

    fireEvent.click(show("Zavetišče Jug"));

    expect(
      details()!.querySelector("[data-pick-species='dog']")?.textContent,
    ).toBe("Pes: 7");
    // Jug's summary carries no longest wait, so the panel carries no line
    // about one. It is the summary it was given, never a shape padded out.
    expect(details()!.textContent).not.toContain("Najdlje čaka");
  });

  it("rotates the chevron rather than growing words into the row", () => {
    openList();

    const control = show("Zavetišče Sever");
    // A chevron down, not a circled i. The panel opens where the row sits, and
    // those two glyphs promise different things: an i is the mark for a tip
    // that floats and goes away, a chevron is the mark for a row that opens in
    // place. The i needed a caption above the list to explain itself, which is
    // the line this glyph makes unnecessary.
    expect(control.querySelector(".lucide-chevron-down")).toBeTruthy();
    expect(control.textContent).toBe("");

    fireEvent.click(control);

    // The same control, same box, glyph rotated. No words grow into it: the
    // width for them came out of the shelter's own name, and the open row is
    // the one row whose name is being read. Never an X either, because an X
    // promises the dismissal of something floating and this panel is part of
    // the row.
    expect(control.getAttribute("aria-expanded")).toBe("true");
    expect(control.textContent).toBe("");
    expect(control.querySelector(".lucide-chevron-up")).toBeTruthy();
    expect(control.querySelector(".lucide-x")).toBeNull();
    // The words that used to sit on the surface are in the accessible name,
    // which also still names the shelter, because a screen reader meets this
    // control on its own, out of the row's context.
    expect(hide("Zavetišče Sever")).toBe(control);
  });

  it("keeps one shelter open at a time", () => {
    openList();

    fireEvent.click(show("Zavetišče Sever"));
    expect(expanded()).toEqual(["sever"]);

    fireEvent.click(show("Zavetišče Jug"));

    // The panel is a column in a scroller that can be 5rem tall in the sheet.
    // Two open at once would put the rows between them off the screen and
    // leave neither answer beside the question it belongs to.
    expect(expanded()).toEqual(["jug"]);
    expect(dialog().querySelectorAll("[data-shelter-details]")).toHaveLength(1);
  });

  it("collapses without touching the selection", () => {
    openList(["sever"]);

    fireEvent.click(show("Zavetišče Sever"));
    fireEvent.click(hide("Zavetišče Sever"));

    expect(details()).toBeNull();
    // Closing an answer is not un-choosing. The way out of a selection is the
    // row's own toggle or the shelter's marker, and nothing else.
    expect(row("sever").getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves the details open when the row un-chooses the shelter", () => {
    openList(["jug"]);

    fireEvent.click(show("Zavetišče Jug"));

    fireEvent.click(row("jug"));

    // The other direction of the same rule. The old card was derived from the
    // selection and folded here, which meant reading about a shelter and
    // deciding against it took the reasons away mid-sentence.
    expect(row("jug").getAttribute("aria-pressed")).toBe("false");
    expect(expanded()).toEqual(["jug"]);
    expect(details()).toBeTruthy();
  });

  it("picks from the row without opening anything", () => {
    openList();

    fireEvent.click(row("jug"));

    // The row reports aria-pressed, so its click has to flip it and can carry
    // no second meaning beside that.
    expect(row("jug").getAttribute("aria-pressed")).toBe("true");
    expect(details()).toBeNull();
    expect(expanded()).toEqual([]);
  });

  it("draws the panel at every width, phones included", () => {
    openList();

    fireEvent.click(show("Zavetišče Sever"));

    // The point of moving this inline. The floating card was max-lg:hidden,
    // and the sheet is this dialog's own default state below lg, so a phone
    // had no shelter inspection at all: the control opened state nobody could
    // see. Nothing on the path from the panel out to the scroller may hide it,
    // however that hiding is spelled.
    let node: Element | null = details();
    while (node && node !== list()) {
      expect(node.className).not.toMatch(/(^|:)hidden(\s|$)/);
      node = node.parentElement;
    }
    expect(node).toBe(list());
  });
});

// Collapsing an open panel is one act, and two controls ask for it: the row's
// own trigger and Escape. Neither goes near the selection, neither moves the
// keyboard, and Escape unwinds the dialog one layer at a time rather than
// closing the whole map over an open panel.
//
// The whole block runs at the stub's own width, which answers every media
// query "no" and is therefore the narrow stage. That used to be the width at
// which none of this existed: the card was drawn from lg up, so the Escape
// rung had to ask about the breakpoint before spending a press. The panel is
// drawn at every width, so the rung is unconditional and this block is the
// below-lg proof of it.
describe("LocationPicker details dismissal", () => {
  const dialog = () => screen.getByRole("dialog");
  const details = () =>
    dialog().querySelector<HTMLElement>("[data-shelter-details]");
  const show = (label: string) =>
    screen.getByRole("button", { name: `Pokaži podrobnosti za ${label}` });
  const hide = (label: string) =>
    screen.getByRole("button", { name: `Skrij podrobnosti za ${label}` });
  const search = () => screen.getByLabelText("Kraj, pošta ali zavetišče");

  const summaries = new Map<string, ShelterSummary>([
    ["jug", { species: [{ species: "dog", count: 7 }] }],
  ]);

  /** Both toggles are real: closing must be shown to leave the selection
   *  exactly as it found it, which a fixed `selected` prop cannot show. */
  function openList(initial: string[] = []) {
    function Harness() {
      const [selected, setSelected] = useState<string[]>(initial);
      const apply = (values: string[]) =>
        setSelected((current) => toggleValues(current, values));
      return (
        <I18nProvider locale="sl">
          <LocationPicker
            options={options}
            counts={counts}
            selected={selected}
            onToggle={(value) => apply([value])}
            onToggleMany={apply}
            resultCount={11}
            summaries={summaries}
          />
        </I18nProvider>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  }

  /** The list's own toggle for a shelter, by value: the map wears the same
   *  shelter's name on several targets of its own, all reporting
   *  aria-pressed. */
  const row = (value: string) =>
    dialog().querySelector<HTMLElement>(
      `[data-shelter-row="${value}"] button[aria-pressed]`,
    )!;

  it("leaves the keyboard on the control that closed the panel", () => {
    openList(["jug"]);

    const control = show("Zavetišče Jug");
    control.focus();
    fireEvent.click(control);

    fireEvent.click(hide("Zavetišče Jug"));

    expect(details()).toBeNull();
    // No focus management at all, which is the change the inline panel earns.
    // The card's X sat inside the card and vanished with it, so a dismissal
    // had to put the keyboard somewhere by hand; this control stays mounted
    // exactly where it was and keeps focus itself, and there is nothing
    // focusable inside the panel for a collapse to strand.
    expect(document.activeElement).toBe(control);
    // Closing an answer is not un-choosing.
    expect(row("jug").getAttribute("aria-pressed")).toBe("true");
  });

  it("re-opens the details of a picked row, without dropping the shelter", () => {
    openList();

    fireEvent.click(show("Zavetišče Jug"));
    fireEvent.click(row("jug"));
    fireEvent.click(hide("Zavetišče Jug"));
    expect(details()).toBeNull();
    expect(row("jug").getAttribute("aria-pressed")).toBe("true");

    // A click on the row itself would drop Jug: the row reports aria-pressed,
    // so activating it flips it. The info control beside it is the only way
    // back into the details of a shelter that is already picked, which is why
    // it may never have been gated on the row being unpicked.
    fireEvent.click(show("Zavetišče Jug"));

    expect(details()).toBeTruthy();
    expect(row("jug").getAttribute("aria-pressed")).toBe("true");
  });

  it("collapses the panel on Escape and leaves the dialog open", async () => {
    openList(["jug"]);

    fireEvent.click(show("Zavetišče Jug"));
    fireEvent.keyDown(dialog(), { key: "Escape" });

    expect(details()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeTruthy();
    // The rung collapses and stops there. The selection is not Escape's to
    // touch, and the keyboard is left where the press found it.
    expect(row("jug").getAttribute("aria-pressed")).toBe("true");

    // Nothing inside the dialog is left to unwind, so the next press takes the
    // dialog itself.
    fireEvent.keyDown(dialog(), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("empties the box Escape was pressed in before it reaches the panel", () => {
    openList();

    fireEvent.click(show("Zavetišče Jug"));
    type(search(), "Jug");

    fireEvent.keyDown(search(), { key: "Escape" });

    // The innermost rung takes the press, so the search clears and the panel
    // is still standing for the next one.
    expect((search() as HTMLInputElement).value).toBe("");
    expect(details()).toBeTruthy();
  });

  it("closes the dialog on the first press with nothing open", async () => {
    // The rung above it is unconditional now, so this is the state that has to
    // be checked instead: an open panel is the only thing that can spend a
    // press before the dialog does.
    openList();

    fireEvent.click(row("jug"));
    fireEvent.keyDown(dialog(), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

// The second way into this dialog, after the trigger: an animal card's
// shelter name, asking where that shelter is.
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
    // The coverage table is map furniture, not something this ask reads, and
    // guarding on it would have made a card's shelter name inert wherever the
    // table is missing.
    askForJug({ municipalities: undefined });

    expect(dialog().querySelectorAll("[data-map-spotlight]")).toHaveLength(1);
  });
});

// The map's own answer for a region it draws no shelters in. Somebody is
// still responsible for a stray found there, and the coverage table this
// component takes already knows who.
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
    expect(screen.getByText("Zanje skrbi Zavetišče Nova Gorica")).toBeTruthy();
  });

  it("carries the same fact in the region's own label", async () => {
    await openPicker({ municipalities });

    expect(region("Goriška").getAttribute("aria-label")).toBe(
      "Goriška: Ni zavetišč v tej regiji. Zanje skrbi Zavetišče Nova Gorica",
    );
  });

  it("leaves a live region's own counts to speak for it", async () => {
    await openPicker({ municipalities });

    // Keyboard focus, which names a region on contact where a pointer waits
    // out the dwell (see the region dwell tests in shelter-map.test.tsx).
    fireEvent.focus(region("Osrednjeslovenska"));

    // Ljubljana's coverage entry names a shelter for this region too, and a
    // region that has its own shelters has no use for it: the counts are the
    // answer there.
    expect(dialog().querySelector("[data-callout-note]")).toBeNull();
    expect(screen.getByText(/1 zavetišče · 7 živali/)).toBeTruthy();
  });

  it("names a live region to a rested pointer, and still owes it no note", async () => {
    await openPicker({ municipalities });

    hoverRegion(region("Osrednjeslovenska"));

    // The name and the counts, which are what a region owes a pointer that
    // stopped on it. Not the covered-by line: that exists for regions the map
    // draws no shelters in, and this one has its own.
    expect(screen.getByText("Osrednjeslovenska")).toBeTruthy();
    expect(screen.getByText(/1 zavetišče · 7 živali/)).toBeTruthy();
    expect(dialog().querySelector("[data-callout-note]")).toBeNull();
  });
});

describe("LocationPicker persistent footer", () => {
  it("closes from a footer outside the collapsible panel, naming the result count", async () => {
    await openPicker();

    const pill = screen.getByRole("button", { name: "Pokaži 11 živali" });
    expect(pill.closest("[data-picker-panel]")).toBeNull();
    expect(pill.closest("[data-picker-footer]")).not.toBeNull();
    expect(pill.className).not.toContain("rounded-full");
    expect(pill.className).not.toContain("shadow-lg");
    // The count is not a promise about the press. Every filter write in this
    // dialog goes straight to the URL on the click that made it, so by the
    // time this is read the eleven are already what is behind the map; the
    // button names them the way the trigger's own label names the shelters.
    expect(pill.textContent).toBe("Pokaži 11 živali");

    fireEvent.click(pill);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains zero results and provides a filter reset beside the way out", async () => {
    const onClearFilters = vi.fn();
    await openPicker({ counts: new Map(), resultCount: 0, onClearFilters });

    const footer = screen.getByRole("dialog").querySelector("[data-picker-footer]")!;
    expect(footer.textContent).toContain("0 živali");
    expect(footer.textContent).toContain("Nobena objavljena žival ne ustreza tvoji izbiri.");
    expect(screen.getByRole("button", { name: "Nazaj k rezultatom" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Počisti vse filtre" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("widens shelter selection at zero when other shelters have matching animals", async () => {
    await openPicker({ selected: ["sever"], counts: new Map([["jug", 7]]), resultCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Vsa zavetišča" }));
    expect(screen.queryByRole("button", { name: "Odstrani zavetišče: Zavetišče Sever" })).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("keeps named removable selections and the result action outside either folded dock", async () => {
    await openPicker({ selected: ["sever", "jug"] });
    const dialog = screen.getByRole("dialog");
    const footer = dialog.querySelector("[data-picker-footer]")!;
    const pill = screen.getByRole("button", { name: "Pokaži 11 živali" });
    expect(document.querySelector("[data-picker-trigger]")?.getAttribute("aria-label")).toContain("Zavetišče: Izbrano: 2");
    fireEvent.click(screen.getByRole("button", { name: "Skrij seznam" }));
    fireEvent.click(dialog.querySelector("[data-picker-show-map]")!);
    expect(dialog.querySelector("[data-picker-panel]")?.contains(footer)).toBe(false);
    expect(footer.contains(pill)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Odstrani zavetišče: Zavetišče Sever" }));
    expect(screen.queryByRole("button", { name: "Odstrani zavetišče: Zavetišče Sever" })).toBeNull();
    expect(screen.getByRole("button", { name: "Odstrani zavetišče: Zavetišče Jug" })).toBeTruthy();
    expect(document.querySelector("[data-picker-trigger]")?.getAttribute("aria-label")).toContain("Zavetišče: Zavetišče Jug");
  });

  it("removes later selections from the summary and closes only that summary on Escape", async () => {
    await openPicker({
      options: [...options, { value: "vzhod", label: "Zavetišče Vzhod", city: "Celje" }],
      counts: new Map([...counts, ["vzhod", 2]]),
      selected: ["sever", "jug", "vzhod"],
    });
    const picker = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Pokaži izbrana zavetišča (3)" }));
    const summary = await screen.findByRole("dialog", { name: "Izbrano: 3" });
    expect(within(summary).getAllByRole("button", { name: /^Odstrani zavetišče:/ })).toHaveLength(3);

    fireEvent.click(within(summary).getByRole("button", { name: "Odstrani zavetišče: Zavetišče Vzhod" }));
    await waitFor(() => expect(summary.getAttribute("aria-label")).toBe("Izbrano: 2"));
    expect(within(summary).queryByRole("button", { name: "Odstrani zavetišče: Zavetišče Vzhod" })).toBeNull();
    fireEvent.keyDown(summary, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Izbrano: 2" })).toBeNull());
    expect(screen.getByRole("dialog")).toBe(picker);
    expect(screen.getByRole("button", { name: "Odstrani zavetišče: Zavetišče Sever" })).toBeTruthy();
  });

  it("says the count once, on the button, and not again above the list", async () => {
    await openPicker();

    // The panel used to carry a two-fact status line here, "Zavetišč z
    // živalmi: 2 od 2 · Prikazano: 11 živali". The right half moved onto the
    // button above; the left half was the roster reporting that it had counted
    // itself, which no press in this dialog acts on, and it now lives on the
    // heading of the one group it was ever an explanation of.
    const panel = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-picker-panel]")!;
    expect(panel.textContent).not.toContain("Zavetišč z živalmi");
    expect(panel.textContent).not.toContain("Prikazano:");
  });

  it("counts the roster, not the species facet, on the way in", async () => {
    // One live shelter with nothing left under the active filters, one with
    // animals, one off-site. The label itself carries no number any more
    // (see lib/labels.ts allShelters), so the roster is checked the way the
    // dialog actually shows it: every one of the three renders as a row,
    // whatever the active filters left standing.
    await openPicker({
      counts: new Map([["jug", 7]]),
      offSite,
      resultCount: 7,
    });

    const dialog = screen.getByRole("dialog");
    const head = dialog.querySelector<HTMLElement>("[data-picker-panel-head]")!;
    expect(head.textContent).toContain("Vsa zavetišča");
    // The live rows still render both shelters, whatever the species facet
    // left standing (only "jug" carries a count here).
    for (const id of ["sever", "jug"]) {
      expect(dialog.querySelector(`[data-shelter-row='${id}']`)).toBeTruthy();
    }
    // The off-site roster is behind its own fold, closed on arrival; opening
    // it is what proves it is part of the roster too.
    openOffGroup();
    // Off-site rows have nothing to filter by, so they render as links out to
    // the shelter's own page rather than as toggles: see the href branch in
    // shelter-rows.tsx.
    for (const row of offSite) {
      expect(
        screen.getByRole("link", { name: new RegExp(row.label) }),
      ).toBeTruthy();
    }
  });

  it("keeps a shelter with nothing left under the filters, saying so in its row", async () => {
    await openPicker({ counts: new Map([["jug", 7]]), resultCount: 7 });

    // Dropped from the list, it would have been a shelter the trigger counted
    // and the visitor could not find. It stays, wearing the zero, and it is
    // not selectable: the map cannot pick it either, so the list and the
    // country agree about what a click can do.
    const row = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-shelter-row='sever']")!;

    expect(row.textContent).toContain("Zavetišče Sever");
    expect(row.textContent).toContain("0");
    expect(row.querySelector("button")!.hasAttribute("disabled")).toBe(true);
  });

  it("offers a named reset only while something is selected", async () => {
    await openPicker();
    expect(screen.queryByRole("button", { name: /Počisti izbor/ })).toBeNull();

    cleanup();
    await openPicker({ selected: ["jug"] });

    // Named for what it clears: the panel holds a search box and a place box
    // that each have a clear of their own, so a bare "Počisti" said which of
    // the three to nobody.
    const reset = screen.getByRole("button", { name: "Počisti izbor (1)" });
    fireEvent.click(reset);

    expect(screen.queryByRole("button", { name: /Počisti izbor/ })).toBeNull();
  });

  it("keeps the title in the persistent dialog header", async () => {
    await openPicker();

    const title = screen.getByRole("heading", { name: "Izberi zavetišča" });
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
    choosePlace();

    // The legend now renders twice in markup (an on-map panel for md+, an
    // inline row for phones) with CSS choosing which one shows, so both
    // copies exist in jsdom regardless of viewport.
    expect(screen.getAllByText("Izhodišče").length).toBeGreaterThan(0);
  });

  it("keeps the GURS credit visible whenever the map is shown", async () => {
    await openPicker();
    const dialogNode = screen.getByRole("dialog");
    fireEvent.click(dialogNode.querySelector("[data-picker-show-map]")!);
    const credit = dialogNode.querySelector("[data-slot='map-attribution']")!;
    expect(credit.textContent).toContain("GURS");
    let node: Element | null = credit;
    while (node && node !== dialogNode) {
      expect(node.className).not.toMatch(/(^|:)hidden(\s|$)/);
      node = node.parentElement;
    }
    expect(node).toBe(dialogNode);
  });

  it("keeps the legend on a phone too, where the states it explains are drawn", async () => {
    const input = await openPicker({ offSite });
    type(input, "1000");
    choosePlace();

    // The legend used to be taken away with the sheet below lg, which is the
    // dialog's own default state: a phone was left with a density ramp, a
    // hollow marker and an origin ring and no key to any of them. It is one
    // legend at every width now, compacted by CSS rather than replaced.
    const legend = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>("[data-map-legend]")!;

    let node: Element | null = legend;
    while (node && node.hasAttribute("data-map-stage") === false) {
      expect(node.className).not.toContain("max-lg:hidden");
      node = node.parentElement;
    }

    // The same readable legend size applies to every viewport.
    expect(legend.className).toContain("text-xs");
    expect(legend.className).not.toContain("text-3xs");
    expect(legend.className).toContain("gap-x-4");
  });
});

// A utility name that does not exist fails silently: the class stays in the
// markup, the compiler emits no rule for it, and the property it was meant to
// set is simply never set. Nothing throws, nothing warns, and a rendering test
// asserting the class is present passes on the drop. That is what happened to
// the sheet's top corners, which spent a while square while the class saying
// otherwise sat on the element.
//
// This reads the picker components and CSS as text rather than through a
// compiler, because the question is narrow enough to answer that way: is every radius name this
// component spells a name globals.css defines, either as a @utility of its own
// or as an entry in the --radius-* namespace Tailwind generates its scale
// from. Not a CSS build; the build is what would have to be run to answer
// anything wider, and nothing wider is being asked.
describe("LocationPicker radius utilities", () => {
  const web = process.cwd();
  const css = readFileSync(join(web, "app", "globals.css"), "utf8");
  const source = [
    "view.tsx",
    "picker-dock.tsx",
    "footer.tsx",
    "picker-map-stage.tsx",
    "picker-search.tsx",
    "picker-shelter-list.tsx",
  ]
    .map((file) =>
      readFileSync(
        join(web, "components", "filters", "location-picker", file),
        "utf8",
      ),
    )
    .join("\n");

  // Declared by hand, whole names. rounded-ui and rounded-ui-top are both of
  // these, and they exist because --radius-ui is a :root variable: the
  // compiler reads a scale out of @theme and out of nothing else, so the two
  // corners this component needs have to be written as utilities.
  const declared = new Set(
    Array.from(css.matchAll(/@utility\s+(rounded-[\w-]+)/g), (m) => m[1]),
  );

  // The scale the generated names come from: Tailwind's own, plus every
  // --radius-* the @theme block adds to it.
  const themeStart = css.indexOf("@theme inline {");
  const theme = css.slice(themeStart, css.indexOf("\n}", themeStart));
  const scale = new Set([
    "none",
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "full",
    ...Array.from(theme.matchAll(/--radius-([\w-]+):/g), (m) => m[1]),
  ]);

  // Every side and corner the radius utilities are generated for, logical and
  // physical, with the whole-box form first.
  const sides = [
    "",
    "s",
    "e",
    "t",
    "r",
    "b",
    "l",
    "ss",
    "se",
    "es",
    "ee",
    "tl",
    "tr",
    "br",
    "bl",
  ];

  function defined(name: string): boolean {
    if (declared.has(name)) return true;
    // An arbitrary value or a variable shorthand carries its own length, so
    // there is no name to look up. toggle-group.tsx reaches for exactly this
    // to get one corner of --radius-ui.
    if (/^rounded-(?:[a-z]{1,2}-)?[[(]/.test(name)) return true;
    return sides.some((side) => {
      const prefix = side === "" ? "rounded-" : `rounded-${side}-`;
      return name.startsWith(prefix) && scale.has(name.slice(prefix.length));
    });
  }

  // Class names as written, taken from double-quoted single-line literals,
  // which is what prettier leaves every className in this file as. Variants
  // are stripped off the front; prose in a comment is not read at all, because
  // a class name is only a class name inside a string.
  const used = new Set<string>();
  for (const [literal] of source.matchAll(/"[^"\n]*"/g)) {
    for (const token of literal.slice(1, -1).split(/\s+/)) {
      const name = token.slice(token.lastIndexOf(":") + 1);
      if (name.startsWith("rounded-")) used.add(name);
    }
  }

  it("spells every radius it uses the way globals.css defines it", () => {
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((name) => !defined(name))).toEqual([]);
  });

  it("rejects an undefined radius utility", () => {

    // The check is only worth having if it rejects the spelling that broke.
    // rounded-t-* is generated from the --radius-* namespace and --radius-ui
    // is not in it, so that name resolves to no rule and both corners come out
    // square.
    expect(defined("rounded-t-ui")).toBe(false);
    expect(used.has("rounded-t-ui")).toBe(false);

    // And it still admits the ordinary shapes around it.
    expect(defined("rounded-ui")).toBe(true);
    expect(defined("rounded-ui-top")).toBe(true);
    expect(defined("rounded-full")).toBe(true);
    expect(defined("rounded-t-md")).toBe(true);
    expect(defined("rounded-[2px]")).toBe(true);
  });
});

// The dialog is a stack of scrollers: the list inside the panel's content
// column, and that column inside the sheet. scrollIntoView cannot tell them
// apart, because it scrolls every scrollable ancestor of the element it is
// called on, and the column's own scroll is a shipped fix that may not be
// taken away (see e2e/shelter-picker-landscape.spec.ts). So the one invariant
// worth pinning is which scroller moves.
describe("LocationPicker list scrolling", () => {
  const summaries = new Map<string, ShelterSummary>([
    ["sever", { species: [{ species: "dog", count: 3 }] }],
  ]);

  /** scrollTop in jsdom is a property with no layout behind it, so it is
   *  replaced by one that remembers what was written to it. What is asserted
   *  is the writing, which is the whole of what this component does. */
  function trackScrollTop(element: HTMLElement): () => number {
    let value = 0;
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        value = next;
      },
    });
    return () => value;
  }

  const rect = (top: number, bottom: number) =>
    ({ top, bottom, height: bottom - top }) as DOMRect;

  /** The panel's content column: the scroller the list sits in, and the one
   *  carrying the dialog's title, tabs and confirm button past it. */
  const columnOf = (list: HTMLElement) =>
    list.closest<HTMLElement>("[data-picker-panel-content]")!;

  afterEach(() => vi.restoreAllMocks());

  it("scrolls the list to the shelter panel it just opened, and nothing else", async () => {
    await openPicker({ summaries });
    const dialog = screen.getByRole("dialog");
    const list = dialog.querySelector<HTMLElement>("[data-picker-list-scroll]")!;
    const column = columnOf(list);
    const listTop = trackScrollTop(list);
    const columnTop = trackScrollTop(column);
    // jsdom lays nothing out and reports every rectangle as zero, which reads
    // as "already in view" and would leave any scroll a no-op. The list is a
    // 100px window and the cell that opens sits 160px below its foot.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      rect(180, 260),
    );
    // Assigned rather than spied: vi.spyOn on an instance whose method lives
    // on the prototype hands back the prototype's own mock, and setting a
    // return value on it would answer for every element in the tree.
    list.getBoundingClientRect = () => rect(0, 100);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaži podrobnosti za Zavetišče Sever",
      }),
    );

    // The cell is 160px under the list's foot, so the list comes down by
    // exactly that: "nearest" means the bottom edge, not the middle.
    expect(listTop()).toBe(160);
    // And the column has not moved, which is the invariant. It used to lose
    // about ninety pixels here, which is the dialog title, the selection
    // summary and the tab row.
    expect(columnTop()).toBe(0);
  });

  it("leaves both scrollers alone when the panel is already in view", async () => {
    await openPicker({ summaries });
    const dialog = screen.getByRole("dialog");
    const list = dialog.querySelector<HTMLElement>("[data-picker-list-scroll]")!;
    const column = columnOf(list);
    const listTop = trackScrollTop(list);
    const columnTop = trackScrollTop(column);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      rect(10, 60),
    );
    // Assigned rather than spied: vi.spyOn on an instance whose method lives
    // on the prototype hands back the prototype's own mock, and setting a
    // return value on it would answer for every element in the tree.
    list.getBoundingClientRect = () => rect(0, 100);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Pokaži podrobnosti za Zavetišče Sever",
      }),
    );

    expect(listTop()).toBe(0);
    expect(columnTop()).toBe(0);
  });
});

// Two things in the dialog talk about markers, and the map is what draws them.
// The signal is the map's measured plate, reported outward, so all three say
// the same thing at every size instead of two of them guessing from a
// breakpoint. jsdom lays nothing out, so the plate's box and the observer that
// watches it are both supplied here.
describe("LocationPicker marker copy", () => {
  const originalObserver = globalThis.ResizeObserver;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalObserver;
  });

  /** A plate of the given pixel size, measured once on mount. The real
   *  observer re-measures on every resize; the map calls measure() itself
   *  before observing, which is the call this stands in for. */
  function plateDrawnAt(width: number, height: number) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width,
      height,
    } as DOMRect);
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

  it("tells a plate with markers on it that a shelter can be clicked", async () => {
    // 2.2px to the user unit, which is the desktop plate.
    plateDrawnAt(704, 462);
    await openPicker({ offSite });

    expect(screen.getByText("Klikni regijo ali zavetišče")).toBeTruthy();
    // And the legend explains the hollow circle, because there is one drawn.
    expect(
      screen.getByRole("dialog").querySelector("[data-legend-empty]"),
    ).toBeTruthy();
  });

  it("asks for a region instead once the plate is too small to carry them", async () => {
    // A phone held sideways: wide enough to be well past md, and a fifth of
    // the scale a marker needs. The old md gate said "click a shelter" here.
    plateDrawnAt(767, 21);
    await openPicker({ offSite });

    expect(screen.getByText("Izberi regijo na zemljevidu")).toBeTruthy();
    expect(screen.queryByText("Klikni regijo ali zavetišče")).toBeNull();
    // No marker is drawn, so nothing in the legend explains one.
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("[data-marker-key]")).toBeNull();
    expect(dialog.querySelector("[data-legend-empty]")).toBeNull();
  });
});

// Where the sheet lands when the dialog opens. The map is the dialog, and on a
// screen with no height to spare an open sheet leaves it a line rather than a
// plate, so the fold is where such a screen starts.
describe("LocationPicker sheet landing", () => {
  const originalMatchMedia = window.matchMedia;

  function onAViewport(short: boolean) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: short && media === "(max-height: 32rem)",
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  const sheet = () =>
    screen.getByRole("dialog").querySelector("[data-picker-sheet]");

  it("lands open on a screen with height to spare", async () => {
    onAViewport(false);
    await openPicker();

    expect(sheet()?.getAttribute("data-picker-sheet")).toBe("open");
  });

  it("lands folded on a phone held sideways", async () => {
    onAViewport(true);
    await openPicker();

    expect(sheet()?.getAttribute("data-picker-sheet")).toBe("collapsed");
    // The persistent view switch opens the list while the footer keeps
    // the current selection and result action available.
    const showList = screen
      .getByRole("dialog")
      .querySelector("[data-picker-show-list]")!;
    expect(showList.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(showList);
    expect(sheet()?.getAttribute("data-picker-sheet")).toBe("open");
  });
});

describe("LocationPicker audit regressions", () => {
  it("keeps postcode typing as search until the place suggestion is chosen", async () => {
    const input = await openPicker();
    for (const query of ["1", "10", "100"]) {
      type(input, query);
      expect(rowOrder()).toEqual([]);
      expect(screen.queryByRole("button", { name: /^V bližini / })).toBeNull();
      expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    }
    type(input, "1000");
    expect(rowOrder()).toEqual([]);
    expect(screen.getByRole("button", { name: /^V bližini Ljubljana/ })).toBeTruthy();
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
    choosePlace();
    expect(rowOrder()).toEqual(["jug", "sever"]);
  });
  it("trims pasted shelter names", async () => {
    const input = await openPicker();
    type(input, " Zavetišče Jug ");
    expect(rowOrder()).toEqual(["jug"]);
  });
  it("asks for a row choice when Enter has more than one match", async () => {
    const onToggle = vi.fn();
    const input = await openPicker({ onToggle });
    type(input, "Zavetišče");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToggle).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toContain("Zavetišče Sever");
  });
  it("keeps unselected zero-match shelters unavailable in both the list and map", async () => {
    const onToggle = vi.fn();
    const onToggleMany = vi.fn();
    await openPicker({ counts: new Map(), resultCount: 0, onToggle, onToggleMany });
    const dialog = screen.getByRole("dialog");
    const row = dialog.querySelector('[data-shelter-row="jug"] button[aria-pressed]')!;
    expect(row.hasAttribute("disabled")).toBe(true);
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("false");
    const region = screen.getByRole("img", { name: /^Osrednjeslovenska:/ });
    expect(region.getAttribute("data-region-state")).toBe("inert");
    fireEvent.click(region);
    fireEvent.keyDown(region, { key: "Enter" });
    const marker = dialog.querySelector('[data-marker-key="ljubljana"]')!;
    expect(marker.getAttribute("data-marker-live")).toBe("false");
    fireEvent.click(marker);
    expect(onToggle).not.toHaveBeenCalled();
    expect(onToggleMany).not.toHaveBeenCalled();
  });
  it("keeps a selected zero-match shelter removable from the map", async () => {
    await openPicker({ counts: new Map(), resultCount: 0, selected: ["jug"] });
    const row = screen.getByRole("dialog").querySelector('[data-shelter-row="jug"] button[aria-pressed]')!;
    expect(row.hasAttribute("disabled")).toBe(false);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    const region = screen.getByRole("button", {
      name: /Osrednjeslovenska:.*0 živali s temi filtri/,
    });
    expect(region.getAttribute("data-region-state")).toBe("selected");
    fireEvent.keyDown(region, { key: "Enter" });
    expect(row.getAttribute("aria-pressed")).toBe("false");
    expect(row.hasAttribute("disabled")).toBe(true);
  });
  it("keeps keyboard focus on the desktop fold control", async () => {
    await openPicker();
    const fold = screen.getByRole("button", { name: "Skrij seznam" });
    fold.focus();
    fireEvent.click(fold);
    expect(document.activeElement).toBe(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
  });
});
