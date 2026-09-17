/** The toolbar's quiet trigger treatment, worn by the shelter picker.
 *
 *  The row above the grid held three bordered boxes next to the species tabs,
 *  four framed things asking for the same glance. The tabs are the row's
 *  anchor; this one draws its frame when a pointer or the open state asks for
 *  it, and is only text at rest.
 *
 *  The sort trigger wore it too until a visitor read its bare order as a
 *  caption for the drawing above it (sort-picker.tsx). It keeps a frame at
 *  rest now, so the two are no longer in step, and the one layout where both
 *  stand in this row is the lg page with no filter panel beside it. Whichever
 *  way that row is settled, it is settled for both of them at once.
 *
 *  The dark: terms are not decoration. Both primitives ship a dark ground of
 *  their own (`dark:bg-input/30`, `dark:hover:bg-input/50` in ui/button.tsx
 *  and ui/select.tsx), and an unprefixed `bg-transparent` does not override a
 *  `dark:bg-*` rule: twMerge treats them as different keys, so both survive
 *  and the control keeps its filled ground in dark mode. Written out here once
 *  rather than rediscovered at each call site.
 *
 *  No transition-* term: the two primitives declare their own (`transition-all`
 *  and `transition-[color,box-shadow]`), and overriding either with a narrower
 *  one silently drops the focus ring's animation.
 *
 *  The open state stays with the caller, because the two primitives spell it
 *  differently: aria-expanded on the button, data-[state=open] on the select. */
export const QUIET_TRIGGER_CLASS =
  "border-transparent bg-transparent shadow-none hover:border-border dark:border-transparent dark:bg-transparent dark:hover:bg-muted/50";
