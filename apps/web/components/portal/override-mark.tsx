"use client";

import type * as React from "react";
import { Pencil, PencilLine, Search, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, portalText } from "@/components/portal/portal-text";
import { cn } from "@/lib/utils";

/**
 * The pill every mark beside a field label is drawn on: the edit mark, the
 * "nobody has answered this" mark and the listing card's status badge. Written
 * once so the four of them cannot drift to different heights.
 */
export const PORTAL_BADGE =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl border px-1.5 text-2xs font-medium";

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
        PORTAL_BADGE,
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

/**
 * A filter the adopter searches by that this animal still has no answer for.
 * It sits where OverrideMark sits and is built to the same scale, but says the
 * opposite thing: not "you changed this", "nobody has answered this yet".
 */
export function MissingMark() {
  return (
    <span
      className={cn(
        PORTAL_BADGE,
        "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
    >
      <Search className="size-2.5" aria-hidden />
      {portalText.missingBadge}
    </span>
  );
}

/**
 * An animal whose editor page holds typed work that was never saved. It sits
 * where OverrideMark sits, on the same pill, and says the third thing the
 * pair does not: not "you changed this" and not "nobody has answered this",
 * but "you started this and it is still only in this browser".
 */
export function DraftMark({ className }: { className?: string }) {
  return (
    <span
      title={portalText.draftBadgeHint}
      className={cn(
        PORTAL_BADGE,
        "border-dashed border-foreground/40 text-muted-foreground",
        className,
      )}
    >
      <PencilLine className="size-2.5" aria-hidden />
      {portalText.draftBadge}
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
        "h-6 gap-1 px-1.5 text-2xs font-normal text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Undo2 aria-hidden />
      {portalText.revert}
    </Button>
  );
}
