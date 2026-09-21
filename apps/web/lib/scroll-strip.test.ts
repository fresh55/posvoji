// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCROLL_BOX_MARK, scrollChildIntoViewY } from "./scroll-strip";

describe("scrollChildIntoViewY", () => {
  // jsdom lays nothing out and answers 0 for the window's own height, so the
  // window, the box and the child all state their rectangles here.
  beforeEach(() => {
    Object.defineProperty(document.documentElement, "clientHeight", {
      value: 600,
      configurable: true,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  /** A marked box with 1000px of content in 500px of room, and a child in it. */
  function boxWith(child: DOMRect, box: Partial<DOMRect> = {}) {
    const port = document.createElement("div");
    port.setAttribute(SCROLL_BOX_MARK, "");
    Object.defineProperty(port, "scrollHeight", { value: 1000 });
    Object.defineProperty(port, "clientHeight", { value: 500 });
    port.scrollTop = 0;
    port.getBoundingClientRect = () =>
      ({ top: 0, bottom: 500, height: 500, ...box }) as DOMRect;
    const scrollTo = vi.fn();
    port.scrollTo = scrollTo;

    const node = document.createElement("section");
    node.getBoundingClientRect = () => child;
    port.append(node);
    document.body.append(port);
    return { port, node, scrollTo };
  }

  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height }) as DOMRect;

  // The whole point of the helper: scrollIntoView reaches the page as well,
  // and inside a sticky panel that is the page scrolling instead of the panel.
  it("moves the box it is in, and nothing outside it", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { port, node } = boxWith(rect(700, 100));

    scrollChildIntoViewY(node);

    // 300 past the box's bottom edge, so the box takes exactly that.
    expect(port.scrollTop).toBe(300);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("aims at the part of the box the window shows", () => {
    // A sticky panel before the page has scrolled: its box runs past the
    // bottom of the window, and a child aligned to that box would settle out
    // of sight.
    const { node, scrollTo } = boxWith(rect(700, 100), {
      top: 100,
      bottom: 976,
      height: 876,
    });

    scrollChildIntoViewY(node, { smooth: true });

    expect(scrollTo).toHaveBeenCalledWith({ top: 200, behavior: "smooth" });
  });

  it("aligns the top of a child taller than the room it has", () => {
    const { port, node } = boxWith(rect(700, 900));

    scrollChildIntoViewY(node);

    expect(port.scrollTop).toBe(500);
  });

  it("leaves a child that is already in the box alone", () => {
    const { port, node, scrollTo } = boxWith(rect(100, 100));

    scrollChildIntoViewY(node);

    expect(scrollTo).not.toHaveBeenCalled();
    expect(port.scrollTop).toBe(0);
  });

  it("does nothing outside a marked box, or before one is laid out", () => {
    const loose = document.createElement("section");
    loose.getBoundingClientRect = () => rect(700, 100);
    document.body.append(loose);
    expect(() => scrollChildIntoViewY(loose)).not.toThrow();

    // Both filter rows are mounted at once with one copy display:none, and
    // that copy measures zero on every axis.
    const flat = boxWith(rect(700, 100), { height: 0, bottom: 0 });
    scrollChildIntoViewY(flat.node);
    expect(flat.port.scrollTop).toBe(0);
  });
});
