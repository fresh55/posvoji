// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToResults } from "./use-animal-filters";
import { usePickerHistory } from "./use-picker-history";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.removeAttribute("data-scroll-locked");
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
