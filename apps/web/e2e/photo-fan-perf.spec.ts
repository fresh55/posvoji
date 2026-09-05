import { expect, test } from "@playwright/test";
import { KLOPKA, KLOPKA_PHOTOS, expectPhoto, frontPrint, openFan } from "./fan";

// What a drag across the fan costs the main thread.
//
// Everything else in the fan's suite asks whether the gesture works. This one
// asks what it costs while it works, because the way this component fails is
// not a wrong photo but a drag that stutters on the phone somebody actually
// owns: a re-render per pointer move, a layout forced by reading a box
// mid-gesture, a filter re-sampling five photographs every frame. None of that
// shows up on a developer machine, so the CPU is throttled to a quarter and the
// browser's own trace is the measurement.
//
// The numbers are deliberately loose. This is a guard against a regression that
// changes the shape of the work, not a benchmark: a fan that walks by writing
// transforms out of motion values does no layout and finishes each move well
// inside a frame, and a fan that re-renders on every move does neither.

// A quarter of the machine's speed. Enough that work which is invisible at
// full speed lands as a long task, and not so much that the dev server's own
// hydration never finishes.
const THROTTLE = 4;

// A long task, by the browser's own definition. One is allowed, and measuring
// says which one it is: the commit at the end of the walk, where the window
// re-seats onto the new front photo, the wash takes its new layers and the fan
// renders once. Around 75ms at a quarter speed, and it happens once per
// gesture. What must not appear is a second one, which is what a re-render per
// pointer move looks like from here.
const LONG_TASK_MS = 50;

// A slow, deliberate drag: 40 moves with a frame's wait between them, which is
// a hand moving a photo rather than a flick. Each move is a round trip to the
// browser, so the gesture takes a few seconds of wall clock rather than the
// sum of the pauses, and that only makes it less of a flick. The count is what
// the layout budget below is measured against.
const MOVES = 40;
const MOVE_PAUSE_MS = 17;

// How long the page is left alone before the window opens.
const SETTLE_MS = 500;

// How far across the stage the gesture travels. Past SWIPE_DISTANCE_RATIO
// (0.22 of the stage) so the step commits on distance, and slow enough that
// its velocity is nowhere near the flick that would carry two photos.
const DRAG_RATIO = 0.4;

const MARK_START = "fan-drag-start";
const MARK_END = "fan-drag-end";

// The trace is Chromium's, and so is the CDP session that collects it.
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "the trace comes from CDP",
);

/** One entry of a Chrome trace, in the shape the parts read here need. `ts`
 *  and `dur` are microseconds. */
type TraceEvent = {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  cat?: string;
};

/** When a `performance.mark` landed, in trace microseconds. Marks arrive on the
 *  blink.user_timing category, and Chrome has stamped them with more than one
 *  phase over the years, so the name is what they are found by. */
function markedAt(events: TraceEvent[], name: string): number {
  const mark = events.find((event) => event.name === name);
  if (!mark) throw new Error(`the trace has no ${name} mark in it`);
  return mark.ts;
}

/**
 * What the main thread did between the two marks.
 *
 * Only complete events are counted (`ph: "X"`, which carries a duration):
 * begin/end pairs would have to be matched up, and every event this guards is
 * emitted complete. `RunTask` is one turn of the main thread's loop, so a long
 * one is a frame the browser could not draw; `Layout` is the browser working
 * out where things are, which a fan walked by transforms never asks it to do.
 */
function summarise(events: TraceEvent[]) {
  const from = markedAt(events, MARK_START);
  const to = markedAt(events, MARK_END);
  const inside = events.filter(
    (event) => event.ph === "X" && event.ts >= from && event.ts <= to,
  );
  const tasks = inside
    .filter((event) => event.name === "RunTask")
    .map((event) => ({
      ms: Math.round((event.dur ?? 0) / 1000),
      at: Math.round((event.ts - from) / 1000),
    }));

  return {
    longTasks: tasks.filter((task) => task.ms > LONG_TASK_MS),
    longestTaskMs: Math.max(0, ...tasks.map((task) => task.ms)),
    layouts: inside.filter((event) => event.name === "Layout").length,
  };
}

