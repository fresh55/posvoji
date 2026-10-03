"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { thumbnailUrl } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { opensElsewhere } from "@/lib/opens-elsewhere";
import { cn } from "@/lib/utils";

type Direction = "previous" | "next";

// What both kinds of step say about the animal they lead to, so the phone's
// link and the edge arrow are named in the same words.
function useStepWords(animal: ClientAnimal, direction: Direction) {
  const { messages, t } = useI18n();
  const name = animal.name ?? messages.unnamed;
  const onward = direction === "next";
  const step = onward ? messages.nextAnimal : messages.previousAnimal;
  return {
    name,
    onward,
    step,
    label: t("animalStepNamed", { step, name }),
    Chevron: onward ? ChevronRight : ChevronLeft,
  };
}

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
 * Phone shell only. From sm up the dialog keeps its edge arrows
 * (AnimalEdgeSteps below), which name the animal in a tooltip, and the page
 * keys.
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
  const { locale, messages } = useI18n();
  const { name, onward, label, Chevron } = useStepWords(animal, direction);
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
      aria-label={label}
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
      <StepThumb animal={animal} className="bg-muted text-muted-foreground" />
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

/**
 * The two round arrows beside the card from sm up, the wider layout's way to
 * the animals either side of this one.
 *
 * They stand in the gutter outside the card, at the dialog's vertical middle.
 * Pinned to the name row, they moved with every step: the dialog is centred
 * in the window, so a longer listing raised the card's top and the arrows
 * with it, by up to 48px at 1440x900, and the pointer had to find them again
 * after each press. The card's own middle moves too, by about 33px between an
 * animal with one photo and one with several, because a lone photo is drawn
 * taller. The dialog's middle is the window's middle whatever it holds, so an
 * arrow there stays under a resting pointer for as long as it is pressed.
 * Outside the card they also stop reading as part of the title row's share
 * and close buttons, which one of them used to stand beside, and they cannot
 * land on the animal's text, which is what kept them off the middle before.
 *
 * The tooltip names the animal the arrow leads to and shows its photo, the
 * way the phone's steps do, so the arrow says before a press that it walks
 * the animals and not the photos.
 */
export function AnimalEdgeSteps({
  previous,
  next,
  onStep,
}: {
  previous?: ClientAnimal;
  next?: ClientAnimal;
  onStep: (id: string) => void;
}) {
  // The provider draws no element of its own, so the two buttons are still
  // the last two in the dialog.
  return (
    <TooltipProvider>
      {previous && (
        <EdgeStep animal={previous} direction="previous" onStep={onStep} />
      )}
      {next && <EdgeStep animal={next} direction="next" onStep={onStep} />}
    </TooltipProvider>
  );
}

// Absolute against the dialog's body, centred on its height with
// inset-y-0 my-auto the way the gallery and lightbox chevrons are, and on the
// --edge-gutter the dialog leaves either side of the card (CONTENT_CLASS). No
// translate, because the button's press animation writes the translate
// variable. 48px for every pointer, so a finger on the tablet gets more than
// the 44px floor and a mouse gets a target it does not have to aim for.
//
// Opaque, in the card's own ground: on the dimmed page it reads as a piece of
// the card. The outline variant's dark fill is translucent, hence the dark
// overrides.
const EDGE_STEP_CLASS =
  "absolute inset-y-0 z-40 my-auto hidden size-12 rounded-full bg-popover shadow-md desktop-box:inline-flex dark:bg-popover dark:hover:bg-muted";

function EdgeStep({
  animal,
  direction,
  onStep,
}: {
  animal: ClientAnimal;
  direction: Direction;
  onStep: (id: string) => void;
}) {
  const { name, onward, step, label, Chevron } = useStepWords(animal, direction);
  return (
    // aria-describedby={undefined} because the bubble says what the name
    // already says: described by it, the button is announced twice over.
    // Radix spreads the trigger's own props over the attribute it sets, so
    // this drops it.
    <Tooltip>
      <TooltipTrigger asChild aria-describedby={undefined}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onStep(animal.id)}
          aria-label={label}
          data-direction={direction}
          className={cn(
            EDGE_STEP_CLASS,
            onward
              ? "left-[calc(100%+(var(--edge-gutter)-3rem)/2)]"
              : "right-[calc(100%+(var(--edge-gutter)-3rem)/2)]",
          )}
        >
          <Chevron className="size-6" aria-hidden />
        </Button>
      </TooltipTrigger>
      {/* The site's tooltip, so it carries the shared 350ms and never opens
          for a touch. It closes on the press and stays closed until the
          pointer leaves, so a run of presses is not interrupted by it. */}
      <TooltipContent side="bottom" sideOffset={8} className="gap-2.5 p-1.5 pe-3">
        {/* Eager: the bubble mounts only when it opens, so it is already on
            screen and a lazy check would only hold the fetch back. */}
        <StepThumb
          animal={animal}
          loading="eager"
          className="bg-background/15 text-background/70"
        />
        <span className="min-w-0">
          <span className="block opacity-70">{step}</span>
          <span className="block truncate text-sm font-medium">{name}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// The photo the animal's card leads with, or its species mark when it has
// none, in the colours the step stands on. The photo is the 112px copy ingest
// cuts beside every cached one. It is the file the stage's wash draws for that photo, so the
// animal just stepped from is already in the cache and the one ahead has its
// wash fetched early. The width ladder's smallest rung is 320px, eight times
// this box.
function StepThumb({
  animal,
  loading,
  className,
}: {
  animal: ClientAnimal;
  loading?: "eager" | "lazy";
  className?: string;
}) {
  const lead = animal.images[0];
  const photo = lead && { ...lead, src: thumbnailUrl(lead.src), widths: undefined };
  const SpeciesMark = SPECIES_ICONS[animal.species];
  return (
    <span
      className={cn(
        "relative size-10 shrink-0 overflow-hidden rounded-md",
        className,
      )}
    >
      {photo ? (
        <AnimalPhoto
          photo={photo}
          alt=""
          sizes="40px"
          frame={1}
          loading={loading}
          className="object-cover"
        />
      ) : (
        <SpeciesMark
          className="absolute inset-0 m-auto size-5"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
    </span>
  );
}
