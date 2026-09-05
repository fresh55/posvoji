"use client";

import { useState, useSyncExternalStore } from "react";
import { PhotoGallery } from "@/components/photo-gallery";
import type { PermittedPhoto } from "@/lib/animal-images";
import { clampPhotoIndex, photoFromSearch } from "@/lib/animal-path";
import {
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToLocation,
} from "@/lib/location-search";

/**
 * The animal page's own gallery, opened on the photo a shared link names.
 *
 * A cold load of a link out of the share sheet renders this page rather than
 * the dialog on the index, so ?foto= has to be answered here too.
 *
 * The query is read through the filters' own store, whose server snapshot is
 * "": with static export the prerendered HTML has no query in it, so the
 * server and the first client render both draw the first photo, and the shared
 * one arrives with the client snapshot a beat later. Reading window.location
 * while rendering is what would make the two disagree.
 *
 * Stepping through the photos leaves the address alone, so the visitor's own
 * position is held as an override rather than written back: the same shape the
 * lightbox holds its view in, and what lets the parameter answer for as long
 * as nobody has said otherwise.
 */
export function AnimalPageGallery({
  images,
  name,
  sizes,
  className,
}: {
  /** Already resolved and already free of anything no surface may draw. */
  images: PermittedPhoto[];
  name?: string | null;
  sizes: string;
  className?: string;
}) {
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  // Null until the visitor steps a photo of their own.
  const [stepped, setStepped] = useState<number | null>(null);
  const asked = photoFromSearch(search);
  // Clamped rather than trusted, so a link that has outlived a photo opens the
  // animal it was written for.
  const named = clampPhotoIndex(asked, images.length);

  return (
    <PhotoGallery
      images={images}
      name={name}
      sizes={sizes}
      index={stepped ?? named}
      onIndexChange={setStepped}
      // No announceChanges: the only change from outside is the named photo
      // arriving with the client snapshot, a beat after the page appears, and
      // a live region firing at somebody who has just got here says nothing
      // they asked for. A visitor walking the gallery still turns the line on
      // through the gallery's own step.
      //
      // The page's own subject, above the fold, and the largest thing on it.
      eager
      // The one surface that asks for the top of the ladder anyway: a phone
      // gives it the full width, and a desktop gives it 31rem, which is 992px
      // on a 2x screen.
      avif
      className={className}
    />
  );
}
