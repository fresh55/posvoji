import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Two tiers, and no more. The size axis once carried a smaller one for the
// grid card, and the card stopped using it: the same fact was 11px there and
// 12px in the dialog that card opens, and the card is the copy furthest from
// the reader.
//
// The height belongs with the font size and with the icon, so a tier carries
// all three or it is not a tier. --text-2xs ships without a paired
// line-height on purpose (see globals.css), so a badge that sets only a font
// size inherits its leading from whatever it happens to sit in and changes
// height when the webfont swaps.
//
// "default" is the mark on someone else's surface: a status over a photo, a
// count beside a heading, the provenance pill on a shelter card. "lg" is the
// badge that is the content, which is the row of facts on an animal: the same
// pill at 20px put a 12px glyph beside 12px type and read as a footnote about
// the animal rather than as the animal's own description.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-4xl border border-transparent py-0.5 font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none",
  {
    variants: {
      size: {
        default: "h-5 gap-1 px-2 text-xs [&>svg]:size-3!",
        // :not([class*='size-']) and not the bang the small tier uses. This
        // tier carries the animal's facts, and one of them draws its meaning
        // with the icon's own size: the size badge is a paw print that grows
        // from small to large, the same paw the size filter draws. An
        // important rule here would flatten all three to one paw.
        lg: "h-7 gap-1.5 px-2.5 text-xs [&>svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // The status family, in one place. It used to be spelled out in three:
        // two Record maps in status-badge.tsx and five utilities inline on the
        // card's long-stay mark, two of them raw var(--status-warn-*) reads.
        // A badge is where a badge's colours belong.
        warn: "border-[var(--status-warn-border)] bg-[var(--status-warn)] text-[var(--status-warn-foreground)]",
        // The other half of the status family: a fact that has been checked
        // and came back good. A health record, a shelter that shares its data
        // by permission, an animal that found a home. Its own token family and
        // not --filter-accent, so a fact about the world and a filter the
        // visitor switched on are never the same green; see globals.css.
        trust:
          "border-[var(--trust-border)] bg-[var(--trust)] text-[var(--trust-foreground)]",
        quiet: "border-transparent bg-muted text-muted-foreground",
        // The neutral tier of the badge grammar: who the animal is, said in
        // grey, so the green health row beside it is the only colour in the
        // block.
        fact: "border-border bg-muted/40 text-foreground",
        // A "no" is not a fault, so it never gets the warm family: a plain
        // bordered pill, and words that say what the animal would rather have.
        "outline-muted": "border-foreground/25 text-muted-foreground",
        // A question nobody has answered yet, drawn as an empty seat.
        dashed: "border-dashed border-border text-muted-foreground",
        // On a photograph a wash has nothing to sit on. A 15% fill tints an
        // arbitrary backdrop rather than covering it, and backdrop-blur takes
        // detail out without moving luminance, so amber ink over a mid-tone
        // photo was 1.38:1. These two bring their own opaque ground instead.
        "overlay-warn":
          "border-transparent bg-[var(--status-warn-solid)] text-[var(--status-warn-solid-foreground)] shadow-xs backdrop-blur-sm",
        "overlay-quiet":
          "border-transparent bg-background text-muted-foreground shadow-xs backdrop-blur-sm",
        // The loudest mark a photo carries, monochrome on purpose: the same
        // inversion the pressed species tab uses, for the handful of cards
        // whose one fact outranks the amber tier above.
        "overlay-strong":
          "border-transparent bg-foreground text-background shadow-xs backdrop-blur-sm",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
