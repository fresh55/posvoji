/**
 * The classes a horizontally scrolling row of controls needs, named once.
 *
 * Two rows on this site scroll sideways rather than wrap: the active filters
 * above the animal grid (filters/filter-chips.tsx) and the register's phone
 * index (shelter-jump-strip.tsx). They are drawn at different sizes and hold
 * different things, so this is not a component; what they share is the three
 * couplings below, each of which is silent when it is got wrong.
 *
 * fade-scroll-x hides the scrollbar and masks whichever edge still has content
 * past it, which is the whole of what says there is more to find. It eats
 * 2.5rem at each end, and scroll-px-10 is that same 2.5rem: the browser scrolls
 * a focused control into view by itself, and without the scroll padding it
 * parks it flush against the edge, under the mask, half faded.
 *
 * The -mx-1/px-1 pair gives a focus ring somewhere to be. A scroll box clips at
 * its padding edge and a ring sits outside the control it belongs to, so
 * without the padding the ring is cut off down the first and last control.
 *
 * The vertical axis is left to the caller: overflow-x: auto clips the other
 * axis too, so a row whose controls are taller than its content box needs its
 * own -my/py pair, and how much depends on what it holds.
 *
 * A plain string in lib rather than a shared component, the shape
 * lib/link-styles.ts already takes, so a server component can use it as
 * happily as a client one.
 */
export const SCROLL_STRIP =
  "fade-scroll-x overflow-x-auto scroll-px-10 -mx-1 px-1";

/**
 * The attribute a strip wears so a child can find the box it scrolls inside.
 *
 * A marker and not a walk up the computed overflow: the answer has to be the
 * same in a browser and in jsdom, where every element reports overflow
 * visible, and the two strips this serves reach their children differently
 * (one holds a ref to its box, the other hands its box to a callback ref it
 * cannot read back).
 */
export const SCROLL_STRIP_MARK = "data-scroll-strip";

/**
 * Bring a child of a sideways-scrolling row into view, by its nearest edge and
 * no further. The row is whichever ancestor carries SCROLL_STRIP_MARK.
 *
 * Not `scrollIntoView({ inline: "nearest" })`, which computes the same offset
 * and does one thing more: Chrome moves its sequential focus navigation
 * starting point to whatever element is handed to it. A row that pulls a child
 * into view as it mounts therefore decides where the visitor's first Tab press
 * goes, and everything drawn above the row is skipped. That was a real bug on
 * the species tabs, where the effect ran on every page load and the first Tab
 * landed on a tab rather than on the skip link. Writing the box's own
 * scrollLeft moves no such point, and a horizontal write cannot scroll the
 * page vertically the way the `block` axis could.
 *
 * Measured against the box's own rectangle rather than `offsetLeft`, because
 * only one of the two rows this serves is a positioned element, and on the
 * other the offsets would be resolved against some ancestor further up.
 *
 * scroll-padding is honoured for the reason SCROLL_STRIP documents above: the
 * fade eats 2.5rem at each end, and a control parked flush against the edge is
 * a control drawn half faded. The browser applies it to its own scrolling, so
 * doing this by hand means applying it by hand.
 */
export function scrollChildIntoViewX(
  child: HTMLElement | null,
  { smooth = false }: { smooth?: boolean } = {},
): void {
  const box = child?.closest<HTMLElement>(`[${SCROLL_STRIP_MARK}]`);
  if (!box || !child) return;

  const boxRect = box.getBoundingClientRect();
  // A row that has not been laid out says nothing about what is in view. The
  // filter rows are mounted twice with one copy display:none, and that copy
  // measures zero on every axis.
  if (boxRect.width === 0) return;

  const style = getComputedStyle(box);
  const padLeft = Number.parseFloat(style.scrollPaddingLeft) || 0;
  const padRight = Number.parseFloat(style.scrollPaddingRight) || 0;

  const childRect = child.getBoundingClientRect();
  const pastLeft = childRect.left - (boxRect.left + padLeft);
  const pastRight = childRect.right - (boxRect.right - padRight);
  if (pastLeft >= 0 && pastRight <= 0) return;

  // Both are past their edge only when the child is wider than the room it has,
  // and then the left edge is the one worth showing.
  const by = pastLeft < 0 ? pastLeft : pastRight;
  const left = Math.max(
    0,
    Math.min(box.scrollLeft + by, box.scrollWidth - box.clientWidth),
  );

  if (smooth && typeof box.scrollTo === "function") {
    box.scrollTo({ left, behavior: "smooth" });
    return;
  }
  box.scrollLeft = left;
}
