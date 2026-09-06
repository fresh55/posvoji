"use client";

import { useCallback, useEffect, useState } from "react";
import { clearDraft, readDraft, writeDraft } from "@/lib/portal-drafts";

/**
 * The typed half of an editor page, mirrored to this tab's storage.
 *
 * Both editors keep the same policy, so it is written once: read what the tab
 * still holds when the form mounts, lay it over a draft built from the saved
 * record, and say so above the form; mirror every change while there is work
 * to keep; drop the key on a save, on a discard, and the moment the form is
 * back to what the record says.
 *
 * The read happens once, in the initialiser. The page renders on the client
 * only (the build prerenders the Suspense fallback and nothing below it), so
 * there is no server pass for this to disagree with. What comes back is laid
 * over a fresh draft rather than used as it is, because a deploy can change
 * the shape of a draft while a tab is still open on the old one, and a missing
 * key would turn its box into an uncontrolled input halfway through the form.
 */
export function usePortalDraft<Draft extends object>(
  account: string,
  shelter: string,
  id: string,
  fromRecord: () => Draft,
): {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  /** Whether the form the shelter is looking at came out of storage. */
  resumed: boolean;
  /** Back to the saved record, forgetting what was typed before. */
  reset: () => void;
  /** The work is saved or given up: the key has nothing left to hold. */
  clear: () => void;
} {
  const [stored] = useState(() => {
    const kept = readDraft<Partial<Draft>>(account, shelter, id);
    return kept ? { ...fromRecord(), ...kept } : null;
  });
  const [draft, setDraft] = useState<Draft>(() => stored ?? fromRecord());
  const [resumed, setResumed] = useState(stored !== null);

  const clear = useCallback(
    () => clearDraft(account, shelter, id),
    [account, id, shelter],
  );

  const reset = useCallback(() => {
    clear();
    setDraft(fromRecord());
    setResumed(false);
    // fromRecord closes over the record this form is editing, which cannot
    // change under a mounted form: the page keys the form by the record's id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clear]);

  return { draft, setDraft, resumed, reset, clear };
}

/**
 * Mirrors the draft while there is work to keep, so a Back, a Forward and a
 * reload all come back to the same typed words.
 *
 * Only while there is work: a form nobody has touched must not leave a key
 * behind, or the list would mark every animal that was ever opened. Called
 * apart from the hook above because what counts as work is the one thing the
 * two editors do not agree on, and each can only say it once it has read its
 * own draft.
 */
export function usePortalDraftMirror(
  account: string,
  shelter: string,
  id: string,
  draft: unknown,
  unsaved: boolean,
): void {
  useEffect(() => {
    if (unsaved) writeDraft(account, shelter, id, draft);
    else clearDraft(account, shelter, id);
  }, [account, draft, id, shelter, unsaved]);
}
