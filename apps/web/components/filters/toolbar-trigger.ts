/** The toolbar's quiet trigger treatment, shared by the shelter picker and the
 *  sort picker so the two controls sitting side by side stay in step.
 *
 *  The row above the grid held three bordered boxes next to the species tabs,
 *  four framed things asking for the same glance. The tabs are the row's
 *  anchor; these two draw their frame when a pointer or the open state asks
 *  for it, and are only text at rest.
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
