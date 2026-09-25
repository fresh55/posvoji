// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GRID_SETTLE_MS,
  RESULTS_ANCHORING_REST_LIMIT_MS,
  RESULTS_ANCHORING_REST_MS,
  scrollToResults,
} from "./use-animal-filters";
import { usePickerHistory } from "./use-picker-history";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.removeAttribute("data-scroll-locked");
  document.documentElement.style.removeProperty("overflow-anchor");
  vi.useRealTimers();
  vi.restoreAllMocks();
  history.replaceState(null, "", "/");
});

/** A results block whose top is `top` px into the page, with the window
 *  scrolled to `y`, and a scrollTo that records instead of moving. */
function page({ top, y }: { top: number; y: number }) {
  document.body.innerHTML = '<section aria-labelledby="rezultati"></section>';
  vi.spyOn(window, "scrollY", "get").mockReturnValue(y);
  vi.spyOn(
    document.querySelector("section")!,
    "getBoundingClientRect",
  ).mockReturnValue({ top: top - y } as DOMRect);
  return vi.spyOn(window, "scrollTo").mockImplementation(() => {});
}

/** A layer that pushes its own history entry, the way the sheet and the map
 *  do (usePickerHistory). */
function Layer() {
  const [open, setOpen] = useState(false);
  usePickerHistory(open, () => setOpen(false));
  return (
    <button onClick={() => setOpen(!open)}>{open ? "Close layer" : "Open layer"}</button>
  );
}

it("waits until all modal scroll locks are gone before returning to changed results", async () => {
  const scroll = page({ top: 1000, y: 30000 });
  document.body.setAttribute("data-scroll-locked", "2");
  scrollToResults();
  scrollToResults();
  expect(scroll).not.toHaveBeenCalled();
  document.body.setAttribute("data-scroll-locked", "1");
  await Promise.resolve();
  expect(scroll).not.toHaveBeenCalled();
  document.body.removeAttribute("data-scroll-locked");
  await waitFor(() =>
    expect(scroll).toHaveBeenCalledWith({ top: 1000, behavior: "auto" }),
  );
  expect(scroll).toHaveBeenCalledTimes(1);
});

it("requests an immediate return to nearby results", () => {
  const scroll = page({ top: 231, y: 600 });

  scrollToResults();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 231, behavior: "auto" });
});

it("does not move a visitor already above the result heading", () => {
  const scroll = page({ top: 231, y: 0 });
  scrollToResults();
  expect(scroll).not.toHaveBeenCalled();
});

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe("the return from inside a layer", () => {
  it("lands as soon as the layer starts to close, while its lock still holds the page", async () => {
    // Waiting for the lock let the sheet slide away over the old list and
    // moved the page 2,750px once it had gone.
    const scroll = page({ top: 249, y: 3000 });
    render(<Layer />);
    fireEvent.click(screen.getByText("Open layer"));
    document.body.setAttribute("data-scroll-locked", "1");
    scrollToResults();
    expect(scroll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Close layer"));

    await waitFor(() =>
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 249, behavior: "auto" }),
    );
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);

    // The lock going is a second look, and the page is on the results by
    // then, so it moves nothing.
    vi.spyOn(window, "scrollY", "get").mockReturnValue(249);
    vi.spyOn(
      document.querySelector("section")!,
      "getBoundingClientRect",
    ).mockReturnValue({ top: 0 } as DOMRect);
    document.body.removeAttribute("data-scroll-locked");
    await frame();
    await frame();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("does not land again on a later layer that closes with nothing picked", async () => {
    // Returned by the lock going instead: the landing that was waiting for a
    // layer is spent, and the next sheet a visitor opens and closes without a
    // pick must leave the page where it is.
    const scroll = page({ top: 249, y: 3000 });
    document.body.setAttribute("data-scroll-locked", "1");
    scrollToResults();
    document.body.removeAttribute("data-scroll-locked");
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));

    render(<Layer />);
    fireEvent.click(screen.getByText("Open layer"));
    fireEvent.click(screen.getByText("Close layer"));
    await waitFor(() => expect(history.state?.locationPicker).toBeUndefined());
    await frame();

    expect(scroll).toHaveBeenCalledTimes(1);
  });
});

describe("the page's scroll anchoring", () => {
  const root = document.documentElement;

  /** The results with a grid of cards in them, the part that draws a filter
   *  change a render late. */
  function withGrid() {
    const grid = document.createElement("div");
    grid.setAttribute("data-card-grid", "");
    grid.append(document.createElement("article"));
    document.querySelector("section")!.append(grid);
    return grid;
  }

  it("is off while the return lands and the chips band settles, then back", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    page({ top: 231, y: 1500 });

    scrollToResults();
    // Anchoring follows whatever it picked through the chips band and the
    // deferred grid render, which put a first pick 34px short of the results
    // and a last unpick 460px into the list.
    expect(root.style.overflowAnchor).toBe("none");

    vi.advanceTimersByTime(RESULTS_ANCHORING_REST_MS - 1);
    expect(root.style.overflowAnchor).toBe("none");
    vi.advanceTimersByTime(1);
    expect(root.style.overflowAnchor).toBe("");
  });

  it("stays off until the grid has drawn the change, however late that is", async () => {
    // At a quarter of the CPU the grid's deferred render landed 300ms to 2.3s
    // after the press; a rest of a set 400ms let a first pick follow a card
    // to the top of the page.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    page({ top: 231, y: 1500 });
    const grid = withGrid();

    scrollToResults();
    vi.advanceTimersByTime(1500);
    expect(root.style.overflowAnchor).toBe("none");

    // The deferred render lands.
    grid.replaceChildren(document.createElement("article"));
    await Promise.resolve();
    vi.advanceTimersByTime(GRID_SETTLE_MS - 1);
    expect(root.style.overflowAnchor).toBe("none");
    vi.advanceTimersByTime(1);
    expect(root.style.overflowAnchor).toBe("");
  });

  it("still waits out the band when the grid lands first", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    page({ top: 231, y: 1500 });
    const grid = withGrid();

    scrollToResults();
    grid.replaceChildren(document.createElement("article"));
    await Promise.resolve();
    vi.advanceTimersByTime(GRID_SETTLE_MS);
    expect(root.style.overflowAnchor).toBe("none");

    vi.advanceTimersByTime(RESULTS_ANCHORING_REST_MS - GRID_SETTLE_MS);
    expect(root.style.overflowAnchor).toBe("");
  });

  it("gives up waiting for a grid that does not change", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    page({ top: 231, y: 1500 });
    withGrid();

    scrollToResults();
    vi.advanceTimersByTime(RESULTS_ANCHORING_REST_LIMIT_MS - 1);
    expect(root.style.overflowAnchor).toBe("none");
    vi.advanceTimersByTime(1);
    expect(root.style.overflowAnchor).toBe("");
  });

  it("is left alone when there is nothing to return from", () => {
    page({ top: 231, y: 100 });

    scrollToResults();

    expect(root.style.overflowAnchor).toBe("");
  });
});
