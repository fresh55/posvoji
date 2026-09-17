import type { ComponentProps } from "react";
import { Button as SiteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Portal actions reserve their whole 44px touch target in layout, without
 *  tap-target overlays. Manipulation also keeps two-tap confirms responsive. */
export function Button({ className, ...props }: ComponentProps<typeof SiteButton>) {
  return (
    <SiteButton
      {...props}
      className={cn("touch-manipulation pointer-coarse:min-h-11 pointer-coarse:min-w-11", className)}
    />
  );
}
