// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusEvent, PointerEvent } from "react";
import {
  useFilterCardHover,
  useOneShotCelebration,
} from "./use-filter-motion";

const HOLD_MS = 500;

function pointerEvent(pointerType: string): PointerEvent<Element> {
  return { pointerType } as PointerEvent<Element>;
}

function focusEvent(target: Element): FocusEvent<Element> {
  return { currentTarget: target } as FocusEvent<Element>;
}

describe("useOneShotCelebration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("exposes {value, id} once celebrated", () => {
    const { result } = renderHook(() => useOneShotCelebration<string>(HOLD_MS));

    expect(result.current.celebration).toBeNull();

    act(() => result.current.celebrate("small"));

    expect(result.current.celebration).toEqual({ value: "small", id: 1 });
  });

  it("replaces the value and increments the id on a second celebrate", () => {
    const { result } = renderHook(() => useOneShotCelebration<string>(HOLD_MS));

    act(() => result.current.celebrate("small"));
    act(() => result.current.celebrate("large"));

    expect(result.current.celebration).toEqual({ value: "large", id: 2 });
  });

  it("clears the celebration after holdMs", () => {
    const { result } = renderHook(() => useOneShotCelebration<string>(HOLD_MS));

    act(() => result.current.celebrate("small"));
    expect(result.current.celebration).not.toBeNull();

    act(() => vi.advanceTimersByTime(HOLD_MS));

    expect(result.current.celebration).toBeNull();
  });

  it("clear() clears immediately, without waiting for holdMs", () => {
    const { result } = renderHook(() => useOneShotCelebration<string>(HOLD_MS));

    act(() => result.current.celebrate("small"));
    act(() => result.current.clear());

    expect(result.current.celebration).toBeNull();
  });

  it("clears the pending timeout on unmount, without a state update after unmount", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useOneShotCelebration<string>(HOLD_MS),
    );

    act(() => result.current.celebrate("small"));
    unmount();

    // If the timer fired after unmount and tried to setState, React would log
    // an "act" / "unmounted component" warning here.
    act(() => vi.advanceTimersByTime(HOLD_MS));

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("useFilterCardHover", () => {
  it("onPointerEnter with pointerType mouse sets hoveredValue", () => {
    const { result } = renderHook(() => useFilterCardHover());

    act(() =>
      result.current.handlers("small").onPointerEnter(pointerEvent("mouse")),
    );

    expect(result.current.hoveredValue).toBe("small");
  });

  it("onPointerEnter with pointerType touch does not set hoveredValue", () => {
    const { result } = renderHook(() => useFilterCardHover());

    act(() =>
      result.current.handlers("small").onPointerEnter(pointerEvent("touch")),
    );

    expect(result.current.hoveredValue).toBeNull();
  });

  it("onPointerLeave only clears its own value", () => {
    const { result } = renderHook(() => useFilterCardHover());

    act(() =>
      result.current.handlers("small").onPointerEnter(pointerEvent("mouse")),
    );
    expect(result.current.hoveredValue).toBe("small");

    // Leaving a different card must not clear the currently hovered one.
    act(() => result.current.handlers("large").onPointerLeave());
    expect(result.current.hoveredValue).toBe("small");

    act(() => result.current.handlers("small").onPointerLeave());
    expect(result.current.hoveredValue).toBeNull();
  });

  it("onFocus guards on :focus-visible without crashing", () => {
    const { result } = renderHook(() => useFilterCardHover());
    const button = document.createElement("button");

    // jsdom (26.x, as pinned in apps/web/package.json) implements
    // `matches(":focus-visible")` and always returns false rather than
    // throwing, so the guard always takes the early-return path here. That
    // means the positive case (focus-visible actually setting hoveredValue)
    // cannot be exercised in this environment; this only asserts the guard
    // runs without crashing and leaves state untouched.
    expect(() =>
      act(() => result.current.handlers("small").onFocus(focusEvent(button))),
    ).not.toThrow();
    expect(result.current.hoveredValue).toBeNull();
  });

  it("onBlur only clears its own value", () => {
    const { result } = renderHook(() => useFilterCardHover());

    act(() =>
      result.current.handlers("small").onPointerEnter(pointerEvent("mouse")),
    );

    act(() => result.current.handlers("large").onBlur());
    expect(result.current.hoveredValue).toBe("small");

    act(() => result.current.handlers("small").onBlur());
    expect(result.current.hoveredValue).toBeNull();
  });
});
