import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

/**
 * The gesture and preload seams every jsdom suite in this app needs.
 *
 * Not a `.test.` file, so vitest does not collect it. Four suites used to
 * carry their own copy of the builder below, and the copies had drifted: only
 * one set `isPrimary`, only one took a mouse button, and the timestamp fix
 * that every velocity assertion depends on was in two of the four.
 */

export type PointerKind =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel";

/**
 * One pointer event, as a phone or a mouse would deliver it.
 *
 * jsdom has no PointerEvent, and the Event it falls back to drops clientX and
 * pointerType, so the gesture is built on MouseEvent by hand. React listens by
 * event name, so the pointer handlers still receive these, and reads pointerId
 * off the native event. Pointer capture is likewise absent, and every surface
 * here calls it only when it exists.
 *
 * The timestamp is given rather than taken: two events built one line apart
 * carry the same millisecond, and every gesture is judged on a velocity, which
 * is a distance divided by exactly that difference. It must never be zero
 * either, because React reads a falsy timeStamp as one it was not given and
 * hands the handler `Date.now()` instead. GESTURE_T0 is where a clock starts.
 */
export function pointer(
  element: Element,
  type: PointerKind,
  init: {
    x: number;
    y: number;
    /** Defaults to a finger, which is what most of these gestures are. */
    pointerType?: string;
    /** Which finger. Only a test about a second one has to say. */
    pointerId?: number;
    /** Which mouse button. 0 is the primary one, and the only one that drags. */
    button?: number;
    time?: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
  });
  const pointerId = init.pointerId ?? 1;
  Object.defineProperty(event, "pointerType", {
    value: init.pointerType ?? "touch",
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "isPrimary", { value: pointerId === 1 });
  if (init.time !== undefined) {
    Object.defineProperty(event, "timeStamp", { value: init.time });
  }
  fireEvent(element, event);
}

/** Where a gesture's clock starts. Any number but zero would do. */
export const GESTURE_T0 = 1000;

/** The element a surface marks with `data-slot`, or a failure that names it. */
export function slot(root: HTMLElement, name: string) {
  const found = root.querySelector(`[data-slot="${name}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${name}`);
  return found;
}

/**
 * Every image a surface builds to warm the cache, in the order it made them.
 *
 * `new window.Image()` is the only way that preload is observable, so the
 * stub has to carry every field lib/preload-photos.ts sets: a field missing
 * here reads back as undefined and the assertion passes for the wrong reason.
 */
export function capturePreloads() {
  const made: { src: string; srcset: string; sizes: string }[] = [];
  class FakeImage {
    src = "";
    srcset = "";
    sizes = "";
    fetchPriority = "";
    decoding = "";
    constructor() {
      made.push(this);
    }
  }
  vi.stubGlobal("Image", FakeImage);
  return made;
}
