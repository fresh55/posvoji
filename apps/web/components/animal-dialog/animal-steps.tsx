"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-context";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { animalPath } from "@/lib/animal-path";
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
  // The photo its card leads with. A client animal's photos are already the
  // ones it may draw.
  const photo = animal.images[0];
  const SpeciesMark = SPECIES_ICONS[animal.species];
  const onward = direction === "next";
  const Chevron = onward ? ChevronRight : ChevronLeft;
  return (
    <a
      // A real address, the one the card for this animal links to, so a
      // modified click or a long press still opens its page elsewhere. A plain
      // press steps in place, the way the edge arrows do.
      href={animalPath(animal, locale)}
      data-slot="animal-step"
      data-direction={direction}
      // The caption on screen is the short one, because a 320px screen gives
      // each half 140px. The name a reader hears is whole, and it starts with
      // what is printed.
      aria-label={t(onward ? "nextAnimalNamed" : "previousAnimalNamed", {
        name,
      })}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
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
