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
 * Whether the box's scroll went down because its range got shorter.
 *
 * A pick can take rows out below the one pressed (a section drops the options
 * nothing answers any more), and with the box scrolled to its end the browser
 * then pulls scrollTop down to the new end. That is not somebody scrolling,
 * and ending the hold on it left the row wherever the pull put it.
 */
function clampedBelow(box: HTMLElement, expected: number): boolean {
  const end = box.scrollHeight - box.clientHeight;
  return box.scrollTop < expected - 1 && box.scrollTop >= end - 1;
}

/**
 * Whether the press came from a mouse that is still over the box.
 *
 * Room under the rows (see usePressedRowAnchor) is kept only while a pointer
 * rests on the panel, and a finger does not rest: its pointerleave has come
 * and gone before the click. A keyboard press has no pointer of its own, so it
 * asks whether a mouse happens to be over the box. So does a click from a
 * browser that does not say what pressed it, where a device that can hover is
 * the best stand-in for a mouse.
 */
function pointerRestsOn(box: HTMLElement, event: MouseEvent<HTMLElement>): boolean {
  const type = (event.nativeEvent as Partial<PointerEvent>).pointerType;
  if (type) return type === "mouse";
  const canHover =
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(hover: hover)").matches;
  return canHover && box.matches(":hover");
}

/** Room the hold has added under the box's content, and how to take it back. */
type Room = {
  box: HTMLElement;
  /** How much is added now, in px. */
  px: number;
  /** The box's own bottom padding, which the room goes on top of. */
  base: number;
  remove: () => void;
};

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
 * would fight them. The browser pulling the scroll back to a shorter end is
 * the exception (clampedBelow).
 *
 * At the end of the panel a pick can also take away more below the row than
 * any scroll can make up: measured at 1440x900 with the sidebar scrolled to
 * its end, Otroke in Doma imam dropped 108px of dead rows from Lahko ponudim
 * under it and the row went 92px down, leaving the pointer on the VIDEZ
 * heading. There the box grows room under its content, as much as the row
 * needs, and gives it back when the pointer leaves the panel, where the shift
 * lands under nobody, or wheels it, where the visitor is moving the panel
 * anyway. Only for a mouse: a finger does not stay on the panel to be kept
 * from.
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
  const room = useRef<Room | null>(null);

  const removeRoom = useCallback(() => {
    room.current?.remove();
    room.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      removeRoom();
    },
    [removeRoom],
  );

  /** Sizes the room under `box` so a scroll to `want` fits in its range. */
  const makeRoom = useCallback(
    (box: HTMLElement, want: number) => {
      if (room.current && room.current.box !== box) removeRoom();
      const added = room.current?.px ?? 0;
      const px = want - (box.scrollHeight - box.clientHeight - added);
      if (px < 1) {
        removeRoom();
        return;
      }
      if (!room.current) {
        const padding = box.style.paddingBottom;
        // A shift from here on is the visitor's own doing or out of their
        // way, and a hold still running would take the pull that follows
        // for one of its own and put the room straight back.
        const giveBack = () => {
          cancelAnimationFrame(frame.current);
          removeRoom();
        };
        box.addEventListener("pointerleave", giveBack);
        box.addEventListener("wheel", giveBack, { passive: true });
        room.current = {
          box,
          px: 0,
          base: parseFloat(getComputedStyle(box).paddingBottom) || 0,
          remove: () => {
            box.removeEventListener("pointerleave", giveBack);
            box.removeEventListener("wheel", giveBack);
            box.style.paddingBottom = padding;
          },
        };
      }
      if (Math.abs(px - room.current.px) >= 0.5) {
        room.current.px = px;
        box.style.paddingBottom = `${room.current.base + px}px`;
      }
    },
    [removeRoom],
  );

  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const box = event.currentTarget;
      const row = (event.target as Element).closest("button[aria-pressed]");
      // React hands this box the clicks of anything portalled out of it too,
      // the Kje dialog's rows among them. A row the box does not contain is
      // not one its scroll can hold.
      if (!(row instanceof HTMLElement) || !box.contains(row)) return;

      cancelAnimationFrame(frame.current);
      const seen = () => layoutTop(row) - layoutTop(box) - box.scrollTop;
      const held = seen();
      const start = performance.now();
      const mayMakeRoom = pointerRestsOn(box, event);
      let expected = box.scrollTop;

      const hold = () => {
        if (!row.isConnected) return;
        if (
          Math.abs(box.scrollTop - expected) > 1 &&
          !clampedBelow(box, expected)
        )
          return;
        const want = Math.max(0, box.scrollTop + seen() - held);
        if (mayMakeRoom) makeRoom(box, want);
        if (Math.abs(want - box.scrollTop) >= 1) box.scrollTop = want;
        expected = box.scrollTop;
        if (performance.now() - start < PRESSED_ROW_HOLD_MS) {
          frame.current = requestAnimationFrame(hold);
        }
      };
      frame.current = requestAnimationFrame(hold);
    },
    [makeRoom],
  );

  return useMemo(
    () => ({ onClickCapture, style: NO_BROWSER_ANCHORING }),
    [onClickCapture],
  );
}
