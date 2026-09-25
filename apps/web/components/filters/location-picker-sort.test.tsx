// @vitest-environment jsdom

// The grid's order following the place the picker is given. The stubs, the
// roster and the door are the picker's shared harness (test/location-picker.tsx),
// which holds the grid's order the way the page does.

import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choosePlace,
  mockGeolocation,
  openPicker,
  resetPickerSession,
  stubMatchMedia,
  stubScrollIntoView,
  type,
} from "@/test/location-picker";
import type { LocationPicker } from "./location-picker";
// The dialog is a lazy chunk. Loaded here, before any test presses the
// trigger, so no press waits on a transform inside its own act.
import "./location-picker/view";

stubMatchMedia();
stubScrollIntoView();

afterEach(resetPickerSession);

async function setPlace(props: Partial<ComponentProps<typeof LocationPicker>>) {
  const input = await openPicker(props);
  await type(input, "1000");
  choosePlace();
}

const removePlace = () =>
  fireEvent.click(screen.getByRole("button", { name: /^Odstrani izhodišče/ }));

describe("the grid following the picker's place", () => {
  it("orders a grid in its default order by distance once a place is chosen", async () => {
    const onSortChange = vi.fn();
    const input = await openPicker({ sort: "longest-in-shelter", onSortChange });

    // Recognising a place is not choosing it.
    await type(input, "1000");
    expect(onSortChange).not.toHaveBeenCalled();

    choosePlace();
    expect(onSortChange.mock.calls).toEqual([["nearest"]]);
    // The toggle that used to carry this out to the grid is gone.
    expect(
      screen.queryByRole("button", { name: "Razvrsti živali po bližini" }),
    ).toBeNull();
  });

  it("gives the default back when the place goes", async () => {
    const onSortChange = vi.fn();
    await setPlace({ sort: "longest-in-shelter", onSortChange });

    removePlace();
    expect(onSortChange.mock.calls).toEqual([
      ["nearest"],
      ["longest-in-shelter"],
    ]);
  });

  it("leaves an order the visitor chose, with the place and without it", async () => {
    const onSortChange = vi.fn();
    await setPlace({ sort: "name", onSortChange });
    removePlace();

    expect(onSortChange).not.toHaveBeenCalled();
  });

  it("leaves a grid that came in by distance where it was when the place goes", async () => {
    // Nearest from a shared link: the picker did not put it there, so taking
    // the place away is not the picker's order to undo.
    const onSortChange = vi.fn();
    await setPlace({ sort: "nearest", onSortChange });
    removePlace();

    expect(onSortChange).not.toHaveBeenCalled();
  });

  it("follows a geolocation fix once it lands, and not the press", async () => {
    const geolocation = mockGeolocation();
    const onSortChange = vi.fn();
    await openPicker({ sort: "longest-in-shelter", onSortChange });

    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    expect(onSortChange).not.toHaveBeenCalled();

    geolocation.succeed();
    expect(onSortChange.mock.calls).toEqual([["nearest"]]);

    // Turning it off again gives the order back, the same as the chip.
    fireEvent.click(screen.getByRole("button", { name: "Najbližje prvo" }));
    expect(onSortChange.mock.calls).toEqual([
      ["nearest"],
      ["longest-in-shelter"],
    ]);
  });

  it("does nothing where the picker has no grid order to change", async () => {
    await setPlace({});
    expect(
      screen.getByRole("button", { name: /^Odstrani izhodišče/ }),
    ).toBeTruthy();
  });
});
