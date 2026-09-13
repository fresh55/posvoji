"use client";

import { useMemo } from "react";
import { AnimalCard } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { GridLoadMore } from "@/components/grid-load-more";
import { useI18n } from "@/components/i18n-provider";
import { useIncrementalGrid } from "@/components/use-incremental-grid";
import { useAnimalDialogHost } from "@/hooks/use-animal-dialog-host";
import type { ClientAnimal } from "@/lib/animal";
import { CARD_GRID } from "@/lib/card-grid";
import { SKIP_LINK } from "@/lib/skip-link";
import { DEFAULT_ANIMAL_SORT, sortAnimals } from "@/lib/sort";
import type { ShelterLogos } from "@/lib/shelter-logos";

// The cards, the grid and the dialog wiring are the home page's; the species
// tabs, filter sidebar and clear-filters trail that come with AnimalGrid are
// not what a shelter page asks for.
//
// No empty state. This grid used to draw a dashed panel saying no animals were
// published yet, which only a registry shelter could ever reach, and that
// shelter's page already says the same thing in the notice above: there is no
// feed here, so call them. Two statements of one fact, and the panel's was the
// wrong one, framing a shelter that has no list as one whose list is empty
// this week. The caller renders the whole section only where there are animals
// in it, so an empty grid is not a state this component has to hold.
export function ShelterAnimalGrid({
  animals,
  logos,
  referenceDate,
  basePath,
}: {
  /** At least one. See the note above on why there is no empty state. */
  animals: ClientAnimal[];
  logos: ShelterLogos;
  /** When the dataset was built; ages are measured from it, not the clock. */
  referenceDate: string;
  /** This shelter's own page, where closing the dialog returns to. */
  basePath: string;
}) {
  const { locale, messages } = useI18n();

  // The dataset's own date and not the clock, same as the home page grid: the
  // order and the ages printed on the cards in it have to be read off the same
  // day, and prerendered HTML has no access to the visitor's.
  const reference = useMemo(() => new Date(referenceDate), [referenceDate]);
  const sorted = useMemo(
    () => sortAnimals(animals, DEFAULT_ANIMAL_SORT, locale, reference),
    [animals, locale, reference],
  );

  // The dialog steps through this shelter's animals in the order shown, the
  // whole list and not the drawn part of it: the arrows walk the animals, and
  // a shared link opens the one it names whether or not its card is on the
  // page yet. Both resolve against `animals`, the same as on the home grid.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({ animals, shown: sorted, basePath });

  // Drawn in steps, the same steps as the home grid and by the same hook. This
  // grid used to mount its whole list at once, and the largest shelter in the
  // register holds 186 animals: at the 300 to 330px a row measures
  // (grid-rendering.ts) that was some 28,000px of prerendered document, 186
  // tab stops and 186 photos queued on one page, where the home grid stops at
  // INITIAL_CARDS and grows as the reader descends. Rendering only: the count
  // in the hero, the dialog's siblings and the skip link all read the whole
  // list.
  const { page, drawn, hasMore, settled, gridRef, watchSentinel, showMore } =
    useIncrementalGrid(sorted, selected !== undefined);

  return (
    <>
      {/* One tab stop per card and nothing after this grid but the footer,
          which is the only way to any other page at phone width. The grid is
          bounded now, but sixty cards is still sixty tab stops, and a press
          on the button below adds a hundred and twenty more. Same class
          string as the register's bypass link (shelters-atlas.tsx) and the
          home grid's, and no offsets in it: the link keeps its place in the
          flow when it takes focus, so it does not have to be positioned
          against anything.

          The label names whose animals these are, not a result set: the
          visitor is here because they chose this shelter. */}
      <a href="#za-zivalmi" className={SKIP_LINK}>
        {messages.skipShelterAnimals}
      </a>

      {/* data-card-grid is what the step measures its columns off, and what
          the tests patch to hand it a column count jsdom cannot lay out; see
          the same attribute on the home grid. */}
      <div ref={gridRef} data-card-grid className={CARD_GRID}>
        {page.map((animal, ordinal) => (
          <AnimalCard
            key={animal.id}
            animal={animal}
            reference={reference}
            // Sorted by the wait, like the home grid's default, so the card
            // leaves the long-stay mark off: on a shelter's own page every
            // card in the list would otherwise wear one.
            order={DEFAULT_ANIMAL_SORT}
            // What is drawn is bounded above; this bounds what is painted, so
            // a card scrolled past costs nothing until it comes back. The
            // home grid wears the same class for the same reason.
            className="card-paint"
            // The first row is the largest image on the screen once the
            // header is past, and on a desktop it is on the first screen.
            eager={ordinal < 4}
            onOpen={handleOpen}
          />
        ))}
        <GridLoadMore
          hasMore={hasMore}
          settled={settled}
          watchSentinel={watchSentinel}
          showMore={showMore}
          drawn={drawn}
          total={sorted.length}
        />
      </div>

      {/* Where the link lands: the end of the grid, whatever the grid holds.
          tabIndex so focus actually moves here rather than only scrolling the
          page. The name is the instrumental the other two landing pads use,
          "za-rezultati" and "za-zavetisci", and not "za-zivali": the register
          records that anchors a letter apart on one page are a trap, and the
          same holds for anchors a letter apart across the site. */}
      <div id="za-zivalmi" tabIndex={-1} />

      <AnimalDialog
        animal={selected}
        logos={logos}
        origin={origin}
        siblingIds={shownIds}
        reference={reference}
        onNavigate={handleNavigate}
        onClose={close}
      />
    </>
  );
}
