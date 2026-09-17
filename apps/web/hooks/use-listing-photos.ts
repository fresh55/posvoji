import {
  ACCEPTED_PHOTO_TYPES,
  type PendingPhoto,
} from "@/components/portal/listing-photo-rules";

import { fill, portalText } from "@/components/portal/portal-text";
import { useCallback, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import type { PortalListingActions } from "./use-portal-listings";
import {
  clearPhotoDraft,
  movePhotoDraft,
  nextPhotoDraftKey,
  readPhotoDraft,
  readPhotoUpload,
  setPhotoUpload,
  subscribePhotoDrafts,
  updatePhotoDraft,
  type PhotoDraftScope,
} from "./portal-photo-drafts";

/** The same cap as PORTAL_MAX_UPLOAD_BYTES in apps/portal. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Owns pending files, retries and the lifetime of every preview URL. */
export function useListingPhotos({
  scope,
  listingId,
  actions,
  startSave,
}: {
  scope: PhotoDraftScope;
  listingId: string | undefined;
  actions: Pick<PortalListingActions, "uploadPhoto" | "deletePhoto">;
  startSave: () => void;
}) {
  const scopeRef = useRef(scope);
  const snapshot = useCallback(() => readPhotoDraft(scopeRef.current), []);
  const pending = useSyncExternalStore(subscribePhotoDrafts, snapshot, snapshot);
  const setPending = (update: (files: PendingPhoto[]) => PendingPhoto[]) =>
    updatePhotoDraft(scopeRef.current, update);
  const uploadSnapshot = useCallback(() => readPhotoUpload(scopeRef.current), []);
  const uploading = useSyncExternalStore(subscribePhotoDrafts, uploadSnapshot, uploadSnapshot);
  /** The sentence beside the photos: a refused file, a failed remove. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** The stored photo whose Odstrani is waiting for its second tap. */
  const [removing, setRemoving] = useState<number | null>(null);
  // The queue owns object URLs until save, explicit discard or sign-out.
  // Unmounting during Back is not a discard.
  function discardPending() {
    clearPhotoDraft(scopeRef.current);
  }

  function transferPending(id: string) {
    const previous = scopeRef.current;
    scopeRef.current = { ...previous, id };
    movePhotoDraft(previous, id);
  }

  /**
   * Stores `items` one after another, saying which one is going up. A file
   * that fails stays pending, marked, with its retry; the rest still go.
   * Answers whether any failed.
   */
  async function uploadFiles(
    listingId: string,
    items: PendingPhoto[],
  ): Promise<boolean> {
    // Every upload writes the listing's slot; from here its failures are the
    // grid's to say.
    startSave();
    let failed = false;
    for (const [index, item] of items.entries()) {
      // A sign-out or explicit discard may happen during the previous
      // request. Do not start another upload for work that was given up.
      if (!readPhotoDraft(scopeRef.current).some((file) => file.key === item.key)) {
        failed = true;
        continue;
      }
      setPhotoUpload(scopeRef.current, { index: index + 1, total: items.length });
      const photo = await actions.uploadPhoto(listingId, item.file);
      if (photo) {
        setPending((current) =>
          current.filter((candidate) => candidate.key !== item.key),
        );
      } else {
        failed = true;
        setPending((current) =>
          current.map((candidate) =>
            candidate.key === item.key
              ? { ...candidate, failed: true }
              : candidate,
          ),
        );
      }
    }
    setPhotoUpload(scopeRef.current, null);
    return failed;
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // So the same file can be picked again after it was dropped.
    event.target.value = "";
    setPhotoError(null);
    setRemoving(null);

    const accepted: PendingPhoto[] = [];
    let rejected: string | null = null;
    for (const file of files) {
      if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) {
        rejected ??= fill(portalText.photoTypeRejected, { name: file.name });
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        rejected ??= fill(portalText.photoTooLarge, { name: file.name });
        continue;
      }
      const key = nextPhotoDraftKey();
      const previewUrl = URL.createObjectURL(file);
      accepted.push({ key, file, previewUrl, failed: false });
    }
    if (rejected) setPhotoError(rejected);
    if (accepted.length === 0) return;

    setPending((current) => [...current, ...accepted]);
    // An existing listing has a photo route; a new one gets its id from the
    // save, and the files wait for that.
    if (listingId) void uploadFiles(listingId, accepted);
  }

  function retry(item: PendingPhoto) {
    if (!listingId) return;
    const again = { ...item, failed: false };
    setPending((current) =>
      current.map((candidate) =>
        candidate.key === item.key ? again : candidate,
      ),
    );
    void uploadFiles(listingId, [again]);
  }

  function dropPending(item: PendingPhoto) {
    setPending((current) =>
      current.filter((candidate) => candidate.key !== item.key),
    );
  }

  async function removePhoto(photoId: number) {
    if (!listingId) return;
    if (removing !== photoId) {
      setRemoving(photoId);
      return;
    }
    setRemoving(null);
    setPhotoError(null);
    startSave();
    if (!(await actions.deletePhoto(listingId, photoId))) {
      setPhotoError(portalText.photoRemoveError);
    }
  }

  return {
    pending,
    uploading,
    photoError,
    removing,
    uploadFiles,
    pickFiles,
    retry,
    dropPending,
    removePhoto,
    discardPending,
    transferPending,
  };
}
