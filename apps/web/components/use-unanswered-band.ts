import type { ClientAnimal } from "@/lib/animal";
import { unansweredBand, type Filters } from "@/lib/filters";
import type { LatLon } from "@/lib/geo";
import type { Locale } from "@/lib/i18n";
import { sortAnimals, type AnimalSort } from "@/lib/sort";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NONE: ClientAnimal[] = [];
const unranked = (list: ClientAnimal[]) => list;

/**
 * The home grid's band: the animals the filters hide only for want of an
 * answer (unansweredBand in lib/filters), offered after the matches and drawn
 * under them once the visitor asks.
 *
 * Whether it is shown is the grid's for the visit and not the address's. It
 * stays shown across filter changes for as long as there is a band, and
 * closes when a change leaves none, which "Počisti vse" always does, so the
 * next band a pick makes is offered again rather than drawn unasked.
 */
export function useUnansweredBand({
  animals,
  filters,
  reference,
  sorted,
  sort,
  locale,
  origin,
  rank = unranked,
}: {
  animals: ClientAnimal[];
  /** The filters the matches were drawn with, the deferred ones. */
  filters: Filters;
  reference: Date;
  /** The matches, in the order the grid shows them. */
  sorted: ClientAnimal[];
  sort: AnimalSort;
  locale: Locale;
  origin?: LatLon;
  /** The search's own order over the sorted list (useAnimalSearch), which the
   *  band keeps the way the matches do: what a query found by name first. */
  rank?: (list: ClientAnimal[]) => ClientAnimal[];
}) {
  const band = useMemo(
    () => unansweredBand(animals, filters, reference),
    [animals, filters, reference],
  );
  const [open, setOpen] = useState(false);
  // Adjusted while rendering, as AnimalGrid adjusts its arrival: from an
  // effect, the render in between would draw a band that is already gone.
  if (open && band.animals.length === 0) setOpen(false);
  const shown = open && band.animals.length > 0;

  // In the order chosen for the matches, which the band follows under them.
  const bandSorted = useMemo(
    () =>
      shown
        ? rank(sortAnimals(band.animals, sort, locale, reference, origin))
        : NONE,
    [band.animals, locale, origin, rank, reference, shown, sort],
  );
  // What the grid draws and the dialog steps through.
  const list = useMemo(
    () => (bandSorted.length > 0 ? [...sorted, ...bandSorted] : sorted),
    [bandSorted, sorted],
  );

  // The button that offers the band, on the line under the matches or in the
  // empty state, whichever is drawn. Hiding the band hands focus back to it,
  // since the hide button goes with the band. A ref and an effect, the way the
  // grid hands focus to the first card a press adds (use-incremental-grid.ts).
  const offerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (shown || !returnFocus.current) return;
    returnFocus.current = false;
    offerRef.current?.focus();
  }, [shown]);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    returnFocus.current = true;
    setOpen(false);
  }, []);

  return {
    /** How many animals the band holds, shown or not. */
    count: band.animals.length,
    missing: band.missing,
    shown,
    list,
    show,
    hide,
    offerRef,
  };
}
