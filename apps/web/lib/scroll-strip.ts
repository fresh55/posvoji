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
