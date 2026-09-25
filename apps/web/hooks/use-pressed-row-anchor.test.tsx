// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRESSED_ROW_HOLD_MS,
  usePressedRowAnchor,
} from "./use-pressed-row-anchor";

// jsdom lays nothing out, so every offsetTop reads 0 and nothing ever moves.
// Here an element's offsetTop is its data-top, with no offsetParent, and the
// box keeps its own scroll, height and range (renderPanel).
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
    <div data-testid="box" {...anchor}>
      <button type="button" aria-expanded={false}>
        Velikost
      </button>
      {portal ? createPortal(row, document.body) : row}
    </div>
  );
}

const VIEW = 400;

/**
 * The panel in a 400px box. `content` is how tall its rows are before and
 * after the press; the defaults are long enough that the scroll never meets
 * an end. The box's range is its content plus whatever bottom padding it has
 * been given, and the browser's side of a shorter range is written out: a
 * scroll past the new end reads as the end.
 */
function renderPanel({
  grows = 38,
  portal = false,
  content = [10_000, 10_000],
  start = 100,
}: {
  grows?: number;
  portal?: boolean;
  content?: [number, number];
  start?: number;
} = {}) {
  render(<Panel grows={grows} portal={portal} />);
  const box = screen.getByTestId("box");
  const height = () =>
    content[row().getAttribute("aria-pressed") === "true" ? 1 : 0] +
    (parseFloat(box.style.paddingBottom) || 0);
  const end = () => Math.max(0, height() - VIEW);
  let scrollTop = start;
  Object.defineProperty(box, "clientHeight", {
    configurable: true,
    get: () => VIEW,
  });
  Object.defineProperty(box, "scrollHeight", {
    configurable: true,
    get: () => Math.max(VIEW, height()),
  });
  Object.defineProperty(box, "scrollTop", {
    configurable: true,
    get: () => Math.min(scrollTop, end()),
    set: (value: number) => {
      scrollTop = Math.min(Math.max(0, value), end());
    },
  });
  return box;
}

const row = () => screen.getByRole("button", { name: "Velika" });

/** A press by a given pointer. jsdom's click carries no pointerType. */
function press(pointerType: "mouse" | "touch") {
  const click = createEvent.click(row());
  Object.defineProperty(click, "pointerType", { value: pointerType });
  fireEvent(row(), click);
}

describe("usePressedRowAnchor", () => {
  it("turns the browser's own scroll anchoring off on the box", () => {
    const { result } = renderHook(() => usePressedRowAnchor());

    expect(result.current.style).toEqual({ overflowAnchor: "none" });
  });

  it("scrolls the box by as far as the press moved the row", () => {
    const box = renderPanel();

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(138);
  });

  // A hold that re-read the same move every frame kept scrolling by it.
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

  it("leaves a row the box does not contain alone", () => {
    const box = renderPanel({ portal: true });

    fireEvent.click(row());
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(100);
  });
});

describe("usePressedRowAnchor at the end of the panel", () => {
  it("holds the row through the browser pulling the scroll back to a shorter end", () => {
    // Lahko ponudim's Dom za dva at the sidebar's end: Doma imam above it lost
    // 53px, the section itself grew 38 under it, and the end came 16px
    // closer. The pull to the new end read as somebody scrolling and ended
    // the hold, so the row went 38px up and the next click pressed Dnevno
    // nego.
    const box = renderPanel({ grows: -50, content: [1000, 980], start: 600 });

    press("touch");
    // The pull has happened by the frame the hold runs in.
    expect(box.scrollTop).toBe(580);
    vi.advanceTimersToNextFrame();

    expect(box.scrollTop).toBe(550);
    expect(box.style.paddingBottom).toBe("");
  });

  it("grows room under the rows for a row no scroll inside the range can hold", () => {
    // Doma imam's Otroke: 108px of dead rows went from Lahko ponudim below it,
    // the end came 92px closer, and the row went 92px down under a pointer
    // that stayed where it was.
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });

    press("mouse");
    vi.advanceTimersToNextFrame();

    expect(box.style.paddingBottom).toBe("60px");
    expect(box.scrollTop).toBe(600);
  });

  it("gives the room back when the pointer leaves the panel", () => {
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });
    press("mouse");
    vi.advanceTimersToNextFrame();

    fireEvent.pointerLeave(box);
    for (let frame = 0; frame < 5; frame++) vi.advanceTimersToNextFrame();

    expect(box.style.paddingBottom).toBe("");
    expect(box.scrollTop).toBe(540);
  });

  it("gives the room back when the panel is wheeled", () => {
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });
    press("mouse");
    vi.advanceTimersToNextFrame();

    fireEvent.wheel(box);
    for (let frame = 0; frame < 5; frame++) vi.advanceTimersToNextFrame();

    expect(box.style.paddingBottom).toBe("");
  });

  it("gives the room back once a later press no longer needs it", () => {
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });
    press("mouse");
    vi.advanceTimersToNextFrame();
    expect(box.style.paddingBottom).toBe("60px");

    // The same row again: the dead rows come back, the range with them.
    press("mouse");
    vi.advanceTimersToNextFrame();

    expect(box.style.paddingBottom).toBe("");
    expect(box.scrollTop).toBe(600);
  });

  it("makes no room for a finger, which does not stay on the panel", () => {
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });

    press("touch");
    vi.advanceTimersToNextFrame();

    expect(box.style.paddingBottom).toBe("");
    expect(box.scrollTop).toBe(540);
  });

  it("gives the room back when the panel goes", () => {
    const box = renderPanel({ grows: 0, content: [1000, 940], start: 600 });
    press("mouse");
    vi.advanceTimersToNextFrame();

    cleanup();

    expect(box.style.paddingBottom).toBe("");
  });
});
