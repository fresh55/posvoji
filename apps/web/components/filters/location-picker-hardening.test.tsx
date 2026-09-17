// @vitest-environment jsdom

// What the picker has to keep true after the hardening pass: a visit that ends
// takes its hover and its geolocation error with it, the search reads a query
// as words rather than one run of characters, and the live region says its
// facts as separate nodes. The render harness is the same one
// location-picker.test.tsx uses, copied rather than imported: that file owns
// its own helpers and nothing there is exported.

import { useState, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/i18n-provider";
import { resetNearbyOriginStore } from "@/hooks/use-nearby-origin";
import { resetNearbyStore } from "@/hooks/use-nearby";
import { toggleValues } from "@/lib/filters";
import { LocationPicker } from "./location-picker";
import { fold } from "./location-picker/model";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

// jsdom has no layout, so it has no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  resetNearbyOriginStore();
  // The query, the chosen place and the geolocation state are one page
  // session shared by every mounted picker, so a test that leaves one behind
  // hands it to the next.
  resetNearbyStore();
});

const options = [
  { value: "sever", label: "Zavetišče Sever", city: "Maribor" },
  { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
];

const counts = new Map([
  ["sever", 4],
  ["jug", 7],
]);

const offSite = [{ value: "vzhod", label: "Zavetišče Vzhod", city: "Celje" }];

function Harness({
  selected: initialSelected = [],
  ...props
}: Partial<ComponentProps<typeof LocationPicker>>) {
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

async function openPicker(
  props: Partial<ComponentProps<typeof LocationPicker>> = {},
) {
  render(<Harness {...props} />);
  await reopenPicker();
  return screen.getByLabelText("Kraj, pošta ali zavetišče");
}

async function reopenPicker() {
  fireEvent.click(screen.getByRole("button", { name: /Zavetišče:/ }));
  await screen.findByRole("dialog");
  // The plate is a dynamic import, so the dialog is on screen a tick before
  // the country is. Everything below reads the map, so wait for it.
  await waitFor(() =>
    expect(dialog().querySelector("[data-slot='map-attribution']")).toBeTruthy(),
  );
}

const dialog = () => screen.getByRole("dialog");

async function closePicker() {
  fireEvent.keyDown(dialog(), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // The picker's history entry is popped a task later (use-picker-history),
  // and a reopen before that lands is closed again by the popstate.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function rowValues(): string[] {
  return Array.from(
    dialog().querySelectorAll<HTMLElement>("[data-shelter-row]"),
  ).map((row) => row.getAttribute("data-shelter-row") ?? "");
}

describe("LocationPicker hover ends with the visit", () => {
  it("opens the next visit with nothing highlighted", async () => {
    await openPicker({ offSite });

    // A dialog unmounts its content on close, so the pointer resting on this
    // marker never gets its leave event. Before the cleanup the value stayed
    // in the controller and the next open drew a tinted row, and scrolled the
    // list to it, with nothing under the pointer.
    fireEvent.pointerEnter(
      dialog().querySelector('[data-marker-key*="maribor" i]')!,
    );
    expect(dialog().querySelector('[data-highlighted="true"]')).toBeTruthy();

    await closePicker();
    await reopenPicker();

    expect(dialog().querySelector('[data-highlighted="true"]')).toBeNull();
  });

  it("stops telling the map about a row the search has hidden", async () => {
    const input = await openPicker();
    const row = dialog().querySelector<HTMLElement>(
      '[data-shelter-row="sever"] button[aria-pressed]',
    )!;

    fireEvent.pointerEnter(row);
    expect(dialog().querySelector("[data-marker-highlighted]")).toBeTruthy();

    // Typing without moving the pointer: the row unmounts under it and no
    // leave event fires, so the marker and its region used to stay lit for a
    // shelter the list no longer held.
    type(input, "Jug");
    expect(rowValues()).toEqual(["jug"]);
    expect(dialog().querySelector("[data-marker-highlighted]")).toBeNull();
  });
});

describe("LocationPicker geolocation error ends with the visit", () => {
  it("does not greet the next visit with the last one's failure", async () => {
    await openPicker();

    // jsdom has no navigator.geolocation, so the toggle errors synchronously.
    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    expect(screen.getByText("Brskalnik ne pozna lokacije.")).toBeTruthy();

    await closePicker();
    await reopenPicker();

    expect(screen.queryByText("Brskalnik ne pozna lokacije.")).toBeNull();
  });
});

describe("LocationPicker search reads a query as words", () => {
  const roster = [
    { value: "maribor", label: "Zavetišče Maribor (Snaga)", city: "Maribor" },
    { value: "jug", label: "Zavetišče Jug", city: "Ljubljana" },
  ];
  const rosterCounts = new Map([
    ["maribor", 4],
    ["jug", 7],
  ]);

  const search = async () => {
    const input = await openPicker({
      options: roster,
      counts: rosterCounts,
    });
    return input;
  };

  it("finds a name whose words the label separates with a bracket", async () => {
    const input = await search();

    // "Zavetišče Maribor (Snaga)": the two words the visitor typed have a
    // bracket between them, which one raw substring could never match.
    type(input, "maribor snaga");

    expect(rowValues()).toEqual(["maribor"]);
  });

  it("finds a row whose words the visitor typed in the other order", async () => {
    const input = await search();

    type(input, "ljubljana zavetisce");

    expect(rowValues()).toEqual(["jug"]);
  });

  it("ignores the space a visitor typed twice", async () => {
    const input = await search();

    type(input, "zavetisce  maribor");

    expect(rowValues()).toEqual(["maribor"]);
  });

  it("still narrows to a single word the way it always did", async () => {
    const input = await search();

    type(input, "Snaga");

    expect(rowValues()).toEqual(["maribor"]);
  });
});

describe("fold", () => {
  it("takes đ down to d, the same as the town table's own folding", () => {
    // lib/geo.ts cityKey folds č ć đ š ž by hand. NFD covers four of the five:
    // đ is a letter of its own with no combining mark to drop.
    expect(fold("Đakovo")).toBe("dakovo");
    expect(fold("Medjimurje")).toBe("medjimurje");
    expect(fold("Črnomelj")).toBe("crnomelj");
  });
});

describe("LocationPicker live region", () => {
  const live = () =>
    dialog().querySelector<HTMLElement>('p.sr-only[aria-live="polite"]')!;

  it("says each fact in its own node", async () => {
    const input = await openPicker();
    type(input, "Sever");

    // One text node meant every keystroke replaced the whole string, so a
    // search re-announced the selection and the running total with it.
    const spans = Array.from(live().querySelectorAll("span")).map(
      (span) => span.textContent,
    );
    expect(spans).toEqual([
      "Vsa zavetišča",
      "Prikazano: 11 živali",
      "Zadetki: 1 zavetišče",
    ]);
    expect(live().textContent).toContain("Vsa zavetišča Prikazano: 11 živali");
  });
});

describe("LocationPicker status line", () => {
  it("leaves a chosen place to the chip that already names it", async () => {
    const input = await openPicker();

    type(input, "1000");
    fireEvent.click(screen.getByRole("button", { name: /^V bližini / }));

    // The chip above this line reads "Ljubljana" and every row carries its
    // own distance, so a status line saying both again was the third telling.
    expect(
      screen.getByRole("button", { name: /^Odstrani izhodišče/ }).textContent,
    ).toContain("Ljubljana");
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
  });
});

describe("LocationPicker short and narrow screens", () => {
  it("tightens the header where there is no height", async () => {
    await openPicker();
    const header = dialog().querySelector<HTMLElement>("[data-picker-header]")!;

    // The 8px is what the landscape plate needs to reach the width its region
    // names are gated on; see the comment on the header in view.tsx.
    expect(header.className).toContain("short:py-2");
  });

  it("takes the notch off the dialog's own width", async () => {
    await openPicker();

    expect(dialog().className).toContain("env(safe-area-inset-left,0px)");
  });
});
