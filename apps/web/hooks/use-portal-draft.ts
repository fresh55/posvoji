"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraft,
  draftDiff,
  readDraft,
  resumeDraft,
  writeDraft,
  type DraftSanitizer,
} from "@/lib/portal-drafts";

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
 *
 * Only the stored keys are laid over, and only after `sanitize` has checked
 * each one. Storage is not trusted: a key can hold anything, and a value of
 * the wrong type would reach a controlled input and throw out of the render
 * with nothing left to clear it. What survives and still differs from the
 * record is what `resumed` reports; a key that changes nothing is dropped on
 * mount so the list stops marking the animal.
 */
export function usePortalDraft<Draft extends object>(
  account: string,
  shelter: string,
  id: string,
  fromRecord: () => Draft,
  sanitize: DraftSanitizer<Draft>,
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
  const [initial] = useState(() => {
    const base = fromRecord();
    const stored = readDraft<unknown>(account, shelter, id);
    if (stored === null) return { draft: base, resumed: false, stale: false };
    const changes = resumeDraft(stored, base, sanitize);
    const resumed = Object.keys(changes).length > 0;
    return {
      draft: resumed ? { ...base, ...changes } : base,
      resumed,
      // The key held something, and nothing of it was worth keeping.
      stale: !resumed,
    };
  });
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [resumed, setResumed] = useState(initial.resumed);
  // The record can change under a mounted form: a status tapped in the
  // summary saves at once and hands the form a new record. Kept in a ref,
  // brought up to date after every render, so reset() rebuilds from the
  // record as it is now, not as it was on mount.
  const latest = useRef(fromRecord);
  useEffect(() => {
    latest.current = fromRecord;
  }, [fromRecord]);

  const clear = useCallback(
    () => clearDraft(account, shelter, id),
    [account, id, shelter],
  );

  // Storage is written after the render, never during it: the write notifies
  // the list's subscribers, and a state update from inside another
  // component's render is what React refuses.
  useEffect(() => {
    if (initial.stale) clear();
  }, [clear, initial.stale]);

  const reset = useCallback(() => {
    clear();
    setDraft(latest.current());
    setResumed(false);
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
 *
 * Only the keys that differ from the record are written, text compared
 * trimmed, and the key is dropped when none does even while the editor still
 * counts the form as work.
 */
export function usePortalDraftMirror<Draft extends object>(
  account: string,
  shelter: string,
  id: string,
  draft: Draft,
  unsaved: boolean,
  fromRecord: () => Draft,
): void {
  // A fresh closure every render; read through a ref so the mirror runs on a
  // change to the draft, not on every render of the page. Its own effect
  // comes first, so the mirror below always reads the closure of this render.
  const latest = useRef(fromRecord);
  useEffect(() => {
    latest.current = fromRecord;
  }, [fromRecord]);

  useEffect(() => {
    if (!unsaved) {
      clearDraft(account, shelter, id);
      return;
    }
    const kept = draftDiff(draft, latest.current());
    if (Object.keys(kept).length === 0) clearDraft(account, shelter, id);
    else writeDraft(account, shelter, id, kept);
  }, [account, draft, id, shelter, unsaved]);
}
