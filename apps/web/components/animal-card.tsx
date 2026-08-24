"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ChevronRight, House } from "lucide-react";
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
import { animalMeta, longStayLabel, shelterChipLabel } from "@/lib/labels";
import { shelterPath } from "@/lib/shelter-path";

// Adopted and hold are over, and the photo says so quietly: about a fifth of
// the light and two fifths of the colour come off it.
//
// This reinforces the badge beside the name, it does not replace it. It used
// to be the only signal either of those states had, which told anyone who
// could not see the difference - or did not know there was one to look for -
// that an animal they cannot adopt is available.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

// The footer's own box, named because the skeleton below has to match it and a
// comment saying "keep these two in sync" is not a mechanism. Geometry only:
// what the live footer does on hover and focus is its own business, and a
// skeleton has neither.
const FOOTER_BOX = "min-h-11 border-t px-3 pb-3 pt-2.5";

export function AnimalCard({
  animal,
  reference,
  species = "all",
  priority = false,
  onOpen,
  showShelter = false,
}: {
  animal: Animal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  /** The grid's active tab, so the meta line can drop what the tab already said. */
  species?: SpeciesFilter;
  /** Set on the first row, so the largest image on screen is not lazy. */
  priority?: boolean;
  onOpen: (id: string, origin?: DialogOrigin) => void;
  /** Draws the shelter line, which links to that shelter's own page. Opt-in,
   *  and it is what decides whether the line is drawn at all: a shelter's own
   *  page already names itself in its heading, so a line under every card
   *  there would be the page linking to itself. */
  showShelter?: boolean;
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
        className="group flex flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-foreground/40 hover:shadow-sm focus-within:border-foreground/40 focus-within:shadow-sm"
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
            overlay
            className="absolute left-1.5 top-1.5"
          />
          {wait && (
            // On the photo, opposite the counter, for the same reason the
            // status is: it is a flag about the animal's situation, not one of
            // the animal's own facts. Off the text block it stops competing
            // with the shelter for a line that three of the registry's
            // seventeen names cannot fit even on their own.
            //
            // One string, seen and spoken. It used to be three: the duration
            // alone for the eye, an hourglass to say what kind of duration it
            // was, and the full phrase again for a screen reader and a hover.
            // The eye's copy was "3 leta" over a meta line reading
            // "Mačka · samec · 3 leta", which is the same number twice, told
            // apart by a 12px icon; 54 of the 101 cards carrying the mark are
            // that case, because an animal that grew up in the shelter has
            // waited exactly as long as it has been alive. The verb settles it
            // in four characters and pays for them with the icon.
            <Badge
              variant="overlay-warn"
              className="absolute bottom-1.5 left-1.5"
            >
              {t("longStayMark", { duration: wait })}
            </Badge>
          )}
        </div>
        <a
          href={href}
          onClick={openDialog}
          onKeyDown={stepPhoto}
          // stepPhoto is good keyboard behaviour that nothing announces. A
          // visible hint would print an instruction 503 times for the one
          // visitor in a hundred it is aimed at, so the announcement goes
          // where the behaviour already is.
          aria-keyshortcuts={photoCount > 1 ? "ArrowLeft ArrowRight" : undefined}
          // px-3 pt-3 and not p-3: the shelter line below is a sibling now, and
          // the padding that used to close the anchor closes the card down
          // there instead. The rhythm is unchanged, just split across the two:
          // the pt on the sibling is the gap this anchor no longer spans, and
          // its pb-3 is this one's missing bottom.
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
          {/* line-clamp-2 and not truncate, and no title to make up for it.
              Of 503 names, 487 are twelve characters or shorter and 3 run past
              sixteen, the longest being a shelter's listing title typed into a
              name field. Reserving a second line for three animals costs every
              card a row of pixels; letting sixteen of them take one costs
              nothing, because mt-auto on the footer below already absorbs a
              card that runs taller than its neighbours. A title tooltip was
              the fallback for the clipping, and it is one touch cannot open.

              font-semibold is shadcn's own card-title weight. The name sits
              next to a photograph four times its size and was losing. */}
          <h3 id={headingId} className="line-clamp-2 font-semibold">
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
            are in Celje, so a town does not identify one, and this line goes to
            one shelter's page, so a label naming a town would be saying one
            thing and doing another. The whole index is organised by shelter,
            which is the thing worth naming here.

            shelterChipLabel takes the word "zavetišče" off the front, which
            five of the eleven live names begin with: without it a wrapped name
            spends its first line on the word every shelter shares.

            Outside the anchor, because a link inside a link is not markup a
            browser or a screen reader can make sense of. The line keeps the
            anchor's place in the card, so the split is only in the DOM.

            It goes to the shelter's own page, which is the one destination
            that answers both questions somebody presses a shelter's name to
            ask: who they are, and what else they have. Being a real href, it
            also costs no hydration, opens in a tab on a middle click, and
            links 500 animal cards into 17 shelter pages for a crawler that
            would otherwise only reach them from the index. */}
        {showShelter ? (
          <a
            href={shelterPath(animal.shelter.id, locale)}
            // items-start, because the icon belongs beside the first line of a
            // name that may run to two.
            // border-t, min-h-11 and a hover ground: three ways of saying the
            // same thing, which is that this line answers a press. It reads as
            // passive metadata and behaves as a control, and the divider also
            // gives the gap above it a reason to exist: that gap is mt-auto
            // holding the footer down so cards in a stretched row agree about
            // their bottom edge, and with no line drawn under it, it read as a
            // card that had run out of things to say.
            // min-h-11 is the 44px touch target the row never had at text-xs.
            className={`${FOOTER_BOX} mt-auto flex w-full items-start gap-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground dark:focus-visible:outline-background`}
          >
            {/* House and not MapPin. The pin means "place" everywhere else on
                the site (shelter-card.tsx draws it beside a city), and this
                line is not where the animal is, it is who is keeping it. */}
            <House
              className="mt-0.5 size-3 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            {/* The link's own text is its accessible name, the way the shelter
                card's is. An aria-label here could only repeat the name with
                words around it, and WCAG 2.5.3 asks that what is spoken start
                from what is written. */}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {shelterChipLabel(animal.shelter.name)}
            </span>
            {/* The chevron is the affordance and it is drawn at rest. Hover was
                carrying that alone, which says nothing at all on a phone. */}
            <ChevronRight
              aria-hidden
              className="ml-auto mt-0.5 size-3 shrink-0 opacity-60"
            />
          </a>
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
// meta line, then FOOTER_BOX, which is the live footer's own box.
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
        <div className={FOOTER_BOX}>
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </Card>
  );
}
