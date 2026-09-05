"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { MotionValue } from "motion/react";
import { ShareButton } from "@/components/animal-dialog/share-button";

/**
 * The dialog's share sheet, reading the photo on show out of the fan's own
 * store.
 *
 * Which photo is in front used to be dialog state, so every step re-rendered
 * the whole dialog to change a query parameter nobody had asked to see yet.
 * The fan writes the number into a motion value instead and this subscribes to
 * it, which makes this wrapper the only thing a step re-renders. ShareButton
 * itself is untouched: the animal page hands it a plain number.
 */
export function DialogShareButton({
  path,
  name,
  photo,
}: {
  path: string;
  name: string;
  /** Where the fan reports the photo on show, counted from zero. */
  photo: MotionValue<number>;
}) {
  const shown = useSyncExternalStore(
    useCallback((notify: () => void) => photo.on("change", notify), [photo]),
    () => photo.get(),
    // Nothing is open on the server, so there is no photo to name.
    () => 0,
  );

  return <ShareButton path={path} name={name} photo={shown} />;
}
