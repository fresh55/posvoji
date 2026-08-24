import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// The surface four places in the site were spelling out by hand, each with the
// same five utilities and a different padding: shelter-card p-5,
// municipality-coverage-card p-4, resources-page p-5, portal-login p-6. Same
// shape, four copies, and nothing holding them together the next time the
// border or the shadow moves.
//
// Three of the four take it. portal-login's is a motion element whose step
// animates in, and a Slot between motion and its own ref is a trade the one
// shared border is not worth; it keeps the utilities spelled out, with this
// file as the place they are agreed.
//
// asChild, because those three are not all divs. One is the anchor that makes a
// whole shelter clickable, one is an <article>, one is a motion element that
// animates the login step in, and only one is a plain box. A card here is a
// surface rather than an element, so it lends its shape to whatever the
// content actually is — the same idiom ui/button.tsx already uses.
//
// Padding stays with the caller rather than coming from a CardHeader and
// CardContent pair. shadcn ships those to carry a title/description/footer
// rhythm, and none of these four has that rhythm: they are a shelter's
// details, a coverage answer, a page section and a login form. Giving them a
// header slot they would not fill is a bigger invention than the duplication
// it removes; the shape is the part they actually share.
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="card"
      className={cn(
        "rounded-ui border bg-card text-card-foreground shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

export { Card };
