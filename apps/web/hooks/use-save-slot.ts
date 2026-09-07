"use client";

import { useEffect, useState, type RefObject } from "react";
import type { PortalSaveState } from "@/hooks/portal-list";

type SaveFailure = Extract<PortalSaveState, { status: "error" }>;

/**
 * The one save slot an editor page shares with the list it came from, read as
 * "what this page has to say, and beside which control".
 *
 * The slot is one per record and an error in it never expires, which is what
 * the card needs: the shelter has to be able to look away and still find out
 * that the tap did not take. Arriving on the page is not that attempt, so the
 * failure the page opens on starts out dismissed and stays out of the form.
 * Every save produces a new state object, so identity is enough to tell the
 * failures apart.
 *
 * `Origin` names the controls besides "form" that can start a save: the status
 * buttons on both pages, and the archive and the photo grid on a listing.
 */
export function useSaveSlot<Origin extends string = never>(
  saveState: PortalSaveState,
  /** The line in the save bar, which takes the focus for a failed Shrani. */
  errorLine: RefObject<HTMLParagraphElement | null>,
): {
  /** The failed save this page's own Shrani is answering for. */
  formFailure: SaveFailure | null;
  /** The same, for a save some other control on the page started. */
  failureFrom: (from: Origin) => SaveFailure | null;
  /** A new save replaces whatever the slot said about the last one. */
  startSave: (from: "form" | Origin) => void;
  /** The failed save has been answered: the shelter changed something. */
  touched: () => void;
} {
  const [dismissed, setDismissed] = useState<PortalSaveState | null>(
    saveState.status === "error" ? saveState : null,
  );
  // Which control started the save the slot is reporting on. Each failure has
  // to be said next to the control that was pressed.
  const [origin, setOrigin] = useState<"form" | Origin>("form");

  const failed =
    saveState.status === "error" && saveState !== dismissed ? saveState : null;
  const formFailure = failed && origin === "form" ? failed : null;

  // A failed Shrani is said in the bar, which is on screen wherever the
  // shelter pressed from; the focus follows so a keyboard user lands on the
  // reason and a screen reader has it announced from where they are. Every
  // failure is a new state object, so this runs once per failure.
  useEffect(() => {
    if (!formFailure) return;
    const line = errorLine.current;
    if (!line) return;
    line.scrollIntoView({ block: "nearest" });
    line.focus({ preventScroll: true });
  }, [errorLine, formFailure]);

  function failureFrom(from: Origin): SaveFailure | null {
    return failed && origin === from ? failed : null;
  }

  function startSave(from: "form" | Origin) {
    setOrigin(from);
    if (failed) setDismissed(failed);
  }

  function touched() {
    if (formFailure) setDismissed(formFailure);
  }

  return { formFailure, failureFrom, startSave, touched };
}
