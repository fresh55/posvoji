import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  dialog,
  edgePoint,
  expectPhoto,
  frontPrint,
  KLOPKA,
  KLOPKA_PHOTOS,
  openFan,
  otherFan,
  print,
} from "./fan";
import { dragTouch, touch, type TouchPoint } from "./touch";

// The photo fan on a device with a finger.
//
// photo-spread.tsx mounts one layout, chosen by the sm media query, so which
// fan is in the document is a fact about the viewport and not about the
// device, and a desktop browser at 412px would answer it the same way whether
// or not it could touch anything. What only a real mobile context can answer
// is the rest: a swipe that arrives as a touch pointer rather than a mouse one
// (the stage takes no capture for touch, on purpose, so it does not fight the
// dialog's dismiss gesture over the same pointer), and whether five overlapping
// prints on a 412px screen hand the page a horizontal scrollbar.

test("draws the phone fan and not the desktop one", async ({ page }) => {
  const fan = await openFan(page, KLOPKA, { layout: "phone" });

  await expectPhoto(fan, 1, KLOPKA_PHOTOS);
  // Absent, not hidden: the fan mounts the one layout the media query names,
  // so a phone never carries the desktop stage's prints, images and motion
  // values for nothing.
  await expect(otherFan(page, "phone")).toHaveCount(0);
});

test("turns one photo on a touch swipe", async ({ page }) => {
  const fan = await openFan(page, KLOPKA, { layout: "phone" });

  // Dispatched rather than driven, the same way shelter-picker-touch.spec.ts
  // dispatches its touchmove: what is being pinned is the rule the stage
  // keeps, not the browser's gesture recognition. The pauses are the gesture's
  // own speed and not a wait for anything -- endSwipe divides the distance by
  // the time between the browser's own timestamps, and a swipe delivered in
  // one tick is a hard flick, which past FAN_LIMIT turns two photos.
  await fan.evaluate(async (stage) => {
    const box = stage.getBoundingClientRect();
    const y = box.top + box.height / 2;
    const from = box.left + box.width * 0.8;
    const distance = box.width * 0.4;
    function send(type: string, x: number) {
      stage.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    send("pointerdown", from);
    for (let i = 1; i <= 12; i++) {
      await new Promise((settle) => setTimeout(settle, 25));
      send("pointermove", from - (distance * i) / 12);
    }
    send("pointerup", from - distance);
  });

  await expectPhoto(fan, 2, KLOPKA_PHOTOS);
});

test("never hands the page a sideways scroll", async ({ page }) => {
  const fan = await openFan(page, KLOPKA, { layout: "phone" });

  // The neighbours have to clip at the screen edge or the dialog's scroller
  // gets a horizontal scrollbar, and the fan is five overlapping prints on a
  // screen narrower than two of them. overflow-x-clip and not hidden, because
  // the drop still hangs the side photos past the stage's bottom.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBe(overflow.innerWidth);

  // And after a step, because the prints are re-seated rather than redrawn and
  // the widest moment of a walk is the one in between. Tapped at a point
  // hit-tested in from the print's outer edge: its middle is under the front
  // one, so a tap aimed at its centre opens the lightbox instead.
  const point = await edgePoint(print(fan, 2), "right");
  await page.touchscreen.tap(point.x, point.y);
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);

  const settled = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(settled.scrollWidth).toBe(settled.innerWidth);
});

// The same fan, driven through the browser's own touch pipeline.
//
// The swipe above is dispatched from page context, which pins the rule the
// stage keeps and nothing else: it skips hit testing, the implicit capture a
// touch pointer takes on the element it pressed, the browser's choice between
// a native scroll and a gesture for the page, and the pointercancel that
// choice sends. Every one of those stands between a thumb and the fan, and
// every one of them is a way for a second finger or a scroll to walk off with
// a gesture that belongs to something else.

// Ten moves is a gesture with a speed rather than a jump, which is what
// dragTouch is paced at by default. Named here as well because the two-finger
// sequences below are stepped by hand and keep the same speed. touch.ts says
// why the pauses are the gesture rather than a wait.
const STEPS = 10;
const STEP_MS = 20;

