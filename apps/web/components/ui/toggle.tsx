"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// What "chosen" looks like is the green family, the same three tokens
// filter-card.tsx sets on a selected card. This state used to be bg-muted,
// which is what hover paints as well: an unselected option under the pointer
// was indistinguishable from a selected one, and at rest the light theme's
// --muted is a 3% wash on --card, so the pressed state was barely there on its
// own either.
//
// Spelled against both selectors, because the two shapes built on this string
// say the state differently: a Toggle sets aria-pressed, a ToggleGroup item
// sets data-state="on". The group also carries its own data-[state=on]:bg-muted
// (toggle-group.tsx); it is handed to cn ahead of this string, so tailwind-merge
// resolves the pair in this one's favour and the group needs no edit.
//
// The hover repeats are not redundant. hover:bg-muted below is a plain
// pseudo-class, so at equal specificity the cascade would let the pointer wash
// the accent off whichever order Tailwind emits the two in;
// [aria-pressed=true]:hover and [data-state=on]:hover outrank it outright. The
// same guard filter-card.tsx puts on its selected variant.
//
// border border-transparent is what gives the accent border something to land
// on: the default variant draws no border, and with border-box sizing the
// reserved pixel costs the fixed heights nothing.
//
// focus-visible:ring-ring, not ring-ring/50: halving the ring takes it under
// the 3:1 SC 1.4.11 asks of a focus indicator. The measurements live once, on
// --ring in globals.css.
const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-ui border border-transparent text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:border-[var(--filter-accent-border)] aria-pressed:bg-[var(--filter-accent)] aria-pressed:text-[var(--filter-accent-foreground)] aria-pressed:shadow-xs aria-pressed:hover:bg-[var(--filter-accent)] aria-pressed:hover:text-[var(--filter-accent-foreground)] data-[state=on]:border-[var(--filter-accent-border)] data-[state=on]:bg-[var(--filter-accent)] data-[state=on]:text-[var(--filter-accent-foreground)] data-[state=on]:shadow-xs data-[state=on]:hover:bg-[var(--filter-accent)] data-[state=on]:hover:text-[var(--filter-accent-foreground)] dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent shadow-xs hover:bg-muted",
      },
      size: {
        default:
          "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-10 min-w-10 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
