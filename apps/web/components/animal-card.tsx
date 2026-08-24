"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Hourglass, MapPin } from "lucide-react";
import type { Animal } from "@posvoji/schema";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { animalPath } from "@/lib/animal-path";
import { permittedImageUrls } from "@/lib/animal-images";
import type { SpeciesFilter } from "@/lib/filters";
import { translate } from "@/lib/i18n";
import { animalMeta, longStayLabel, shelterChipLabel } from "@/lib/labels";

// Adopted and hold are over, and the photo says so quietly: about a fifth of
// the light and two fifths of the colour come off it.
//
// This reinforces the badge beside the name, it does not replace it. It used
// to be the only signal either of those states had, which told anyone who
// could not see the difference - or did not know there was one to look for -
// that an animal they cannot adopt is available.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

export function AnimalCard({
  animal,
  reference,
  species = "all",
  priority = false,
  onOpen,
  onShelterClick,
}: {
  animal: Animal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  /** The grid's active tab, so the meta line can drop what the tab already said. */
  species?: SpeciesFilter;
  /** Set on the first row, so the largest image on screen is not lazy. */
  priority?: boolean;
  onOpen: (id: string, origin?: DialogOrigin) => void;
  /** Turns the shelter's town into a control that asks the map to spotlight
   *  it. Opt-in, and it is what decides whether the line is drawn at all: only
   *  a page that also mounts the location picker has anything to answer with,
   *  and a shelter's own page already names itself in its heading, so a line
   *  repeating it under every card there is noise. */
  onShelterClick?: (shelterId: string) => void;
}) {
  const { locale, messages, t } = useI18n();
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoCount = permittedImageUrls(animal.images).length;
  const wait = longStayLabel(animal, locale, reference);
  // The animal's own page, which is also what the dialog writes to the
  // address bar when this card is clicked. Filters are deliberately left out:
  // the href is written at build time, where the visitor's filters do not
  // exist, and computing it on the client would not survive hydration. A
  // modified click therefore deep links to the animal without them, while a
  // plain click keeps them and opens the dialog in place.
  const settled = animal.status === "adopted" || animal.status === "hold";
  const href = animalPath(animal, locale);
  // The shelter's name is the visible label and the accessible name says more
  // than it, so the name has to be inside the spoken sentence: WCAG 2.5.3 asks
  // that what is read starts from what is written. shelterChipLabel only ever
  // strips a leading or trailing word, so the visible text is always a
  // substring of the full name this interpolates.
  const shelterLabel = translate(locale, "showShelterOnMap", {
    shelter: animal.shelter.name,
  });

  // The href is a real deep link, so a middle click or a held modifier gets
  // the tab it asked for. A plain click stays on the page and opens the
  // dialog, and hands over where it came from for the zoom to grow out of.
  function openDialog(event: MouseEvent<HTMLAnchorElement>) {
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
    const rect = cardRef.current?.getBoundingClientRect();
    // The photo as the visitor sees it, which is what the dialog carries into
    // the fan. Found by name rather than by walking to the first child, so
    // anything added above or beside the photo cannot silently send the zoom
    // off from the wrong rectangle.
    const photo = cardRef.current
      ?.querySelector('[data-slot="photo-frame"]')
      ?.getBoundingClientRect();
    onOpen(
      animal.id,
      rect
        ? {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            photo: photo?.width
              ? {
                  left: photo.left,
                  top: photo.top,
                  width: photo.width,
                  height: photo.height,
                }
              : undefined,
          }
        : undefined,
    );
  }

  // The keyboard's way through the gallery. The chevrons are pointer
  // affordances and are out of the tab order, so the arrows live on the card's
  // one link instead: one stop per card rather than three, and no walking
  // through two discs to reach the animal below.
  function stepPhoto(event: KeyboardEvent<HTMLAnchorElement>) {
    if (photoCount < 2) return;
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    setPhotoIndex((current) => (current + direction + photoCount) % photoCount);
  }

  return (
    <Card asChild>
      {/* flex-col so the leftover height a stretched grid row hands the card
          collects above the shelter line rather than below it. Without it a
          card whose neighbour wrapped onto a second line kept up to 20px of
          empty space under its last line, and two cards in one row visibly
          disagreed about their bottom padding. */}
      <article
        ref={cardRef}
        // <article> maps to a role screen readers announce on entry, and 503
        // unnamed ones say nothing at all. The heading is the name it should
        // have been carrying.
        aria-labelledby={headingId}
        className="group flex flex-col overflow-hidden transition-colors hover:border-foreground/40 focus-within:border-foreground/40"
      >
        <div className="relative shrink-0">
          <PhotoGallery
            animal={animal}
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
            tone={settled ? QUIET_PHOTO : undefined}
            href={href}
            onNavigate={openDialog}
            index={photoIndex}
            onIndexChange={setPhotoIndex}
            priority={priority}
          />
          {/* One copy, on the photo, at every width. A status disqualifies the
              whole card, so it belongs on the thing it disqualifies rather
              than queueing for space beside the name. It used to be two DOM
              copies swapped by a breakpoint, which also left the phone copy
              orphaned between the two links, inside neither. */}
          <StatusBadge
            status={animal.status}
            locale={locale}
            size="sm"
            overlay
            className="absolute left-2 top-2"
          />
          {wait && (
            // On the photo, opposite the counter, for the same reason the
            // status is: it is a flag about the animal's situation, not one of
            // the animal's own facts. Off the text block it stops competing
            // with the shelter for a line that three of the registry's
            // seventeen names cannot fit even on their own.
            //
            // The duration alone, because the hourglass says what kind of
            // duration it is. The full phrase is what gets spoken and what a
            // hover shows.
            <Badge
              variant="outline"
              size="sm"
              title={t("longStayMark", { duration: wait })}
              className="absolute bottom-1.5 left-1.5 gap-1 border-transparent bg-[var(--status-warn-solid)] text-[var(--status-warn-solid-foreground)] shadow-xs backdrop-blur-sm"
            >
              <Hourglass strokeWidth={1.75} aria-hidden />
              <span aria-hidden>{wait}</span>
              <span className="sr-only">
                {t("longStayMark", { duration: wait })}
              </span>
            </Badge>
          )}
        </div>
        <a
          href={href}
          onClick={openDialog}
          onKeyDown={stepPhoto}
          // px-3 pt-3 and not p-3: the shelter line below is a sibling now, and
          // the padding that used to close the anchor closes the card down
          // there instead. The rhythm is unchanged, just split across the two:
          // pt-1 on the sibling is the gap this anchor no longer spans, and its
          // pb-3 is this one's missing bottom.
          //
          // gap-1 and not space-y-1. space-y-* puts a margin on
          // :not(:last-child), and :last-child is structural: at sm and up the
          // phone-only wait line is display:none but still a child, so the meta
          // stopped being last, took a 4px bottom margin, and collapsed it
          // straight through an anchor that has no bottom padding. Every card
          // carrying a wait label sat its shelter line 4px lower than its
          // neighbours'. gap is not a margin, never collapses, and is not
          // emitted for a hidden item.
          className="flex flex-col gap-1 px-3 pt-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground dark:focus-visible:outline-background"
        >
          {/* The name owns its line. It used to share one with the status
              badge and the wait mark, where an amber icon was the loudest
              thing on a card about an animal and, on a 208px card, left the
              name about eight characters. */}
          <h3
            id={headingId}
            className="truncate font-medium"
            title={animal.name ?? messages.unnamed}
          >
            {animal.name ?? messages.unnamed}
          </h3>
          {/* Allowed to wrap, for the same reason the shelter line below is:
              an ellipsis here eats the animal's age, and "10..." is not an
              age. Wrapping used to leave cards in a row disagreeing about
              their bottom padding, which is what made clipping look like the
              lesser evil; mt-auto on the shelter line settles that now, so a
              second line costs a row of pixels and nothing else.

              text-pretty so the last word does not end up alone on it. */}
          <p className="text-pretty text-sm text-muted-foreground tabular-nums">
            {animalMeta(animal, locale, reference, species)}
          </p>
        </a>

        {/* The shelter's own line, at the card's full width, and allowed to
            wrap rather than clip. Three of the registry's seventeen names are
            wider than a phone card even with the line to themselves, so a
            single line was always going to cut one of them; "Obalno za…" names
            no shelter at all. Two lines cost a row of pixels and keep the name.

            The shelter's own name, not its town. Two shelters in the registry
            are in Celje, so a town does not identify one; and this control
            spotlights a shelter on the map, so a label naming a town would be
            saying one thing and doing another. The whole index is organised by
            shelter, which is the thing worth naming here.

            shelterChipLabel takes the word "zavetišče" off the front, which
            five of the eleven live names begin with: without it a wrapped name
            spends its first line on the word every shelter shares.

            Outside the anchor, because a control inside a link is a control
            nothing can reach: a keyboard would have to walk through the card's
            own link to get to it and a screen reader would announce one thing
            sitting in another. */}
        {onShelterClick ? (
          <button
            type="button"
            onClick={() => onShelterClick(animal.shelter.id)}
            aria-label={shelterLabel}
            // items-start, because the pin belongs beside the first line of a
            // name that may run to two.
            // cursor-pointer because a bare <button> keeps the arrow cursor,
            // and nothing else here says the line answers a click.
            className="mt-auto flex w-full cursor-pointer items-start gap-1 px-3 pb-3 pt-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground dark:focus-visible:outline-background"
          >
            <MapPin
              className="mt-0.5 size-3 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {shelterChipLabel(animal.shelter.name)}
            </span>
          </button>
        ) : (
          // A shelter's own page names itself in its heading, so the line has
          // nothing to add and nowhere to click; the anchor above just carries
          // the card's bottom padding instead.
          <div className="mt-auto pb-3" />
        )}
      </article>
    </Card>
  );
}

// Matched to the live card block for block, so whoever wires this to a real
// loading state does not inherit a 12px jump: pt-3, a 24px heading, a 20px
// meta line, then the shelter line's own pt-1 and pb-3.
export function AnimalCardSkeleton() {
  return (
    <Card asChild>
      {/* overflow-hidden because the photo's own 10px corners sit inside the
          border's 9px inner curve, and with nothing clipping them the muted
          fill showed past the border at both top corners. */}
      <div className="overflow-hidden">
        <Skeleton className="aspect-[4/3] rounded-none" />
        <div className="flex flex-col gap-1 px-3 pt-3">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="px-3 pb-3 pt-1">
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </Card>
  );
}
