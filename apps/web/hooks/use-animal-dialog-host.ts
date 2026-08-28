"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnimalFields } from "@/lib/animal";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useAnimalDialog } from "@/hooks/use-animal-dialog";

// Everything a grid needs to host the animal dialog: which animal is open,
// where it grows from, what it steps through, and what a stale link does.
// useAnimalDialog owns the address; this owns what the grid does around it.
// Generic over the animal shape so the selected animal comes back as the same
// type the caller handed in, which is what the dialog is then given.
export function useAnimalDialogHost<T extends AnimalFields>({
  animals,
  shown,
  basePath,
}: {
  /** The list a path is resolved against, whole rather than filtered. */
  animals: T[];
  /** The list on screen, in the order shown. The dialog steps through it. */
  shown: T[];
  /** The list's own address, and where closing the dialog returns to. */
  basePath: string;
}) {
  // Remembered with the animal it belongs to, so a step through the list, a
  // close, or a forward-button reopen never grows out of a stale card.
  const [zoomFrom, setZoomFrom] = useState<
    { id: string; at: DialogOrigin } | undefined
  >();
  const { openId, open, swap, close } = useAnimalDialog({ animals, basePath });

  // Looked up in the whole list, not in what the filters leave: a shared link
  // has to open the animal it names even when this visitor's filters would
  // hide it.
  const selected = useMemo(
    () => animals.find((animal) => animal.id === openId),
    [animals, openId],
  );

  // A stale or hand-edited link points at nothing. That is a URL to clean up,
  // not an error to throw in front of the visitor.
  useEffect(() => {
    if (openId && !selected) close();
  }, [close, openId, selected]);

  const handleOpen = useCallback(
    (id: string, at?: DialogOrigin) => {
      setZoomFrom(at ? { id, at } : undefined);
      open(id);
    },
    [open],
  );

  const handleNavigate = useCallback((id: string) => swap(id), [swap]);

  const shownIds = useMemo(() => shown.map((animal) => animal.id), [shown]);

  // The zoom belongs to the card that was clicked, not to a step through the
  // list, so any other animal grows from the middle instead.
  const origin = zoomFrom?.id === openId ? zoomFrom.at : undefined;

  return { selected, origin, shownIds, handleOpen, handleNavigate, close };
}
