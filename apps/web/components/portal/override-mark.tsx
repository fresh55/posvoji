"use client";

import type * as React from "react";
import { Pencil, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, portalText } from "@/components/portal/portal-text";
import { cn } from "@/lib/utils";

/**
 * Marks a value the shelter has changed, so the crawled data and the shelter's
 * own edits never look the same. "pending" is an edit that is about to be
 * given back, once the form is saved.
 */
export function OverrideMark({
  pending = false,
  className,
  ...props
}: React.ComponentProps<"span"> & { pending?: boolean }) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl border px-1.5 text-[11px] font-medium",
        pending
          ? "border-border bg-muted text-muted-foreground"
          : "border-[var(--filter-accent-border)] bg-[var(--filter-accent)] text-[var(--filter-accent-foreground)]",
        className,
      )}
    >
      <Pencil className="size-2.5" aria-hidden />
      {pending ? portalText.willRevert : portalText.edited}
    </span>
  );
}

/** Gives one field back to the crawler. The save sends an explicit null. */
export function RevertButton({
  field,
  onRevert,
  disabled = false,
  className,
}: {
  /** Field name for the screen-reader label, e.g. "Ime". */
  field: string;
  onRevert: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onRevert}
      disabled={disabled}
      title={portalText.revertHint}
      aria-label={fill(portalText.revertField, { field })}
      className={cn(
        "h-6 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Undo2 aria-hidden />
      {portalText.revert}
    </Button>
  );
}
