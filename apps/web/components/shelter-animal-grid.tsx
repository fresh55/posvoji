"use client";

import { useCallback, useMemo, useState } from "react";
import { PawPrint } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import { AnimalCard } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { SpeciesTabs } from "@/components/filters/species-tabs";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import { CARD_GRID } from "@/lib/card-grid";
import { bySpecies, speciesCounts, type SpeciesFilter } from "@/lib/filters";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "@/lib/sort";
import type { ShelterLogos } from "@/lib/shelter-logos";

// Same numbers, same reasoning as the home grid's own (animal-grid.tsx): a
// shelter page is not paginated, so its busiest page (Mačja hiša, 186
// animals) used to mount every one of them at once. Kept as local constants
// rather than imported from animal-grid.tsx: only INITIAL_CARDS is exported
// there, and duplicating three small numbers here is cheaper than widening
// that module's exports for a page it does not otherwise share code with.
const INITIAL_CARDS = 60;
const CARDS_PER_STEP = 60;
const STEP_MARGIN = "1200px 0px";

// The cards, the grid and the dialog wiring are the home page's; the filter
// sidebar and clear-filters trail that come with AnimalGrid are not what a
// shelter page asks for. The species tabs are the one piece of that panel
// still worth having here: a shelter with both dogs and cats otherwise has
// no way to ask for just one, on a page that can run to hundreds of cards.
export function ShelterAnimalGrid({
  animals,
  logos,
  emptyLabel,
  referenceDate,
  basePath,
}: {
  animals: Animal[];
  logos: ShelterLogos;
  emptyLabel: string;
  /** When the dataset was built; ages are measured from it, not the clock. */
  referenceDate: string;
  /** This shelter's own page, where closing the dialog returns to. */
  basePath: string;
}) {
  const { locale } = useI18n();
  const [species, setSpecies] = useState<SpeciesFilter>("all");

  // The dataset's own date and not the clock, same as the home page grid: the
  // order and the ages printed on the cards in it have to be read off the same
  // day, and prerendered HTML has no access to the visitor's.
  const reference = useMemo(() => new Date(referenceDate), [referenceDate]);

  // No other facet lives on this page, so what pressing a tab gives you and
  // what exists for it are the one number: the roster the strip needs to
  // decide which tabs exist doubles as the count each one shows.
  const roster = useMemo(() => speciesCounts(animals), [animals]);
  const distinctSpecies = [roster.dog, roster.cat, roster.other].filter(
    (count) => count > 0,
  ).length;
  // One species asks nothing a tab could answer, so the strip stays off a
  // single-species shelter rather than offering a "Vse"/"Psi" pair that
  // always agree.
  const showSpeciesTabs = distinctSpecies >= 2;

  const filtered = useMemo(
    () => bySpecies(animals, species),
    [animals, species],
  );
  const sorted = useMemo(
    () => sortAnimals(filtered, DEFAULT_ANIMAL_SORT, locale, reference),
    [filtered, locale, reference],
  );

  // How much of that list is on the page. The count is held together with the
  // list it was counted against, so a species change hands down a different
  // array, the count stops applying, and the grid is read from its top again.
  const [chunk, setChunk] = useState<{ of: Animal[]; drawn: number }>({
    of: sorted,
    drawn: INITIAL_CARDS,
  });
  const drawn = chunk.of === sorted ? chunk.drawn : INITIAL_CARDS;
  const page = useMemo(() => sorted.slice(0, drawn), [sorted, drawn]);
  const hasMore = drawn < sorted.length;

  const watchSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // jsdom, and anything else with no observer, gets the whole list rather
      // than a grid with no way to grow.
      if (typeof IntersectionObserver === "undefined") {
        setChunk({ of: sorted, drawn: sorted.length });
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setChunk((previous) => ({
              of: sorted,
              drawn:
                (previous.of === sorted ? previous.drawn : INITIAL_CARDS) +
                CARDS_PER_STEP,
            }));
          }
        },
        { rootMargin: STEP_MARGIN },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [sorted],
  );

  // The dialog steps through this shelter's animals in the order shown.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({ animals, shown: sorted, basePath });

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
    <div className="flex flex-col gap-4">
      {showSpeciesTabs && (
        <SpeciesTabs
          value={species}
          onChange={setSpecies}
          counts={roster}
          roster={roster}
        />
      )}

      <div className={CARD_GRID}>
        {page.map((animal) => (
          <AnimalCard
            key={animal.id}
            animal={animal}
            reference={reference}
            className="card-paint"
            onOpen={handleOpen}
          />
        ))}
        {/* Nothing to read and nothing to press: it exists so the observer
            has something to watch. */}
        {hasMore && (
          <div
            ref={watchSentinel}
            aria-hidden
            data-grid-sentinel
            className="col-span-full h-px"
          />
        )}
      </div>

      <AnimalDialog
        animal={selected}
        logos={logos}
        origin={origin}
        siblingIds={shownIds}
        reference={reference}
        onNavigate={handleNavigate}
        onClose={close}
      />
    </div>
  );
}
