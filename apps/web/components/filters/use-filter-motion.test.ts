// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusEvent, PointerEvent } from "react";
import {
  RESET_STAGGER,
  resetDelayStyle,
  useFilterCardGestures,
  useFilterCardHover,
  useOneShotCelebration,
  useResetStagger,
  waitThen,
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

describe("useResetStagger", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hands out no delay until a reset begins", () => {
    const { result } = renderHook(() => useResetStagger(2, 3));

    expect(result.current.isResetting).toBe(false);
    expect(result.current.resetDelay(2)).toBe(0);
  });

  it("delays each card by its position once the reset begins", () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useResetStagger(selected, 3),
      { initialProps: { selected: 2 } },
    );

    act(() => result.current.beginReset());
    rerender({ selected: 0 });

    expect(result.current.isResetting).toBe(true);
    expect(result.current.resetDelay(0)).toBe(0);
    expect(result.current.resetDelay(2)).toBeCloseTo(2 * RESET_STAGGER);
  });

  it("does not start the clock while the section still holds a selection", () => {
    const { result } = renderHook(() => useResetStagger(2, 3));

    // The filters land through the parent, which has not answered yet.
    act(() => result.current.beginReset());
    act(() => vi.advanceTimersByTime(2000));

    expect(result.current.isResetting).toBe(true);
  });

  it("holds the reset open until the last card of a long section has had its turn", () => {
    // Barva draws ten swatches, so the last turn comes at 9 * 45ms. Under the
    // fixed 280ms hold this section was out of the reset before then.
    const { result, rerender } = renderHook(
      ({ selected }) => useResetStagger(selected, 10),
      { initialProps: { selected: 10 } },
    );

    act(() => result.current.beginReset());
    rerender({ selected: 0 });

    act(() => vi.advanceTimersByTime(600));
    expect(result.current.isResetting).toBe(true);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.isResetting).toBe(false);
  });

  it("lets a short section out of the reset sooner", () => {
    const { result, rerender } = renderHook(
      ({ selected }) => useResetStagger(selected, 3),
      { initialProps: { selected: 3 } },
    );

    act(() => result.current.beginReset());
    rerender({ selected: 0 });

    act(() => vi.advanceTimersByTime(600));
    expect(result.current.isResetting).toBe(false);
  });
});

describe("resetDelayStyle", () => {
  it("delays the leaving half of the gesture only", () => {
    expect(resetDelayStyle(false, 0.09)).toEqual({ transitionDelay: "0.09s" });
  });

  it("says nothing while the card is being switched on", () => {
    // One CSS rule covers both directions, so a card picked during another
    // card's wink must not sit uncoloured waiting for a turn of its own.
    expect(resetDelayStyle(true, 0.09)).toBeUndefined();
  });

  it("says nothing outside a reset", () => {
    expect(resetDelayStyle(false, 0)).toBeUndefined();
  });
});

describe("useFilterCardGestures", () => {
  it("tracks the card the pointer is held down on", () => {
    const { result } = renderHook(() => useFilterCardGestures());

    act(() => result.current.handlers("small").onPointerDown?.());
    expect(result.current.pressedValue).toBe("small");

    act(() => result.current.handlers("small").onPointerUp?.());
    expect(result.current.pressedValue).toBeNull();
  });

  it("clears the hover and the press on one leave", () => {
    const { result } = renderHook(() => useFilterCardGestures());

    act(() => {
      result.current.handlers("small").onPointerEnter(pointerEvent("mouse"));
      result.current.handlers("small").onPointerDown?.();
    });
    expect(result.current.hoveredValue).toBe("small");
    expect(result.current.pressedValue).toBe("small");

    // The reason the two hooks are handed out composed: spreading them
    // separately onto one button drops whichever leave handler comes first,
    // and a card left lit after the mouse had gone failed nothing.
    act(() => result.current.handlers("small").onPointerLeave());

    expect(result.current.hoveredValue).toBeNull();
    expect(result.current.pressedValue).toBeNull();
  });

  it("release only clears the card that still owns the press", () => {
    const { result } = renderHook(() => useFilterCardGestures());

    act(() => result.current.handlers("small").onPointerDown?.());

    act(() => result.current.release("large"));
    expect(result.current.pressedValue).toBe("small");

    act(() => result.current.release("small"));
    expect(result.current.pressedValue).toBeNull();
  });

  it("registers no press handlers for a section that does not answer a press", () => {
    const { result } = renderHook(() =>
      useFilterCardGestures({ press: false }),
    );
    const handlers = result.current.handlers("small");

    expect(handlers.onPointerDown).toBeUndefined();
    expect(handlers.onPointerUp).toBeUndefined();
    expect(handlers.onPointerCancel).toBeUndefined();

    act(() => handlers.onPointerEnter(pointerEvent("mouse")));
    expect(result.current.hoveredValue).toBe("small");
    expect(result.current.pressedValue).toBeNull();
  });
});

describe("waitThen", () => {
  it("holds the first keyframe through the wait, then plays the track", () => {
    const { keyframes, transition } = waitThen(0.3, [0, 0.4, 0], {
      duration: 0.2,
      times: [0, 0.5, 1],
      ease: ["linear", "easeOut"],
    });

    expect(keyframes).toEqual([0, 0, 0.4, 0]);
    expect(transition.duration).toBeCloseTo(0.5);
    expect(transition.times?.map((time) => +time.toFixed(3))).toEqual([
      0, 0.6, 0.8, 1,
    ]);
    expect(transition.ease).toEqual(["linear", "linear", "easeOut"]);
  });

  it("comes to the first keyframe from wherever the value is when told to settle", () => {
    const { keyframes, transition } = waitThen(0.3, [0, -2, 0], {
      duration: 0.2,
      ease: "easeInOut",
      settle: 0.1,
    });

    expect(keyframes).toEqual([null, 0, 0, -2, 0]);
    expect(transition.times?.map((time) => +time.toFixed(3))).toEqual([
      0, 0.2, 0.6, 0.8, 1,
    ]);
    expect(transition.ease).toEqual([
      "easeIn",
      "linear",
      "easeInOut",
      "easeInOut",
    ]);
  });

  // A value already at the first keyframe plays the same track, so nothing
  // changes for a gesture that starts from rest.
  it("starts the track from wherever the value is when there is no wait to settle in", () => {
    const { keyframes, transition } = waitThen(0, [0, 7, 5, 0], {
      duration: 0.8,
      times: [0, 0.3, 0.55, 1],
      ease: "easeInOut",
      settle: 0,
    });

    expect(keyframes).toEqual([null, 7, 5, 0]);
    expect(transition).toEqual({
      duration: 0.8,
      times: [0, 0.3, 0.55, 1],
      ease: ["easeInOut", "easeInOut", "easeInOut"],
    });
  });

  it("settles on the ease it is given", () => {
    const { transition } = waitThen(0.09, [0, 6, 0], {
      duration: 0.7,
      settle: 0.09,
      settleEase: "linear",
    });

    expect(transition.ease).toEqual([
      "linear",
      "linear",
      "easeOut",
      "easeOut",
    ]);
  });

  // The toes and the dust mount with the gesture, so they have nowhere else
  // to start from.
  it("holds the first keyframe without a settle, even with no wait", () => {
    const { keyframes } = waitThen(0, [0, 0.4, 0], { duration: 0.2 });

    expect(keyframes).toEqual([0, 0, 0.4, 0]);
  });
});
