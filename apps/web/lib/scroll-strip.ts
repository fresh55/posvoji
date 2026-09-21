/**
 * The classes a horizontally scrolling row of controls needs, named once.
 *
 * One row on this site scrolls sideways rather than wrapping today, the active
 * filters above the animal grid (filters/filter-chips.tsx); the register's
 * phone index was a second until it came off. Kept as a string rather than
 * folded into that component, because the next row that scrolls should take
 * these rather than respell them: what a strip needs is the three couplings
 * below, each of which is silent when it is got wrong.
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

/**
 * The attribute a vertically scrolling panel wears, for the same reason and
 * read the same way as SCROLL_STRIP_MARK above: a marker, not a walk up the
 * computed overflow, because jsdom reports every element as overflow visible
 * and measures every box at zero.
 *
 * The walk is wrong in a browser too, for the panel this serves. The filter
 * sidebar is sticky and taller than the room above the fold, and when its
 * content happens not to overflow, an ancestor search for a box that scrolls
 * finds none and the caller falls through to the page -- which is the one
 * thing scrollChildIntoViewY exists to stop.
 */
export const SCROLL_BOX_MARK = "data-scroll-box";

/**
 * Bring a child of a vertically scrolling panel into view, by its nearest edge
 * and no further, moving the panel and nothing else.
 *
 * The Y twin of scrollChildIntoViewX, and it exists for a sharper version of
 * the same objection. scrollIntoView scrolls every scrollable ancestor it can
 * find, and for a panel inside a page that is one of them: measured at
 * 1440x900 on the built site with the page at rest, one
 * scrollIntoView({ block: "nearest" }) on a filter section moved the window
 * 177px and the panel 0. The filter panel is sticky under the page title, so
 * that is the site's name and heading scrolled away to bring a section into a
 * panel that could have moved instead. The same call here moves the panel
 * 177px and the window 0.
 *
 * "nearest" written out: a child taller than the room, or above it, aligns
 * tops; one below aligns bottoms; one already inside does not move at all.
 *
 * The room is the part of the panel the window shows, not the panel's own box.
 * A sticky panel 876px tall under a title block hangs its last 141px below the
 * window at the top of the page, and a child aligned to the box's bottom edge
 * settles just out of sight. Clipping to the window costs nothing once the
 * panel is stuck, where the two are the same rectangle.
 */
export function scrollChildIntoViewY(
  child: HTMLElement | null,
  { smooth = false }: { smooth?: boolean } = {},
): void {
  const box = child?.closest<HTMLElement>(`[${SCROLL_BOX_MARK}]`);
  if (!box || !child) return;

  const boxRect = box.getBoundingClientRect();
  // A panel that has not been laid out says nothing about what is in view.
  if (boxRect.height === 0) return;

  const top = Math.max(boxRect.top, 0);
  const bottom = Math.min(boxRect.bottom, document.documentElement.clientHeight);
  const childRect = child.getBoundingClientRect();
  const by =
    childRect.height > bottom - top || childRect.top < top
      ? childRect.top - top
      : childRect.bottom > bottom
        ? childRect.bottom - bottom
        : 0;
  if (by === 0) return;

  const next = Math.max(
    0,
    Math.min(box.scrollTop + by, box.scrollHeight - box.clientHeight),
  );
  if (next === box.scrollTop) return;

  if (smooth && typeof box.scrollTo === "function") {
    box.scrollTo({ top: next, behavior: "smooth" });
    return;
  }
  box.scrollTop = next;
}
