"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The question the portal asks before something is thrown away: dropping
 * typed work, taking a listing off the site.
 *
 * An alert dialog and not a second Dialog: it asks a question with a
 * destructive answer, so it is announced as one, it cannot be dismissed by a
 * stray tap outside, and Radix opens it focused on the cancel. It is nested
 * inside the dialog it asks about, on purpose, so what the shelter is deciding
 * about stays behind it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  lead,
  keepLabel,
  confirmLabel,
  onConfirm,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lead: string;
  /** The safe answer. */
  keepLabel: string;
  /** The destructive one. */
  confirmLabel: string;
  onConfirm: () => void;
  /** useReturnFocus's pair: the caller owns where the focus goes back to. */
  onOpenAutoFocus: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-sm"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          <AlertDialogDescription>{lead}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Reversed, so the safe answer is both the rightmost button and the
            one the dialog opens focused on. */}
        <div className="flex flex-row-reverse gap-2">
          <AlertDialogCancel variant="default">{keepLabel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
