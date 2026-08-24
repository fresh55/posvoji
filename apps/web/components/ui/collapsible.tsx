"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn(
        // duration-[1ms] rather than the duration-0 the other animated slots
        // in ui/ take, and not motion-reduce:animate-none: see the comment on
        // DialogOverlay in ui/dialog.tsx for why the animate-none guard does
        // not take effect on a data-open:/data-closed: element. The 1ms is for
        // location-picker.tsx, which listens for animationend on the cell to
        // re-run its scroll-into-view once a panel has finished opening; a
        // duration nobody can see still fires that event, where removing the
        // animation would strand the handler.
        //
        // This reaches the animation because tw-animate-css writes both
        // --animate-collapsible-* entries as
        // `var(--tw-animation-duration, var(--tw-duration, .2s))`, and
        // duration-* sets --tw-duration. globals.css used to redeclare the two
        // entries with 0.2s baked into the shorthand, which is what put this
        // guard out of reach and cost the file a hand-written copy of the
        // keyframes as well.
        "overflow-hidden data-open:animate-collapsible-down data-closed:animate-collapsible-up motion-reduce:duration-[1ms]",
        className,
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger }
