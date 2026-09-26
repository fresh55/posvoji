"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-context";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { thumbnailUrl } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { opensElsewhere } from "@/lib/opens-elsewhere";
import { cn } from "@/lib/utils";

type Direction = "previous" | "next";

/**
 * The phone's way to the animals either side of this one in the list, drawn
 * at the end of the card.
 *
 * They used to be two round chevrons on the title row, straight under the
 * fan's "Foto 1 / 13". A phone's fan has no arrows of its own, so the only
 * chevrons on the screen were read as the next photo, and pressed, they
 * changed the animal instead. A word in the count did not settle it. Here they
 * name the animal they lead to and show its photo, and they stand where the
 * reading of this one ends rather than beside its name.
 *
 * Phone shell only. From sm up the dialog keeps its edge arrows, which say
 * what they walk in a tooltip, and the page keys.
 */
export function AnimalSteps({
  previous,
  next,
  onStep,
}: {
  previous?: ClientAnimal;
  next?: ClientAnimal;
  onStep: (id: string) => void;
}) {
  const { messages } = useI18n();
  if (!previous && !next) return null;
  return (
    // Two columns whatever is in them, so the step back stands on the left and
    // the step on stands on the right even when it is the only one: at either
    // end of the list the side it is on is half of what it says.
    <nav
      aria-label={messages.otherAnimals}
      data-slot="animal-steps"
      className="grid grid-cols-2 gap-2 border-t pt-4 desktop-box:hidden"
    >
      {previous && (
        <AnimalStep animal={previous} direction="previous" onStep={onStep} />
      )}
      {next && <AnimalStep animal={next} direction="next" onStep={onStep} />}
    </nav>
  );
}

function AnimalStep({
  animal,
  direction,
  onStep,
}: {
  animal: ClientAnimal;
  direction: Direction;
  onStep: (id: string) => void;
}) {
  const { locale, messages, t } = useI18n();
  const name = animal.name ?? messages.unnamed;
  // The photo its card leads with, as the 112px copy ingest cuts beside every
  // cached one. It is the file the stage's wash draws for that photo, so the
  // animal just stepped from is already in the cache and the one ahead has
  // its wash fetched early. The width ladder's smallest rung is 320px, eight
  // times this box.
  const lead = animal.images[0];
  const photo = lead && { ...lead, src: thumbnailUrl(lead.src), widths: undefined };
  const SpeciesMark = SPECIES_ICONS[animal.species];
  const onward = direction === "next";
  const Chevron = onward ? ChevronRight : ChevronLeft;
  return (
    <a
      // A real address, the one the card for this animal links to, so a
      // modified click or a long press still opens its page elsewhere. A plain
      // press steps in place, the way the edge arrows do.
      href={animalPath(animal, locale)}
      // Not speculated: the site's rules fetch a same-origin link's page on a
      // press, and a plain press here never goes to it. Chrome keys a
      // candidate by its address, though, so where the grid has drawn this
      // animal's card, the card still makes its page one, and a press here
      // fetches it the way a press on the card would.
      data-no-speculate=""
      data-slot="animal-step"
      data-direction={direction}
      // The caption on screen is the short one, because a 320px screen gives
      // each half 140px. The name a reader hears is whole, and it starts with
      // what is printed.
      aria-label={t("animalStepNamed", {
        step: onward ? messages.nextAnimal : messages.previousAnimal,
        name,
      })}
      onClick={(event) => {
        if (opensElsewhere(event)) return;
        event.preventDefault();
        onStep(animal.id);
      }}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-ui p-1.5 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none",
        // Mirrored, so the photo stands at the outer edge on both sides and
        // the two captions meet in the middle.
        onward && "col-start-2 flex-row-reverse text-end",
      )}
    >
      <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
        {photo ? (
          <AnimalPhoto
            photo={photo}
            alt=""
            sizes="40px"
            frame={1}
            className="object-cover"
          />
        ) : (
          <SpeciesMark
            className="absolute inset-0 m-auto size-5 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs text-muted-foreground",
            onward && "flex-row-reverse",
          )}
        >
          <Chevron className="size-3 shrink-0" aria-hidden />
          {onward ? messages.nextShort : messages.previousShort}
        </span>
        <span className="block truncate text-sm font-medium">{name}</span>
      </span>
    </a>
  );
}
