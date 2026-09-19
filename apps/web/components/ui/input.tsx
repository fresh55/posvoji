import * as React from "react"

import { cn } from "@/lib/utils"

// h-9 is 36px, which is a mouse's field. A coarse pointer gets 44 instead:
// the portal's login and its editor forms are filled in on phones, and the
// field is the thing being aimed at. On the pointer and not on a width, so a
// touch tablet past lg is served too. A call site that sets its own height
// (the share popover's link field at h-8) still loses to this on coarse,
// which is the intent: the field is tapped there as well.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 pointer-coarse:h-11 w-full min-w-0 rounded-ui border border-control-border bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
