import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      // The height belongs with the font size, not in the base. --text-2xs
      // ships without a paired line-height on purpose (see globals.css), so a
      // badge that only sets the smaller size inherits its leading from
      // whatever it happens to sit in and changes height when the webfont
      // swaps. Pinning h-* alongside each size is what the counter badge in
      // photo-gallery already does by hand.
      size: {
        default: "h-5 text-xs",
        sm: "h-4.5 text-2xs",
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
        quiet: "border-transparent bg-muted text-muted-foreground",
        // On a photograph a wash has nothing to sit on. A 15% fill tints an
        // arbitrary backdrop rather than covering it, and backdrop-blur takes
        // detail out without moving luminance, so amber ink over a mid-tone
        // photo was 1.38:1. These two bring their own opaque ground instead.
        "overlay-warn":
          "border-transparent bg-[var(--status-warn-solid)] text-[var(--status-warn-solid-foreground)] shadow-xs backdrop-blur-sm",
        "overlay-quiet":
          "border-transparent bg-background text-muted-foreground shadow-xs backdrop-blur-sm",
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
