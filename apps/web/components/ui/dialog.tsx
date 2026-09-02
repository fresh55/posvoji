"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

// The dim behind a dialog, and the panel that sits on it. Both are shared with
// alert-dialog.tsx, whose overlay and content are meant to be this same
// surface: written once so a change to max-h-[92dvh] or to the --gutter inset
// cannot land on one kind of dialog only.
//
// motion-reduce:animate-none looks like the obvious guard here and is the
// guard the rest of the codebase reaches for, but it does not actually win on
// these elements: data-open:/data-closed: and motion-reduce: compile to the
// same specificity in the same utilities layer, and the built stylesheet
// places the data-open:/data-closed: rules after the motion-reduce: ones, so
// on a tie the animation keeps its declaration. motion-reduce:duration-0
// sidesteps the fight instead of trying to win it: animate-in/animate-out read
// their duration from --tw-duration (see tw-animate-css's --animate-in), the
// same variable the plain duration-100 and duration-150 below set, and
// motion-reduce:duration-0 only has to outrank that bare, variant-less
// utility, which it reliably does.
// The animation still runs, just over zero time, so nothing visible moves and
// Radix's exit handling, which waits for the animation to finish, still sees it
// end.
export const DIALOG_OVERLAY =
  "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0"

// The margin is --gutter on each side, the same token the page padding uses.
// The dialog is centred, so a per-side inset would split across both edges and
// still leave the near edge under a notch; --gutter already takes the larger of
// the floor and either inset, which is what a centred box needs.
export const DIALOG_SURFACE =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-2*var(--gutter))] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-ui border bg-popover bg-clip-padding p-5 text-sm text-popover-foreground shadow-lg duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:duration-0"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(DIALOG_OVERLAY, className)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  closeLabel?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(DIALOG_SURFACE, className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-1 right-1 size-11 sm:top-3 sm:right-3 sm:size-8"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">{closeLabel}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading font-medium text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
}
