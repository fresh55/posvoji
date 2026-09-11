"use client";

import { useMemo } from "react";
import { AnimalCard } from "@/components/animal-card";
import { AnimalDialog } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
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

  // The dialog steps through this shelter's animals in the order shown.
  const { selected, origin, shownIds, handleOpen, handleNavigate, close } =
    useAnimalDialogHost({ animals, shown: sorted, basePath });

  return (
    <>
      {/* One tab stop per card and nothing after this grid but the footer,
          which is the only way to any other page at phone width. The largest
          shelter in the register holds 186 animals and this grid is uncapped,
          where the home page's stops at INITIAL_CARDS with a load-more
          (grid-rendering.ts), so this is the one list on the site a keyboard
          cannot get past. Same class string as the register's bypass link
          (shelters-atlas.tsx) and the home grid's, and no offsets in it: the
          link keeps its place in the flow when it takes focus, so it does not
          have to be positioned against anything.

          The label names whose animals these are, not a result set: the
          visitor is here because they chose this shelter. */}
      <a
        href="#za-zivalmi"
        className={SKIP_LINK}
      >
        {messages.skipShelterAnimals}
      </a>

      <div className={CARD_GRID}>
        {sorted.map((animal) => (
          <AnimalCard
            key={animal.id}
            animal={animal}
            reference={reference}
            // Sorted by the wait, like the home grid's default, so the card
            // leaves the long-stay mark off: on a shelter's own page every
            // card in the list would otherwise wear one.
            order={DEFAULT_ANIMAL_SORT}
            onOpen={handleOpen}
          />
        ))}
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
