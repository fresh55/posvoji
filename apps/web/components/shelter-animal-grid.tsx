"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PawPrint } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard } from "@/components/animal-card";
import {
  AnimalDialog,
  type DialogOrigin,
} from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { useAnimalDialog } from "@/hooks/use-animal-dialog";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "@/lib/sort";

// Same target-width grid as the home page's AnimalGrid, reproduced rather
// than imported: a shelter page needs the cards and the animal dialog, not
// the species tabs, filter sidebar or clear-filters trail that come with it.
const CARD_GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]";

export function ShelterAnimalGrid({
  animals,
  logoIds,
  emptyLabel,
  referenceDate,
  basePath,
}: {
  animals: Animal[];
  logoIds: string[];
  emptyLabel: string;
  /** When the dataset was built; ages are measured from it, not the clock. */
  referenceDate: string;
  /** This shelter's own page, where closing the dialog returns to. */
  basePath: string;
}) {
  const { locale } = useI18n();
  // Remembered with the animal it belongs to, so a step through the list, a
  // close, or a forward-button reopen never grows out of a stale card.
  const [zoomFrom, setZoomFrom] = useState<
    { id: string; at: DialogOrigin } | undefined
  >();
  const { openId, open, swap, close } = useAnimalDialog({ animals, basePath });

  // One Date per mount keeps ages stable across re-renders, same as the home
  // page grid.
  const now = useMemo(() => new Date(), []);
  const reference = useMemo(() => new Date(referenceDate), [referenceDate]);
  const sorted = useMemo(
    () => sortAnimals(animals, DEFAULT_ANIMAL_SORT, locale, now),
    [animals, locale, now],
  );
  const selected = useMemo(
    () => animals.find((animal) => animal.id === openId),
    [animals, openId],
  );

  // An id no animal on this page answers to is a URL to clean up, not an
  // error to throw in front of the visitor.
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

  // The dialog steps through this shelter's animals in the order shown.
  const shownIds = useMemo(() => sorted.map((animal) => animal.id), [sorted]);

  // The zoom belongs to the card that was clicked, not to a step through the
  // list, so any other animal grows from the middle instead.
  const origin = zoomFrom?.id === openId ? zoomFrom.at : undefined;

  const handleNavigate = useCallback((id: string) => swap(id), [swap]);

  if (animals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-ui border border-dashed py-16 text-center">
        <PawPrint
          className="size-8 text-muted-foreground/50"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <>
      <div className={CARD_GRID}>
        {sorted.map((animal) => (
          <AnimalCard
            key={animal.id}
            animal={animal}
            reference={reference}
            onOpen={handleOpen}
          />
        ))}
      </div>

      <AnimalDialog
        animal={selected}
        logoIds={logoIds}
        origin={origin}
        siblingIds={shownIds}
        reference={reference}
        onNavigate={handleNavigate}
        onClose={close}
      />
    </>
  );
}
