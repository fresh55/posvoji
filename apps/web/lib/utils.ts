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
// rounded-ui is the only custom utility that needs this today. The rest of
// globals.css either sets a property no Tailwind class of ours sets beside it
// (card-paint, tap-target, bleed, no-scrollbar, fade-scroll) or is never
// passed alongside a standard utility for the same property (rounded-ui-top,
// border-dashed-muted). The --spacing-* tokens are the same trap unsprung:
// px-gutter and px-4 would both survive a merge, and nothing passes them
// together yet. Register the spacing theme key here on the day something
// does.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { rounded: [{ rounded: ["ui"] }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
