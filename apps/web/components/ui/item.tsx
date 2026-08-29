import * as React from "react";
import { Slot } from "radix-ui";

import { CARD_SURFACE } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// shadcn's Item: media, then a title and its description, then whatever the
// row acts with. It is the shape a directory entry already has, so spelling it
// out here stops each caller inventing its own flex stack and drifting.
//
// Only the parts this site uses are here. ItemGroup, ItemHeader and
// ItemActions are in the upstream anatomy and are left out until something
// needs them, rather than shipped unused: the register's cards carry media, a
// title, a description and a footer of contacts, and nothing acts from the
// end of the row.
//
// asChild throughout, because these are surfaces rather than elements. A card
// in the register is an <li>, its title wraps an <a>, and the same idiom
// ui/card.tsx and ui/button.tsx already use lets them be that without a
// wrapper div in between.

// Two variants, and the drawn one borrows its surface rather than restating
// it. The same rule this file's header applies to the upstream anatomy: ship
// what a caller uses. A "muted" variant was here for a while with no consumer,
// which meant an invented token nobody had looked at in either theme.
const ITEM_VARIANTS = {
  /** No ground of its own. For an item inside a surface that already has one. */
  default: "",
  /** The bordered card, on ui/card.tsx's surface so the two cannot drift. */
  outline: CARD_SURFACE,
} as const;

function Item({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: keyof typeof ITEM_VARIANTS;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      className={cn(
        "flex min-w-0 flex-col gap-4 p-5",
        ITEM_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/**
 * The item's picture.
 *
 * shrink-0 and nothing else: the media decides its own dimensions, because
 * what goes here varies (a fixed avatar track, an icon, a photo) and a size
 * asserted by the slot would be a size every caller has to undo.
 */
function ItemMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-media"
      className={cn("flex shrink-0 items-center", className)}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      // min-w-0, or a long unbroken name sets the width of the column the item
      // sits in and the grid track grows to fit it.
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function ItemTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="item-title"
      className={cn("text-balance font-medium leading-snug", className)}
      {...props}
    />
  );
}

// No truncate here: a caller that lays its description out as a flex row (an
// icon beside the text) makes the rule inert on this element and has to put it
// on the text itself anyway, so the primitive claiming it only misleads.
function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * What sits under the description, pushed to the bottom of the item.
 *
 * mt-auto is what makes a row of items agree: a shelter with one contact
 * channel and one with three draw the same height inside a stretched grid
 * cell, and the footers line up across the row instead of floating wherever
 * the content above them happened to end.
 */
function ItemFooter({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="item-footer"
      className={cn("mt-auto flex flex-col", className)}
      {...props}
    />
  );
}

export { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemFooter };
