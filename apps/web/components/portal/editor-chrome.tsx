"use client";

import { ChevronRight, LoaderCircle, RotateCcw, Undo2 } from "lucide-react";
import Link from "next/link";
import { portalText } from "@/components/portal/portal-text";
import { Button } from "@/components/ui/button";
import { PORTAL_PATH } from "@/hooks/use-portal-session";

// The frame both editor pages draw around their form. A crawled animal and a
// manual listing are edited on the same page, so the way back to the list, the
// bar that saves, and the line about work that was left behind are one copy
// each: a shelter that learns them on one kind must not meet a different
// arrangement on the other.

/** Where the shelter is, and the way back to the list. */
export function EditorBreadcrumb({
  name,
  blocked,
  onBlocked,
}: {
  /** The animal being edited, which is where this trail ends. */
  name: string;
  /** Whether leaving would drop typed work that has not been asked about. */
  blocked: boolean;
  onBlocked: () => void;
}) {
  return (
    <nav
      aria-label={portalText.breadcrumbLabel}
      className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
    >
      <Link
        href={PORTAL_PATH}
        onClick={(event) => {
          // The link is a real one, so Back, a middle click and a long press
          // all behave. It is only held back when there is work the shelter
          // has not been asked about yet.
          if (blocked) {
            event.preventDefault();
            onBlocked();
          }
        }}
        className="rounded-ui underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        {portalText.animalsTitle}
      </Link>
      <ChevronRight className="size-3.5 shrink-0" aria-hidden />
      <span aria-current="page" className="min-w-0 truncate text-foreground">
        {name}
      </span>
    </nav>
  );
}

/**
 * One bar, in two places. Beside the form on a wide screen, where the summary
 * is sticky and it rides along; pinned to the bottom of the window below that,
 * where the summary is at the top of a page the shelter has scrolled away
 * from.
 *
 * The bottom padding carries the phone's home indicator, and each page's own
 * max-lg:pb-28 keeps the last row clear of the bar.
 */
export function EditorSaveBar({
  saving,
  cancelDisabled,
  saveDisabled,
  onCancel,
}: {
  /** Drawn on the submit button, which is not the same as "anything is busy". */
  saving: boolean;
  cancelDisabled: boolean;
  saveDisabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:bg-background max-lg:px-gutter max-lg:pt-3 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] lg:pt-2">
      <Button
        type="button"
        variant="ghost"
        disabled={cancelDisabled}
        onClick={onCancel}
      >
        {portalText.cancel}
      </Button>
      <Button type="submit" disabled={saveDisabled} className="flex-1">
        {saving && <LoaderCircle className="animate-spin" aria-hidden />}
        {saving ? portalText.saving : portalText.save}
      </Button>
    </div>
  );
}

/**
 * Above the rows it is about, and quiet: the shelter came back to a form that
 * is not the record's saved state, and nothing else on the page would say why.
 */
export function DraftResumedLine({
  disabled,
  onDiscard,
}: {
  disabled: boolean;
  onDiscard: () => void;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <RotateCcw className="size-3.5 shrink-0" aria-hidden />
      {portalText.draftResumed}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={disabled}
        aria-label={portalText.draftDiscardLabel}
        onClick={onDiscard}
        className="h-6 gap-1 px-1.5 text-2xs font-normal text-muted-foreground max-lg:tap-target hover:text-foreground"
      >
        <Undo2 aria-hidden />
        {portalText.draftDiscard}
      </Button>
    </p>
  );
}