test("drags the fan without long tasks or layout work", async ({ page }) => {
  // A dev-server route to compile, a drag paced by wall clock and a trace to
  // read afterwards.
  test.slow();

  const cdp = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (payload) => {
    // The protocol types one trace entry as a bag of strings, which is what a
    // format with no fixed schema can be said in a .d.ts. The four fields read
    // here are the ones every entry carries.
    events.push(...(payload.value as unknown as TraceEvent[]));
  });

  // The fan is opened before the throttle and the trace are turned on, on
  // purpose: what is being guarded is the gesture, and neither Turbopack's
  // first compile of the route nor the hydration behind it is the fan's work.
  const fan = await openFan(page, KLOPKA);
  await expectPhoto(fan, 1, KLOPKA_PHOTOS);

  const stage = await fan.boundingBox();
  const print = await frontPrint(fan).boundingBox();
  if (!stage || !print) throw new Error("the fan has no box to drag across");
  const from = { x: print.x + print.width / 2, y: print.y + print.height / 2 };
  const travel = Math.round(stage.width * DRAG_RATIO);

  // The dialog's own pictures, in: the prints, the wash behind them and the
  // blur placeholders under both. One that arrives late lays itself out inside
  // the window and reads as work the gesture did. Only the dialog's, because
  // the grid behind it is a page of lazy images that never load at all while
  // something is open over them.
  await expect
    .poll(() =>
      page
        .locator('[data-slot="animal-dialog"]')
        .evaluate((dialog) =>
          Array.from(dialog.querySelectorAll("img")).every(
            (image) => image.complete,
          ),
        ),
    )
    .toBe(true);

  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await cdp.send("Tracing.start", {
    // Everything off, then the two timeline categories the parts read here come
    // from and the one the marks arrive on.
    categories:
      "-*,devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing",
    // Handed back as Tracing.dataCollected events rather than as a stream, so
    // there is nothing to read out of an IO handle afterwards.
    transferMode: "ReportEvents",
  });

  // Turning tracing on is itself work, and the page is still finishing what
  // the load left it. The window has to open on a quiet thread or the tail of
  // the load is counted as the gesture's.
  await page.waitForTimeout(SETTLE_MS);

  await page.evaluate((name) => performance.mark(name), MARK_START);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let move = 1; move <= MOVES; move++) {
    await page.mouse.move(from.x - (travel * move) / MOVES, from.y);
    await page.waitForTimeout(MOVE_PAUSE_MS);
  }
  await page.mouse.up();

  // The release hands the fan to a spring, and the step commits when it lands.
  // The mark goes after it, so the walk the gesture started is inside the
  // window as well as the gesture itself.
  await expectPhoto(fan, 2, KLOPKA_PHOTOS);
  await page.evaluate((name) => performance.mark(name), MARK_END);

  const complete = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => resolve());
  });
  await cdp.send("Tracing.end");
  await complete;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const { longTasks, longestTaskMs, layouts } = summarise(events);

  const named =
    longTasks.map((task) => `${task.ms}ms at +${task.at}ms`).join(", ") ||
    "none";
  expect(
    longTasks.length,
    `tasks over ${LONG_TASK_MS}ms: ${named} (longest task ${longestTaskMs}ms)`,
  ).toBeLessThanOrEqual(1);
  // A fan walked by writing transforms out of motion values asks for no layout
  // at all. The budget is per pointer move rather than a flat number, so it
  // stays meaningful if the gesture above is ever made longer or shorter. One
  // layout in four moves: the 2026-09-04 trace measured one in ten after the
  // margin moved to a clip-path, and two per move, the old line, would have
  // let a layout on every move through.
  expect(layouts, `layouts across ${MOVES} moves: ${layouts}`).toBeLessThanOrEqual(
    Math.ceil(MOVES / 4),
  );
});
