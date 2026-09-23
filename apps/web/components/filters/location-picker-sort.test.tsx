// @vitest-environment jsdom

// The picker's offer to order the grid by distance from the place it was just
// given. The stubs, the roster and the door are the picker's shared harness
// (test/location-picker.tsx), which holds the grid's order the way the page
// does.

import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choosePlace,
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

const offer = () =>
  screen.queryByRole("button", { name: "Razvrsti živali po bližini" });

async function setPlace(props: Partial<ComponentProps<typeof LocationPicker>>) {
  const input = await openPicker(props);
  await type(input, "1000");
  choosePlace();
}

describe("ordering the grid by distance from the picker", () => {
  it("offers it once a place is set, and only then", async () => {
    const onSortChange = vi.fn();
    const input = await openPicker({ sort: "longest-in-shelter", onSortChange });
    expect(offer()).toBeNull();

    await type(input, "1000");
    choosePlace();
    // Offered and not done: an order the visitor chose stays theirs.
    expect(offer()?.getAttribute("aria-pressed")).toBe("false");
    expect(onSortChange).not.toHaveBeenCalled();

    fireEvent.click(offer()!);
    expect(onSortChange).toHaveBeenLastCalledWith("nearest");
  });

  it("gives back the order the grid had before the first press", async () => {
    const onSortChange = vi.fn();
    await setPlace({ sort: "name", onSortChange });

    fireEvent.click(offer()!);
    expect(offer()?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(offer()!);
    expect(onSortChange.mock.calls).toEqual([["nearest"], ["name"]]);
    expect(offer()?.getAttribute("aria-pressed")).toBe("false");
  });

  it("gives the default order back when the grid came in by distance", async () => {
    const onSortChange = vi.fn();
    await setPlace({ sort: "nearest", onSortChange });
    expect(offer()?.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(offer()!);
    expect(onSortChange).toHaveBeenLastCalledWith("longest-in-shelter");
  });

  it("offers nothing where the picker has no grid order to change", async () => {
    await setPlace({});
    expect(offer()).toBeNull();
  });
});
