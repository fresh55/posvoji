import type { CDPSession, Page } from "@playwright/test";

// Touch points dispatched over CDP, in one place. Not a .spec.ts, so
// Playwright's default testMatch leaves it alone.
//
// Input.dispatchTouchEvent hands the points to the browser's own input
// pipeline instead of dispatching an event at an element, so everything that
// stands between a thumb and a component is still in the way. Only Chromium
// speaks CDP, so every spec built on this skips elsewhere.

/** The four phases of a gesture, spelled the way the protocol spells them. */
export type TouchType = "touchStart" | "touchMove" | "touchEnd" | "touchCancel";

/** One finger. `id` is what keeps two of them apart across the moves. */
export type TouchPoint = { x: number; y: number; id: number };

/** The fingers on the glass right now, which is why a lift is an empty list
 *  rather than the point that left. */
export async function touch(
  cdp: CDPSession,
  type: TouchType,
  touchPoints: TouchPoint[],
): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
}

/**
 * One finger, dragged in real steps from one point to another.
 *
 * `pauseMs` is the gesture's own speed and not a wait for anything: a pull and
 * a swipe are judged on the distance and on the velocity between the browser's
 * own timestamps, and a drag delivered in one tick is a flick however carefully
 * it is worded. The fan reads the same quotient and turns two photos on one
 * past FAN_LIMIT, so a gesture's step count and pause are part of what its
 * test asserts.
 *
 * Coordinates are rounded because a finger lands on a pixel, and both ends of
 * the travel are rounded the same way, so a drag of 200 is still 200.
 */
export async function dragTouch(
  page: Page,
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { steps = 10, pauseMs = 20 }: { steps?: number; pauseMs?: number } = {},
): Promise<void> {
  await touch(cdp, "touchStart", [
    { x: Math.round(from.x), y: Math.round(from.y), id: 1 },
  ]);
  for (let step = 1; step <= steps; step++) {
    await page.waitForTimeout(pauseMs);
    await touch(cdp, "touchMove", [
      {
        x: Math.round(from.x + ((to.x - from.x) * step) / steps),
        y: Math.round(from.y + ((to.y - from.y) * step) / steps),
        id: 1,
      },
    ]);
  }
  await touch(cdp, "touchEnd", []);
}
