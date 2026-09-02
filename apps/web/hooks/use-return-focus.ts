"use client";

import { useRef } from "react";

/**
 * Captures what was focused when a dialog opened and gives the focus back to
 * it on close.
 *
 * Radix hands the focus to the trigger the dialog was opened from. The portal
 * opens its dialogs in code, from a card or a header button, so there is no
 * trigger: without this the focus lands on <body> and the shelter is back at
 * the top of the page.
 */
export function useReturnFocus(): {
  /** Spread onto the DialogContent or AlertDialogContent. */
  props: {
    onOpenAutoFocus: () => void;
    onCloseAutoFocus: (event: Event) => void;
  };
  /** Forgets the captured control, for a close that unmounts it anyway. */
  release: () => void;
} {
  const captured = useRef<HTMLElement | null>(null);
  return {
    props: {
      onOpenAutoFocus: () => {
        captured.current = document.activeElement as HTMLElement | null;
      },
      onCloseAutoFocus: (event) => {
        event.preventDefault();
        captured.current?.focus();
        captured.current = null;
      },
    },
    release: () => {
      captured.current = null;
    },
  };
}
