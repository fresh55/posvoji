import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// rounded-ui is ours, declared as an @utility in globals.css, and the stock
// merge has never heard of it: a caller passing rounded-full to a control
// whose size variant already carries rounded-ui kept both classes, and the
// stylesheet, which prints the custom utility last, gave the round control a
// 10px radius. Registering it in the radius group makes the two exclusive,
// so the last one written wins, which is what every other rounded-* pair
// already does here.
//
// rounded-ui is the only custom utility that needs this. The others in
// globals.css either set a property no Tailwind class of ours sets beside
// them (card-paint, tap-target, bleed, no-scrollbar, fade-scroll) or are
// never passed alongside a standard utility for the same property
// (rounded-ui-top, border-dashed-muted, the --spacing-* tokens).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { rounded: [{ rounded: ["ui"] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
