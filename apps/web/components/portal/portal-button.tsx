import type { ComponentProps } from "react";
import { Button as SiteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Portal actions use the same 44px touch floor as its fields and choices. */
export function Button({ className, ...props }: ComponentProps<typeof SiteButton>) {
  return (
    <SiteButton
      {...props}
      className={cn("pointer-coarse:min-h-11 pointer-coarse:min-w-11", className)}
    />
  );
}
