// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESSED_ROW_HOLD_MS,
  usePressedRowAnchor,
} from "./use-pressed-row-anchor";

// jsdom lays nothing out, so every offsetTop reads 0 and nothing ever moves.
// Here an element's offsetTop is its data-top, with no offsetParent, and the
// box's scrollTop is a number it keeps.
const saved = {
  offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop"),
  offsetParent: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetParent",
  ),
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.top ?? 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get: () => null,
  });
  vi.useFakeTimers({
    toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

/**
 * A panel with a note above its row. Pressing the row shows the note, which
 * lays the row out `grows` px further down, the way a "Brez podatka" line
 * appearing in Starost moved Velikost.
 */
function Panel({ grows = 38, portal = false }: { grows?: number; portal?: boolean }) {
  const anchor = usePressedRowAnchor();
  const [picked, setPicked] = useState(false);
  const row = (
    <button
      type="button"
      aria-pressed={picked}
      data-top={picked ? 200 + grows : 200}
      onClick={() => setPicked((value) => !value)}
    >
      Velika
    </button>
  );
  return (
    <div data-testid="box" onClickCapture={anchor}>
      <button type="button" aria-expanded={false}>
        Velikost
      </button>
      {portal ? createPortal(row, document.body) : row}
    </div>
  );
}

function renderPanel(props: { grows?: number; portal?: boolean } = {}) {
  render(<Panel {...props} />);
  const box = screen.getByTestId("box");
  let scrollTop = 100;
  Object.defineProperty(box, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, value);
    },
  });
  return box;
}

const row = () => screen.getByRole("button", { name: "Velika" });

describe("usePressedRowAnchor", () => {
  it("scrolls the box by as far as the press moved the row", () => {
    const box = renderPanel();

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(138);
  });

  // The scroll does not move the row in the box's content, so a hold that
  // kept measuring from the press scrolled the same 38px again every frame.
  it("scrolls once for one move, however many frames the hold lasts", () => {
    const box = renderPanel();

    fireEvent.click(row());
    for (let frame = 0; frame < 10; frame++) vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(138);
  });

  it("follows a row that moves back up", () => {
    const box = renderPanel({ grows: -20 });

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(80);
  });

  it("lets go when something else scrolls the box", () => {
    const box = renderPanel();

    fireEvent.click(row());
    // A wheel, a focus move or a section scrolling itself into view, before
    // the frame that would have held the row.
    box.scrollTop = 300;
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(300);
  });

  it("lets go once the hold is over", () => {
    const box = renderPanel();

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();
    expect(box.scrollTop).toBe(138);

    vi.advanceTimersByTime(PRESSED_ROW_HOLD_MS + 50);
    row().dataset.top = "400";
    vi.advanceTimersByTime(100);

    expect(box.scrollTop).toBe(138);
  });

  it("holds only a row that states its answer", () => {
    const box = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Velikost" }));
    row().dataset.top = "260";
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(100);
  });

  // React hands the box a click from anything portalled out of it, the Kje
  // dialog's rows among them, and the box's scroll does not carry those.
  it("leaves a row the box does not contain alone", () => {
    const box = renderPanel({ portal: true });

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(100);
  });
});
