"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
} from "react";

/**
 * How long a press holds its row in place, in ms. The pick, the counts it
 * changes and a note it adds or takes away land in the next frame or two;
 * the rest is room for a slow phone.
 */
export const PRESSED_ROW_HOLD_MS = 700;

/**
 * The browser's own scroll anchoring, off, so the hold is the only thing that
 * moves the box after a press.
 *
 * The two do not add up. Chrome anchors to the first node it finds in view,
 * and whether that lies above or below the change is chance: in the sidebar it
 * was the section that grew, so nothing moved the box, and in the sheet it
 * lay below, so Chrome scrolled it. Then the hold scrolled it again, and the
 * tile ended up 25px the other way.
 */
const NO_BROWSER_ANCHORING: CSSProperties = { overflowAnchor: "none" };

/**
 * Where a node sits in the page's layout.
 *
 * offsetTop rather than a rectangle, because it answers where the row is laid
 * out and not where it is drawn. A rectangle takes in the card's own motion:
 * the press scales it to 0.98, and Energija's lively card hops, so a hold
 * measured that way scrolled the panel after the hop. offsetTop ignores
 * transforms, and the scroll of every box between a node and its offsetParent,
 * so the same sum over the row and over the box gives the row's place in the
 * box's content, whatever either of them is doing.
 */
function layoutTop(node: HTMLElement): number {
  let top = 0;
  for (
    let at: HTMLElement | null = node;
    at;
    at = at.offsetParent as HTMLElement | null
  ) {
    top += at.offsetTop;
  }
  return top;
}

/**
 * Keeps a pressed filter row where the pointer left it.
 *
 * A pick can change what is drawn above the row that took it. Measured on
 * /?vrsta=pes at 1440x900: picking Velika gave Starost a "Brez podatka" line,
 * 38px, and the Velikost rows moved down in the same frame, which left the
 * pointer over Srednja.
 *
 * So the scrolling box remembers where in its view the pressed row was and,
 * for a short while after, scrolls itself by however far the row has moved.
 * The correction runs in an animation frame, which comes after the render the
 * click caused and before it is painted, so the row is never seen anywhere
 * else.
 *
 * Anything else scrolling the box ends the hold at once: a wheel, a finger, a
 * focus move, a section opening itself into view (scrollChildIntoViewY). The
 * box is then where somebody else wanted it, and following the row from there
 * would fight them.
 *
 * Returns the props the box spreads: its onClickCapture, and a style that
 * turns the browser's anchoring off. A click and not a pointerdown, because a
 * keyboard press is a click too and its row is just as easily lost. Only rows
 * that state their answer with aria-pressed are held, which is every filter
 * option and nothing that opens or scrolls the panel itself.
 */
export function usePressedRowAnchor(): {
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  style: CSSProperties;
} {
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget;
    const row = (event.target as Element).closest("button[aria-pressed]");
    // React hands this box the clicks of anything portalled out of it too,
    // the Kje dialog's rows among them. A row the box does not contain is not
    // one its scroll can hold.
    if (!(row instanceof HTMLElement) || !box.contains(row)) return;

    cancelAnimationFrame(frame.current);
    const seen = () => layoutTop(row) - layoutTop(box) - box.scrollTop;
    const held = seen();
    const start = performance.now();
    let expected = box.scrollTop;

    const hold = () => {
      if (!row.isConnected || Math.abs(box.scrollTop - expected) > 1) return;
      const drift = seen() - held;
      if (Math.abs(drift) >= 1) {
        box.scrollTop += drift;
        expected = box.scrollTop;
      }
      if (performance.now() - start < PRESSED_ROW_HOLD_MS) {
        frame.current = requestAnimationFrame(hold);
      }
    };
    frame.current = requestAnimationFrame(hold);
  }, []);

  return useMemo(
    () => ({ onClickCapture, style: NO_BROWSER_ANCHORING }),
    [onClickCapture],
  );
}
