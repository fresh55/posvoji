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

// How the three slots are stacked, and it is opt-in: an item is a flex column
// unless a caller asks for the other one, because subgrid is a contract with a
// parent grid and most callers have no such parent.
const ITEM_LAYOUTS = {
  /** A flex column. Each slot is as tall as its own contents. */
  stack: "flex flex-col gap-4",
  /**
   * The item's slots take their heights from the grid row it sits in, so a row
   * of items lines up section by section: media against media, title against
   * title, footer against footer.
   *
   * The contract with the parent, and it is the caller's job to keep it: the
   * parent is a grid whose implicit rows are auto (the default), and every
   * cell in it spans three of them. An item that skips a slot still spans
   * three, and the missing one is an empty track rather than a shifted one,
   * which is the whole point.
   *
   * gap rather than nothing, so a browser without subgrid support has a
   * spacing to fall back on: grid-template-rows: subgrid is dropped as invalid
   * there, the item becomes an ordinary three-row grid, and it draws what the
   * stack layout draws. Alignment across the row is what is lost, which is
   * where this page stood before subgrid.
   *
   * The footer's mt-auto is undone here rather than at each call site. In a
   * flex column it pushes the footer to the bottom edge; against a subgrid
   * track it pushes the footer to the bottom of a track that is already the
   * height of the tallest footer in the row, which staggers exactly the rows
   * this layout exists to line up. An auto margin in the block axis also beats
   * align-self, so zeroing it is the only way to start-align the slot.
   *
   * min-w-0 on every slot, for the same reason and in the same place. A slot
   * here is a grid item, so its automatic minimum is its own min-content: one
   * unbreakable string anywhere inside it (a long email in the footer, a mark
   * beside a count in the media row) sizes the track, the track sizes the
   * column, and the card grows past the card instead of the contents giving
   * way. Any truncate a caller put on the text stays inert until this is set.
   *
   * It belongs to the layout rather than to the slots. The property is the
   * same on all of them and the reason is the same, so writing it per slot
   * meant four declarations and three copies of this paragraph, and the two
   * slots this file leaves unshipped (ItemGroup, ItemHeader, ItemActions, see
   * the header) would each have reopened the hole on the day they landed. The
   * hole is invisible at normal text size, which is how it survived this long.
   */
  subgrid:
    "grid grid-rows-subgrid row-span-3 gap-4 [&>*]:min-w-0 [&>[data-slot=item-footer]]:mt-0",
} as const;

function Item({
  className,
  variant = "default",
  layout = "stack",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: keyof typeof ITEM_VARIANTS;
  layout?: keyof typeof ITEM_LAYOUTS;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="item"
      data-variant={variant}
      className={cn(
        "min-w-0 p-5",
        ITEM_LAYOUTS[layout],
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
 *
 * shrink-0 is the stack case, where the media keeps its width beside a text
 * column that would otherwise squeeze it. It says nothing in the subgrid
 * layout, because a grid item does not flex; the min-w-0 that case needs is
 * on the layout itself, in ITEM_LAYOUTS.
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
 * mt-auto is right for a footer of controls: a row of items drawn in stretched
 * grid cells puts its buttons on one line at the bottom instead of floating
 * wherever the content above them happened to end.
 *
 * It is wrong for a footer of printed rows, which wants to start where the
 * row's footer track starts. The subgrid layout zeroes it for that reason, and
 * this stays the default.
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
