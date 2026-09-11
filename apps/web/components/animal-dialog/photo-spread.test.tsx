// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { motionValue, type MotionValue } from "motion/react";
import type { Animal } from "@posvoji/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoSpread } from "@/components/animal-dialog/photo-spread";
import { useWheelStep } from "@/components/animal-dialog/use-wheel-step";
import { I18nProvider } from "@/components/i18n-provider";
import { animalsForClient } from "@/lib/dataset";
import { WHEEL_SETTLE_MS } from "@/lib/swipe";
import { pointer, slot } from "@/test/pointer";

// What the fan's own tests are for: the gestures that hand the stack from one
// input to another. animal-dialog.test.tsx holds the fan as the dialog draws
// it, and everything here is the fan on its own, rendered the way that suite
// renders it for the two tests that count renders.

const FAN_LAYOUT = "(min-width: 640px)";

let desktopFan = true;
// Every listener the fan's media query is holding. The fan reads the
// breakpoint through useSyncExternalStore, which only looks again when it is
// told, so a test that moves the breakpoint has to tell it.
const fanListeners = new Set<() => void>();

function fanLayout(layout: "phone" | "desktop") {
  desktopFan = layout === "desktop";
  for (const listener of fanListeners) listener();
}

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    matches: media === FAN_LAYOUT ? desktopFan : false,
    media,
    addEventListener: (_: string, listener: () => void) => {
      if (media === FAN_LAYOUT) fanListeners.add(listener);
    },
    removeEventListener: (_: string, listener: () => void) => {
      fanListeners.delete(listener);
    },
  })),
});

afterEach(() => {
  cleanup();
  fanListeners.clear();
  desktopFan = true;
});

function photos(id: string, count: number): Animal["images"] {
  return Array.from({ length: count }, (_, index) => ({
    sourceUrl: `https://example.test/${id}-${index + 1}.jpg`,
    cachedUrl: `/media/animals/${id}-${index + 1}.webp`,
    width: 640,
    height: 480,
    widths: [320, 480, 640],
    blurDataURL: "data:image/webp;base64,UklGRg==",
    rights: "cache-permitted" as const,
  }));
}

// One animal, however many photographs the test needs. No energy, so the fan
// stands on the balanced tempo every number below was measured against.
function gallery(count: number): Animal {
  return {
    id: `gallery-${count}`,
    source: {
      providerId: "test-shelter",
      sourceAnimalId: `gallery-${count}`,
      sourceUrl: "https://example.test/animals/gallery",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      firstSeenAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
    shelter: { id: "test-shelter", name: "Zavetišče Test", city: "Ljubljana" },
    name: "Rex",
    species: "cat",
    status: "available",
    images: photos(`g${count}`, count),
    attribution: "Foto: Zavetišče Test",
  };
}

// The width every ratio in lib/swipe.ts is taken against. jsdom lays nothing
// out, so a stage measures zero and the fan falls back to a width of one
// pixel, where a drag of nine pixels is already four whole steps. Stated here
// instead, the distances below are the ones a real stage would see.
const STAGE_WIDTH_PX = 400;

function renderFan(
  animal: Animal,
  options: {
    layout?: "phone" | "desktop";
    initialIndex?: number;
    washProgress?: MotionValue<number>;
  } = {},
) {
  fanLayout(options.layout ?? "desktop");
  const [client] = animalsForClient([animal]);
  const view = render(
    <I18nProvider locale="sl">
      <PhotoSpread
        animal={client}
        initialIndex={options.initialIndex}
        washProgress={options.washProgress}
      />
    </I18nProvider>,
  );
  // Read fresh every time: the breakpoint remounts the fan, and the stage the
  // test was holding goes with the layout it belonged to.
  function stage() {
    const found = view.container.querySelector(
      '[data-slot="photo-spread"], [data-slot="photo-fan"]',
    );
    if (!(found instanceof HTMLElement)) throw new Error("no fan on stage");
    Object.defineProperty(found, "clientWidth", {
      configurable: true,
      value: STAGE_WIDTH_PX,
    });
    return found;
  }
  return { view, stage };
}

/** The prints on stage, in the order the document holds them, by the photo
 *  each one is showing. */
function printOrder(stage: HTMLElement) {
  return within(stage)
    .getAllByRole("button", { name: /fotografijo \d/ })
    .map((button) => {
      const found = /fotografijo (\d+)/.exec(button.getAttribute("aria-label") ?? "");
      return Number(found?.[1]);
    });
}

function print(stage: HTMLElement, n: number) {
  return within(stage).getByRole("button", {
    name: new RegExp(`fotografijo ${n}\\b`),
  });
}

function frontPrint(stage: HTMLElement) {
  const found = stage.querySelector('button[aria-pressed="true"]');
  if (!(found instanceof HTMLElement)) throw new Error("no front print");
  return found;
}

/** Waits for the walk to land and the window to be re-seated on `n`. */
async function expectFront(stage: () => HTMLElement, n: number) {
  await waitFor(() =>
    expect(print(stage(), n).getAttribute("aria-pressed")).toBe("true"),
  );
}

/** A gesture across the stage, in one move so the axis and the walk are
 *  declared on the same event. Negative `dx` pulls the next photo in. */
async function dragBy(
  stage: HTMLElement,
  dx: number,
  pointerType: "mouse" | "touch" = "mouse",
) {
  await act(async () => {
    pointer(stage, "pointerdown", { x: 300, y: 200, pointerType, time: 1000 });
    pointer(stage, "pointermove", {
      x: 300 + dx,
      y: 204,
      pointerType,
      time: 1200,
    });
    pointer(stage, "pointerup", {
      x: 300 + dx,
      y: 204,
      pointerType,
      time: 1200,
    });
  });
}

describe("fan gestures", () => {
  // The settle window is a quarter of a second of silence after a trackpad
  // swipe, and the surface can change hands inside it: the tail used to spring
  // the fan back while a finger was dragging it, or add a photo to a walk that
  // had already taken over.
  it("drops the wheel's settle window when a drag takes the fan over", async () => {
    const { stage } = renderFan(gallery(7));
    const armed = vi.spyOn(window, "setTimeout");
    const cleared = vi.spyOn(window, "clearTimeout");

    // Short of the step the fan commits on, so the swipe has a settle to run
    // and something to put back when it does.
    await act(async () => {
      fireEvent.wheel(stage(), { deltaX: 40, deltaY: 0 });
    });
    const settle = armed.mock.calls.findIndex(
      ([, delay]) => delay === WHEEL_SETTLE_MS,
    );
    expect(settle).toBeGreaterThanOrEqual(0);
    const timer = armed.mock.results[settle]!.value;

    await act(async () => {
      pointer(stage(), "pointerdown", { x: 300, y: 200, pointerType: "mouse" });
    });

    expect(cleared).toHaveBeenCalledWith(timer);
    armed.mockRestore();
    cleared.mockRestore();
  });

  it("drops it when a walk takes the fan over", async () => {
    const { stage } = renderFan(gallery(7));
    const armed = vi.spyOn(window, "setTimeout");
    const cleared = vi.spyOn(window, "clearTimeout");

    await act(async () => {
      fireEvent.wheel(stage(), { deltaX: 40, deltaY: 0 });
    });
    const settle = armed.mock.calls.findIndex(
      ([, delay]) => delay === WHEEL_SETTLE_MS,
    );
    const timer = armed.mock.results[settle]!.value;

    // A side print picked with the mouse: the walk owns the fan from here, and
    // a window closing under it would walk a second photo.
    await act(async () => {
      fireEvent.click(print(stage(), 2));
    });

    expect(cleared).toHaveBeenCalledWith(timer);
    await expectFront(stage, 2);
    armed.mockRestore();
    cleared.mockRestore();
  });

  // A spring back sets no heading, so the guard that keeps the wheel off a
  // walk in flight cannot see it. Both were writing the same number.
  it("takes the fan off a spring back when a swipe arrives in its tail", async () => {
    const washProgress = motionValue(0);
    const { stage } = renderFan(gallery(7), { washProgress });

    // Past the slop so it is a drag, and under the fifth of the width that
    // commits one, so the release hands the fan to a spring back to where it
    // stood. A sixth of a step: 40px of a 240px span.
    await dragBy(stage(), -40);
    // Read to one place, not two: the release hands the fan straight to the
    // spring, so by the time this runs the first frames of the way back are
    // already in the number, and how many depends on how busy the machine is.
    expect(washProgress.get()).toBeCloseTo(1 / 6, 1);

    // Long enough for the spring to be under way and nowhere near landed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(washProgress.get()).toBeLessThan(1 / 6);

    // One tenth of a step, written into the middle of that spring.
    await act(async () => {
      fireEvent.wheel(stage(), { deltaX: 24, deltaY: 0 });
    });
    expect(washProgress.get()).toBeCloseTo(0.1, 2);

    // And it stays there. The spring, left running, would have carried it the
    // rest of the way to zero inside this; the settle window that puts a
    // travel back is another 250ms out.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(washProgress.get()).toBeCloseTo(0.1, 2);
  });

  // A touch swipe fires no click at all, so the flag it sets to swallow one
  // sat here until the next press: the Enter that opens the print in front
  // was swallowed instead of opening it.
  it("hands a key press back the tap a swipe swallowed", async () => {
    const { stage } = renderFan(gallery(2), { layout: "phone" });

    await dragBy(stage(), -120, "touch");
    await expectFront(stage, 2);

    fireEvent.keyDown(frontPrint(stage()), { key: "Enter" });
    fireEvent.click(frontPrint(stage()));

    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(1));
  });

  // The walk in flight is what decides whether a landing commits, and a walk
  // stopped past the end of its spring still resolves. The breakpoint remounts
  // the fan, so a commit that ran here would land on the fan that replaced it.
  it("commits nothing from a walk the breakpoint interrupted", async () => {
    const { stage } = renderFan(gallery(7));

    await act(async () => {
      fireEvent.click(print(stage(), 2));
      fanLayout("phone");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(slot(document.body, "photo-fan")).toBeTruthy();
    expect(print(stage(), 1).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("fan tab order", () => {
  // The prints used to be drawn in photo order, so a tab walked a gallery of
  // ten as 1, 2, 3, 9, 10 while 9 and 10 were standing on the left of the
  // stage. They are drawn in seat order now, which is the order they stand in.
  it("walks the prints left to right", () => {
    const { stage } = renderFan(gallery(10));

    expect(printOrder(stage())).toEqual([9, 10, 1, 2, 3]);
  });

  it("walks the phone fan's prints left to right too", () => {
    const { stage } = renderFan(gallery(10), { layout: "phone" });

    expect(printOrder(stage())).toEqual([9, 10, 1, 2, 3]);
  });

  // Seat order means React moves a print's node when the window re-seats
  // around it, and a moved node loses focus. The walk answers that: the print
  // in front takes the keyboard when the commit lands.
  it("keeps the keyboard on the fan through a walk that re-seats it", async () => {
    // Three photos, where the whole set is on stage and a step really does
    // reorder them: 3, 1, 2 becomes 1, 2, 3.
    const { stage } = renderFan(gallery(3));
    expect(printOrder(stage())).toEqual([3, 1, 2]);

    // The keyboard on the print at the left edge, which is the one the commit
    // moves to the other end.
    const outer = print(stage(), 3);
    outer.focus();
    expect(document.activeElement).toBe(outer);

    fireEvent.keyDown(stage(), { key: "ArrowRight" });
    await expectFront(stage, 2);

    expect(printOrder(stage())).toEqual([1, 2, 3]);
    expect(document.activeElement).toBe(frontPrint(stage()));
    expect(stage().contains(document.activeElement)).toBe(true);
  });
});

describe("fan count control", () => {
  // The mark is 20px of badge and the hit area is drawn past its edges, so
  // what a pointer can reach is not what the fan draws. jsdom lays nothing
  // out, so this pins the classes; the pixels are hit-tested in
  // e2e/photo-fan.spec.ts, which is where a clipped overlay shows up.
  it("reaches past the mark, further where the pointer is coarse", () => {
    const { stage } = renderFan(gallery(7));
    const count = within(stage()).getByRole("button", {
      name: "Vse fotografije (7)",
    });

    // 8px a side over a 20px mark is 36px, which is a mouse; 12px is the 44px
    // a thumb is measured against.
    expect(count.className).toContain("after:absolute");
    expect(count.className).toContain("after:-inset-2");
    expect(count.className).toContain("pointer-coarse:after:-inset-3");
    // The overlay is drawn outside the badge, which clips its own children.
    expect(count.className).toContain("overflow-visible");
    // And the mark itself is unchanged: same height, same corner, same type.
    expect(count.className).toContain("h-5");
    expect(count.className).toContain("right-1.5");
    expect(count.className).toContain("bottom-1.5");
    expect(count.className).toContain("px-1.5");
    expect(count.className).toContain("text-3xs");
    expect(count.textContent).toBe("1 / 7");
  });

  it("says what the count opens in its name and not in a hover title", () => {
    const { stage } = renderFan(gallery(7));
    const count = within(stage()).getByRole("button", {
      name: "Vse fotografije (7)",
    });

    // The fan is a phone's gallery, and a title is a mouse and nothing else.
    // The name already said the same words, so the name is where it stays.
    expect(count.getAttribute("title")).toBeNull();
  });
});

describe("useWheelStep", () => {
  // The hook's own gesture, without a fan around it. The surface it is
  // attached to is 400px wide here, so the ratios in lib/swipe.ts mean the
  // same distances they do on a real stage.
  function WheelProbe({
    onStep,
    onSettle,
    cancelOnStep = false,
  }: {
    onStep: (direction: -1 | 1) => void;
    onSettle: (spent: boolean) => void;
    /** Whether the caller drops the gesture from inside its own step, which is
     *  what the fan does: a step hands the surface to a walk. */
    cancelOnStep?: boolean;
  }) {
    const attach = useWheelStep({
      enabled: true,
      commitRatio: 0.22,
      spanRatio: 0.6,
      settleMs: WHEEL_SETTLE_MS,
      onStep: (direction) => {
        onStep(direction);
        if (cancelOnStep) attach.cancel();
      },
      onSettle,
    });
    return (
      <div data-slot="wheel-probe" ref={attach}>
        <button type="button" onClick={() => attach.cancel()}>
          cancel
        </button>
      </div>
    );
  }

  function renderProbe(props: {
    onStep: (direction: -1 | 1) => void;
    onSettle: (spent: boolean) => void;
    cancelOnStep?: boolean;
  }) {
    const view = render(<WheelProbe {...props} />);
    const surface = slot(view.container, "wheel-probe");
    Object.defineProperty(surface, "clientWidth", {
      configurable: true,
      value: STAGE_WIDTH_PX,
    });
    return { surface, cancel: () => fireEvent.click(within(surface).getByRole("button")) };
  }

  it("closes the settle window without firing it", () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    const onSettle = vi.fn();
    const { surface, cancel } = renderProbe({ onStep, onSettle });

    // Under the 88px that commits a step, so the gesture has a settle to run.
    fireEvent.wheel(surface, { deltaX: 40, deltaY: 0 });
    cancel();
    vi.advanceTimersByTime(WHEEL_SETTLE_MS * 2);

    expect(onStep).not.toHaveBeenCalled();
    expect(onSettle).not.toHaveBeenCalled();

    // And the next swipe is a whole gesture again: the travel it dropped is
    // not still standing against this one.
    fireEvent.wheel(surface, { deltaX: 40, deltaY: 0 });
    vi.advanceTimersByTime(WHEEL_SETTLE_MS * 2);
    expect(onStep).not.toHaveBeenCalled();
    expect(onSettle).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  // The caller cancels whenever a walk takes its surface over, and a step it
  // commits here is one of those walks. Honouring that would hand the inertia
  // behind the step a fresh gesture, and one flick would turn two photos.
  it("keeps the inertia after a step it committed itself", () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    const onSettle = vi.fn();
    const { surface } = renderProbe({ onStep, onSettle, cancelOnStep: true });

    fireEvent.wheel(surface, { deltaX: 120, deltaY: 0 });
    expect(onStep).toHaveBeenCalledTimes(1);

    // The tail the trackpad keeps sending. Every one of these re-arms the
    // window, so the whole thing stays the one gesture.
    for (let i = 0; i < 6; i++) {
      fireEvent.wheel(surface, { deltaX: 60, deltaY: 0 });
      vi.advanceTimersByTime(25);
    }
    expect(onStep).toHaveBeenCalledTimes(1);

    // And the window still closes on its own once the tail stops.
    vi.advanceTimersByTime(WHEEL_SETTLE_MS * 2);
    expect(onSettle).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });
});
