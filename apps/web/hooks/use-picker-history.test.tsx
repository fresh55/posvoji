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
import { usePickerHistory, whenLayerCloses } from "./use-picker-history";

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

describe("picker history and the page's scroll", () => {
  /** Every write to history.scrollRestoration and every push, in order, with
   *  the entry each write lands on. jsdom keeps one setting for the whole
   *  history, so the order is what can be asserted. */
  function recordRestoration() {
    const writes: string[] = [];
    let mode: ScrollRestoration = "auto";
    vi.spyOn(history, "scrollRestoration", "get").mockImplementation(() => mode);
    vi.spyOn(history, "scrollRestoration", "set").mockImplementation((next) => {
      mode = next;
      writes.push(
        `${next} on ${history.state?.locationPicker ? "layer" : "page"}`,
      );
    });
    const push = history.pushState.bind(history);
    vi.spyOn(history, "pushState").mockImplementation((...args) => {
      writes.push("push");
      push(...args);
    });
    return writes;
  }

  it("opens over a page entry that will not restore its scroll, and hands it back after the pop", async () => {
    // The pop back to the page used to put its scroll back where it was when
    // the layer opened, over the return to the results a pick had made.
    const writes = recordRestoration();
    render(<Harness />);

    fireEvent.click(screen.getByText("Open map"));
    expect(writes).toEqual(["manual on page", "push", "auto on layer"]);

    fireEvent.click(screen.getByText("Close map"));
    await waitFor(() => expect(writes).toHaveLength(4));
    expect(writes[3]).toBe("auto on page");
    expect(history.scrollRestoration).toBe("auto");
  });

  it("hands the setting back after a back gesture too", async () => {
    const writes = recordRestoration();
    render(<Harness />);

    fireEvent.click(screen.getByText("Open map"));
    act(() => history.back());

    await screen.findByText("Open map");
    await waitFor(() => expect(writes).toHaveLength(4));
    expect(writes[3]).toBe("auto on page");
  });

  it("runs the work waiting for a layer in the frame after it closes", async () => {
    const settle = vi.fn();
    render(<Harness />);
    fireEvent.click(screen.getByText("Open map"));
    whenLayerCloses(settle);

    fireEvent.click(screen.getByText("Close map"));
    // Not on the close itself: in a frame, after anything the closing layer
    // asked a frame for (vaul's own scroll restore on iOS).
    expect(settle).not.toHaveBeenCalled();
    await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));

    // Once: the next layer to close runs nothing.
    fireEvent.click(screen.getByText("Open map"));
    fireEvent.click(screen.getByText("Close map"));
    await waitFor(() => expect(history.state?.locationPicker).toBeUndefined());
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("runs it when the back gesture closes the layer", async () => {
    const settle = vi.fn();
    render(<Harness />);
    fireEvent.click(screen.getByText("Open map"));
    whenLayerCloses(settle);

    act(() => history.back());

    await screen.findByText("Open map");
    await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
  });

  it("runs nothing for a layer that was never opened, and nothing withdrawn", async () => {
    const settle = vi.fn();
    const withdraw = whenLayerCloses(settle);
    const { rerender } = render(<Harness />);
    rerender(<Harness />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(settle).not.toHaveBeenCalled();

    withdraw();
    fireEvent.click(screen.getByText("Open map"));
    fireEvent.click(screen.getByText("Close map"));
    await waitFor(() => expect(history.state?.locationPicker).toBeUndefined());
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(settle).not.toHaveBeenCalled();
  });
});
