/**
 * The contract every sideways swipe on this site is judged by.
 *
 * Four surfaces read a horizontal gesture: the card gallery in the grid, the
 * photo fan in the dialog, the fan's phone layout, and the full-screen
 * lightbox. A thumb that learned the gesture on one of them must not have to
 * relearn it on the next, so the numbers below are the same everywhere and
 * live here rather than in four files that agree by hand. They used to agree
 * in prose: three of those files carried a comment claiming to copy another
 * "number for number", which is the tell that the mechanism was missing.
 *
 * What is deliberately NOT here: how a surface captures the pointer, what it
 * moves under the finger, and whether a flick can carry two steps. Those
 * genuinely differ, and each surface keeps its own.
 */

// A drag past this share of the surface's own width commits even at no
// particular speed; a flick short of that still commits if it was quick enough
// and went further than finger drift.
export const SWIPE_DISTANCE_RATIO = 0.22;
export const SWIPE_VELOCITY_PX_MS = 0.5;
// The flick heuristic used to be velocity and nothing else, which let a 2px
// twitch over 3ms clear 0.5px/ms and commit. That is a tap with finger drift,
// and the result was the worst of both: the photo advanced and the tap that
// meant to open the animal was swallowed.
export const MIN_SWIPE_PX = 24;
// How far a gesture travels before it is allowed to declare its axis. Under
// this it is still a tap.
export const AXIS_SLOP_PX = 8;
// How much of the width a finger crosses to move one whole step. Wider than
// the commit ratio on purpose: the thing being pulled in starts more than half
// a width away, and matching the two would make the gesture feel geared down.
export const SWIPE_SPAN_RATIO = 0.6;
// One trackpad swipe is one step. The browser keeps sending deltas while the
// inertia decays, so once a step is spent the surface ignores the wheel until
// it has been this quiet: that swallows the tail rather than turning four
// photos on one flick.
export const WHEEL_SETTLE_MS = 250;

/**
 * Which way a gesture is going, or null while it is still short of the slop
 * and could yet turn out to be a tap.
 *
 * The caller decides this once and then remembers it. A horizontal drag that
 * curls downward at the end must not be re-judged on its endpoints: that is
 * what used to let a long swipe fall through as a click, so the photo snapped
 * back and the dialog opened underneath it.
 */
export function declareAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < AXIS_SLOP_PX) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * Which way a finished horizontal gesture steps, and 0 for one that went
 * nowhere. Negative dx is a finger pulling the next thing in, which is a step
 * forward.
 *
 * `width` is the surface the ratios are measured against and `elapsed` the
 * gesture's own duration, taken from the browser's timestamps rather than a
 * clock of our own.
 */
export function swipeVerdict({
  dx,
  elapsed,
  width,
}: {
  dx: number;
  elapsed: number;
  width: number;
}): -1 | 0 | 1 {
  const travelled = Math.abs(dx);
  // Never zero: every one of these is a distance divided by exactly this.
  const velocity = travelled / Math.max(1, elapsed);
  const farEnough = travelled > width * SWIPE_DISTANCE_RATIO;
  const flicked = velocity > SWIPE_VELOCITY_PX_MS && travelled > MIN_SWIPE_PX;
  if (!farEnough && !flicked) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Hands a captured pointer back, if it was ever taken.
 *
 * jsdom implements neither call, and a browser throws when releasing a pointer
 * it never captured, so both are asked for rather than assumed.
 */
export function releasePointer(
  element: HTMLElement,
  pointerId: number | undefined,
) {
  if (pointerId === undefined) return;
  if (element.hasPointerCapture?.(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
}
