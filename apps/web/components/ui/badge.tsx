import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// One tier. The size axis once carried a smaller one for the grid card, and
// the card stopped using it: the same fact was 11px there and 12px in the
// dialog that card opens, and the card is the copy furthest from the reader.
//
// The height belongs with the font size and with the icon, so a tier carries
// all three or it is not a tier. --text-2xs ships without a paired
// line-height on purpose (see globals.css), so a badge that sets only a font
// size inherits its leading from whatever it happens to sit in and changes
// height when the webfont swaps.
//
// This is the mark on someone else's surface: a status over a photo, a count
// beside a heading, the provenance pill on a shelter card. A badge that is
// itself the content wants a larger pill, and the one place with such a row
// (animal-dialog/animal-facts.tsx) builds it there, over this base, rather
// than putting a tier here that nothing else asks for.
//
// The variants below are the same rule: a colour earns a place here once more
// than one surface wears it.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-4xl border border-transparent py-0.5 font-medium whitespace-nowrap transition-all focus-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none",
  {
    variants: {
      size: {
        default: "h-5 gap-1 px-2 text-xs [&>svg]:size-3!",
      },
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          // No focus-visible ring colour here. The badge draws its indicator
          // with focus-ring, which is an outline, so a ring colour with no
          // ring width behind it painted nothing.
          "bg-destructive/10 text-destructive dark:bg-destructive/20 [a]:hover:bg-destructive/20",
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