/**
 * Where a swipe across the phone fan can run, in viewport coordinates.
 *
 * Measured in screen widths rather than in the stage's own: on a phone the fan
 * is wider than the screen on purpose and the stage clips it, so part of its
 * box can be off screen entirely. The start point is hit-tested for the same
 * reason a tap on a side print is (see edgePoint): a point the stage does not
 * answer for is a gesture delivered to whatever else is standing there.
 */
async function swipePath(
  fan: Locator,
): Promise<{ y: number; from: number; to: number }> {
  const path = await fan.evaluate((stage) => {
    const box = stage.getBoundingClientRect();
    const y = Math.round(
      Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 1),
    );
    const from = Math.round(window.innerWidth * 0.82);
    const hit = document.elementFromPoint(from, y);
    return {
      y,
      from,
      to: Math.round(window.innerWidth * 0.3),
      onStage: hit !== null && (hit === stage || stage.contains(hit)),
      // What the fan asks of a swipe before it turns a photo, which is
      // SWIPE_DISTANCE_RATIO of the stage's own width.
      commitPx: stage.clientWidth * 0.22,
    };
  });
  if (!path.onStage) throw new Error("this swipe would not land on the fan");
  if (path.from - path.to <= path.commitPx) {
    throw new Error("a screen-wide swipe no longer clears the fan's commit distance");
  }
  return { y: path.y, from: path.from, to: path.to };
}

