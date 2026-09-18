// @vitest-environment jsdom

// What the picker has to keep true after the hardening pass: a visit that ends
// takes its hover and its geolocation error with it, the search reads a query
// as words rather than one run of characters, and the live region says its
// facts as separate nodes. The stubs, the roster and the door are the picker's
// shared harness (test/location-picker.tsx), which also says why a suite
// cannot import them from another suite.

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  choosePlace,
  dialog,
  offSite,
  openPicker,
  reopenPicker,
  resetPickerSession,
  rowOrder,
  stubMatchMedia,
  stubScrollIntoView,
  type,
} from "@/test/location-picker";
import { fold } from "./location-picker/model";

stubMatchMedia();
stubScrollIntoView();

afterEach(resetPickerSession);

async function closePicker() {
  fireEvent.keyDown(dialog(), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // The picker's history entry is popped a task later (use-picker-history),
  // and a reopen before that lands is closed again by the popstate.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
    expect(rowOrder()).toEqual(["jug"]);
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

    expect(rowOrder()).toEqual(["maribor"]);
  });

  it("finds a row whose words the visitor typed in the other order", async () => {
    const input = await search();

    type(input, "ljubljana zavetisce");

    expect(rowOrder()).toEqual(["jug"]);
  });

  it("ignores the space a visitor typed twice", async () => {
    const input = await search();

    type(input, "zavetisce  maribor");

    expect(rowOrder()).toEqual(["maribor"]);
  });

  it("still narrows to a single word the way it always did", async () => {
    const input = await search();

    type(input, "Snaga");

    expect(rowOrder()).toEqual(["maribor"]);
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
    choosePlace();

    // The chip above this line reads "Ljubljana" and every row carries its
    // own distance, so a status line saying both again was the third telling.
    expect(
      screen.getByRole("button", { name: /^Odstrani izhodišče/ }).textContent,
    ).toContain("Ljubljana");
    expect(screen.queryByText(/Razvrščeno po bližini/)).toBeNull();
  });
});

// The short-screen header padding and the notch inset are deliberately not
// asserted here. Both were class-string checks: jsdom emits no Tailwind and
// lays nothing out, so `short:py-2` and the safe-area inset passed whether or
// not the utility ever produced a rule, and broke on any refactor that moved
// the padding onto another element. Neither is a claim this level can make;
// only a browser at a short landscape viewport can measure them.
