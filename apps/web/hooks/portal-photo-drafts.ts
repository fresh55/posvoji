import type { PendingPhoto } from "@/components/portal/listing-photo-rules";

export type PhotoDraftScope = { account: string; shelter: string; id: string };
export type PhotoUploadProgress = { index: number; total: number } | null;

// Files stay in this tab's memory, scoped exactly like its typed drafts. A
// client-side Back must not discard them when the editor unmounts. Reloads
// and links leaving this document need the browser's leave warning instead:
// sessionStorage cannot hold Files, and persisting them beyond the tab would
// change the portal's draft/privacy policy.
const drafts = new Map<string, { scope: PhotoDraftScope; files: PendingPhoto[]; uploading: PhotoUploadProgress }>();
const listeners = new Set<() => void>();
const EMPTY: PendingPhoto[] = [];
let nextKey = 0;

function key(scope: PhotoDraftScope): string {
  return JSON.stringify([scope.account, scope.shelter, scope.id]);
}

function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function changed() {
  if (typeof window !== "undefined") {
    // One listener for the entire tab, including after Back to the list.
    window.removeEventListener("beforeunload", beforeUnload);
    if (drafts.size > 0) window.addEventListener("beforeunload", beforeUnload);
  }
  for (const listener of listeners) listener();
}

export function subscribePhotoDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readPhotoDraft(scope: PhotoDraftScope): PendingPhoto[] {
  return drafts.get(key(scope))?.files ?? EMPTY;
}

export function readPhotoUpload(scope: PhotoDraftScope): PhotoUploadProgress {
  return drafts.get(key(scope))?.uploading ?? null;
}

export function setPhotoUpload(scope: PhotoDraftScope, uploading: PhotoUploadProgress): void {
  const draft = drafts.get(key(scope));
  if (!draft) return; // A late upload result must not resurrect a discarded queue.
  drafts.set(key(scope), { ...draft, uploading });
  changed();
}

export function updatePhotoDraft(
  scope: PhotoDraftScope,
  update: (files: PendingPhoto[]) => PendingPhoto[],
): void {
  const previous = readPhotoDraft(scope);
  const files = update(previous);
  for (const item of previous) {
    if (!files.some((kept) => kept.key === item.key)) URL.revokeObjectURL(item.previewUrl);
  }
  if (files.length > 0) drafts.set(key(scope), { scope, files, uploading: readPhotoUpload(scope) });
  else drafts.delete(key(scope));
  changed();
}

export function nextPhotoDraftKey(): number {
  return nextKey++;
}

/** Move a new listing's queue to the ID returned by its first save. */
export function movePhotoDraft(from: PhotoDraftScope, id: string): PhotoDraftScope {
  const to = { ...from, id };
  if (id === from.id) return to;
  const draft = drafts.get(key(from));
  drafts.delete(key(from));
  if (draft) drafts.set(key(to), { ...draft, scope: to });
  changed();
  return to;
}

export function clearPhotoDraft(scope: PhotoDraftScope): void {
  updatePhotoDraft(scope, () => []);
}

export function clearAccountPhotoDrafts(account: string): void {
  for (const { scope } of [...drafts.values()]) {
    if (scope.account === account) clearPhotoDraft(scope);
  }
}

export function photoDraftIds(account: string, shelter: string): string[] {
  return [...drafts.values()]
    .filter(({ scope }) => scope.account === account && scope.shelter === shelter)
    .map(({ scope }) => scope.id);
}