/** How far the page and the dialog's own scroller have gone sideways. */
async function sideways(page: Page) {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-slot="animal-dialog"]');
    return {
      page: window.scrollX,
      shell: shell ? shell.scrollLeft : 0,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

test.describe("under real touch points", () => {
  // Dispatched over a CDP session, which only Chromium speaks. The synthetic
  // swipe above is what the mobile-webkit project has, so the skip belongs to
  // this group rather than to the file.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the touch points are dispatched over a CDP session, which is Chromium only",
  );

  test("turns one photo on a one-finger swipe", async ({ page }) => {
    const fan = await openFan(page, KLOPKA, { layout: "phone" });
    const cdp = await page.context().newCDPSession(page);
    const path = await swipePath(fan);

    await dragTouch(
      page,
      cdp,
      { x: path.from, y: path.y },
      { x: path.to, y: path.y },
      { steps: STEPS, pauseMs: STEP_MS },
    );

    await expectPhoto(fan, 2, KLOPKA_PHOTOS);
    // touch-pan-y on the stage is what keeps the browser from reading the same
    // finger as a sideways pan of the page under it. A dispatched pointer
    // never asks the question, because touch-action is settled before any
    // handler runs.
    const scroll = await sideways(page);
    expect(scroll.page).toBe(0);
    expect(scroll.shell).toBe(0);
    expect(scroll.scrollWidth).toBe(scroll.innerWidth);
  });

  test("neither turns a photo nor dismisses the animal on a second finger", async ({
    page,
  }) => {
    const fan = await openFan(page, KLOPKA, { layout: "phone" });
    const cdp = await page.context().newCDPSession(page);
    const path = await swipePath(fan);
    const first = (step: number): TouchPoint => ({
      x: Math.round(path.from + ((path.to - path.from) * step) / STEPS),
      y: path.y,
      id: 1,
    });
    // A second finger landing left of the swipe and travelling away from it,
    // which is the hand a visitor uses to make the photograph bigger: the
    // stage offers the pinch on purpose (touch-pinch-zoom).
    const second = (step: number): TouchPoint => ({
      x: Math.round(path.to - (20 * step) / 5),
      y: path.y + Math.round((160 * step) / 5),
      id: 2,
    });

    await touch(cdp, "touchStart", [first(0)]);
    for (let step = 1; step <= 5; step++) {
      await page.waitForTimeout(STEP_MS);
      await touch(cdp, "touchMove", [first(step)]);
    }

    // The second finger arrives mid-swipe and spreads.
    await touch(cdp, "touchStart", [first(5), second(0)]);
    for (let step = 1; step <= 5; step++) {
      await page.waitForTimeout(STEP_MS);
      await touch(cdp, "touchMove", [first(5), second(step)]);
    }

    // The first finger carries on and then lifts on its own, with the second
    // still down.
    for (let step = 6; step <= STEPS; step++) {
      await page.waitForTimeout(STEP_MS);
      await touch(cdp, "touchMove", [first(step), second(5)]);
    }
    await touch(cdp, "touchEnd", [first(STEPS)]);

    // The browser took the two fingers for the pinch they are and rescaled the
    // visual viewport, which is the whole point of asking a real one: the page
    // never sees a gesture it can walk the fan with, and the first finger's own
    // coordinates come back rescaled with the viewport. Measured raw, that is a
    // jump of several hundred pixels down the screen on a hand that only
    // spread, and it dismissed the animal.
    const zoom = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(zoom).toBeGreaterThan(1);
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
    await expectPhoto(fan, 1, KLOPKA_PHOTOS);

    // And the second finger leaving is not a decision either: nothing about a
    // pinch turns a photo or closes an animal.
    await touch(cdp, "touchEnd", []);
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
    await expectPhoto(fan, 1, KLOPKA_PHOTOS);
  });

  test("leaves a mostly vertical drag to the dialog", async ({ page }) => {
    const fan = await openFan(page, KLOPKA, { layout: "phone" });
    const cdp = await page.context().newCDPSession(page);
    const path = await swipePath(fan);
    // Twice as far down as sideways: past the fan's axis test, which wants the
    // horizontal to dominate, and past the dialog's, which asks for a drop at
    // least half again the sideways travel. Short of DRAG_CLOSE_PX, which is
    // 140, so the dialog springs back rather than leaving.
    const drop = 100;
    const drift = -50;

    await dragTouch(
      page,
      cdp,
      { x: path.from, y: path.y },
      { x: path.from + drift, y: path.y + drop },
      { steps: STEPS, pauseMs: STEP_MS },
    );

    // Neither of them acted on it: the fan is on the photo it started on and
    // the dialog is still here.
    await expectPhoto(fan, 1, KLOPKA_PHOTOS);
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
  });

  test("closes the dialog on a mostly vertical pull past the threshold", async ({
    page,
  }) => {
    const fan = await openFan(page, KLOPKA, { layout: "phone" });
    const cdp = await page.context().newCDPSession(page);
    const path = await swipePath(fan);
    // The same shape as the drag above, carried past DRAG_CLOSE_PX. That the
    // fan turns no photo on this axis is pinned there rather than here: the
    // dismissal takes the fan with it, so there is nothing left to ask.
    const drop = 200;
    const drift = -100;

    await dragTouch(
      page,
      cdp,
      { x: path.from, y: path.y },
      { x: path.from + drift, y: path.y + drop },
      { steps: STEPS, pauseMs: STEP_MS },
    );

    // Gone rather than hidden: Radix takes the layer out of the document when
    // the exit animation lands.
    await expect(dialog(page)).toHaveCount(0);
    await expect(fan).toHaveCount(0);
  });

  test("leaves the fan on its own photo when the gesture is taken away", async ({
    page,
  }) => {
    const fan = await openFan(page, KLOPKA, { layout: "phone" });
    const cdp = await page.context().newCDPSession(page);
    const path = await swipePath(fan);
    const at = (step: number) =>
      Math.round(path.from + ((path.to - path.from) * step) / STEPS);

    await touch(cdp, "touchStart", [{ x: path.from, y: path.y, id: 1 }]);
    for (let step = 1; step <= 6; step++) {
      await page.waitForTimeout(STEP_MS);
      await touch(cdp, "touchMove", [{ x: at(step), y: path.y, id: 1 }]);
    }
    // The browser takes the gesture away mid-swipe, which is what a system
    // gesture or a scroll starting elsewhere looks like from here.
    await touch(cdp, "touchCancel", []);

    // A cancelled pointer is not a decision: the fan settles back on the photo
    // it started on, with one print in front and no half-turned stack.
    await expectPhoto(fan, 1, KLOPKA_PHOTOS);
    await expect(frontPrint(fan)).toHaveCount(1);
    await expect(dialog(page)).toHaveAttribute("data-state", "open");
  });
});
