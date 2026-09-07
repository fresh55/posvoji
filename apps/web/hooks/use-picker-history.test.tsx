// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitSearch } from "@/lib/location-search";
import { usePickerHistory } from "./use-picker-history";

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  usePickerHistory(open, () => setOpen(false));
  return (
    <button onClick={() => setOpen(!open)}>
      {open ? "Close map" : "Open map"}
    </button>
  );
}
beforeEach(() =>
  history.replaceState({ foreign: "keep" }, "", "/?campaign=hello%20world"),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});
describe("picker history", () => {
  it("Back dismisses the map and retains the latest filters and foreign query bytes", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open map"));
    act(() => commitSearch("campaign=hello%20world&zavetisce=jug", "replace"));
    act(() => history.back());
    await screen.findByText("Open map");
    expect(location.search).toBe("?campaign=hello%20world&zavetisce=jug");
    expect(history.state).toEqual({ foreign: "keep" });
  });
  it("Close pops exactly once, so the next Back does not encounter a phantom map entry", async () => {
    const back = vi.spyOn(history, "back");
    render(<Harness />);
    fireEvent.click(screen.getByText("Open map"));
    fireEvent.click(screen.getByText("Close map"));
    await waitFor(() => expect(history.state?.locationPicker).toBeUndefined());
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("creates one entry under StrictMode effect replay", async () => {
    const push = vi.spyOn(history, "pushState");
    render(
      <StrictMode>
        <Harness initiallyOpen />
      </StrictMode>,
    );
    expect(push).toHaveBeenCalledTimes(1);
    act(() => history.back());
    await screen.findByText("Open map");
  });
  it("can close a new visit after Back and Forward revisit an old entry", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open map"));
    const oldEntry = history.state.locationPicker;
    act(() => history.back());
    await screen.findByText("Open map");
    act(() => history.forward());
    await waitFor(() => expect(history.state?.locationPicker).toBe(oldEntry));
    fireEvent.click(screen.getByText("Open map"));
    expect(history.state.locationPicker).not.toBe(oldEntry);
    act(() => history.back());
    await screen.findByText("Open map");
  });

});
