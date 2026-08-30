import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// One tier. The size axis carried a second, smaller one for the grid card,
// and the card stopped using it: the same fact was 11px there and 12px in the
// dialog that card opens, and the card is the copy furthest from the reader.
//
// h-5 sits in the base beside text-xs rather than staying a one-value variant,
// because the height belongs with the font size. --text-2xs ships without a
// paired line-height on purpose (see globals.css), so a badge that sets only a
// font size inherits its leading from whatever it happens to sit in and changes
// height when the webfont swaps. Any tier added back here brings its own h-*.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
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
        // The filter green, for the same reason warn is here: it is the mark
        // the site puts on a shelter that shares its animals, and every call
        // site was spelling the three tokens itself. As a link it keeps its
        // colour and moves the border, because outline's wash to bg-muted is
        // the one hover this badge cannot take.
        accent:
          "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)] [a]:hover:border-[var(--filter-accent-strong)]",
        quiet: "border-transparent bg-muted text-muted-foreground",
        // On a photograph a wash has nothing to sit on. A 15% fill tints an
        // arbitrary backdrop rather than covering it, so amber ink over a
        // mid-tone photo was 1.38:1. These two bring their own opaque ground
        // instead, and the ground has to stay opaque: at 85% the muted ink
        // measured 4.15:1 over the darkest photos in the grid, under the 4.5:1
        // that 12px text needs. Nothing below about 91% clears it over a black
        // photo, and by then the photo no longer shows through anyway.
        //
        // No backdrop-filter either. It promotes each badge to its own
        // compositing layer, where Chrome keeps subpixel text antialiasing
        // only while the layer is fully opaque, and against an opaque ground
        // it blurs pixels that are then completely covered. It was buying
        // nothing on either of these.
        "overlay-warn":
          "border-transparent bg-[var(--status-warn-solid)] text-[var(--status-warn-solid-foreground)] shadow-xs",
        "overlay-quiet":
          "border-transparent bg-background text-muted-foreground shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
