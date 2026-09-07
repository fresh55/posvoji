import {
  ACCEPTED_PHOTO_TYPES,
  type PendingPhoto,
} from "@/components/portal/listing-photo-rules";

import { fill, portalText } from "@/components/portal/portal-text";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { PortalListingActions } from "./use-portal-listings";

/** The same cap as PORTAL_MAX_UPLOAD_BYTES in apps/portal. */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Owns pending files, retries and the lifetime of every preview URL. */
export function useListingPhotos({
  listingId,
  actions,
  startSave,
}: {
  listingId: string | undefined;
  actions: Pick<PortalListingActions, "uploadPhoto" | "deletePhoto">;
  startSave: () => void;
}) {
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState<{
    index: number;
    total: number;
  } | null>(null);
  /** The sentence beside the photos: a refused file, a failed remove. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** The stored photo whose Odstrani is waiting for its second tap. */
  const [removing, setRemoving] = useState<number | null>(null);
  // Every preview URL still outstanding. Object URLs are not garbage
  // collected, so each is revoked when its file is stored or dropped, and
  // whatever is left when the page unmounts.
  const previews = useRef(new Set<string>());
  const nextKey = useRef(0);

  // Handed back outside React, because that is how they were handed over.
  useEffect(() => {
    const held = previews.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  /** Takes the preview of a file that is stored or dropped back from the browser. */
  function releasePreview(item: PendingPhoto) {
    URL.revokeObjectURL(item.previewUrl);
    previews.current.delete(item.previewUrl);
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
      setUploading({ index: index + 1, total: items.length });
      const photo = await actions.uploadPhoto(listingId, item.file);
      if (photo) {
        releasePreview(item);
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
    setUploading(null);
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
      const key = nextKey.current++;
      const previewUrl = URL.createObjectURL(file);
      previews.current.add(previewUrl);
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
    releasePreview(item);
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
  };
}
