"use client";

import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ChevronRight, House } from "lucide-react";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { useI18n } from "@/components/i18n-provider";
import { PhotoGallery } from "@/components/photo-gallery";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import type { ClientAnimal } from "@/lib/animal";
import { FAN_PHOTO_SIZES } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { CARD_PHOTO_SIZES } from "@/lib/card-grid";
import type { SpeciesFilter } from "@/lib/filters";
import {
  ageLabel,
  animalMetaParts,
  longStayMonths,
  META_DOT_CLASS,
  META_SEPARATOR,
  shelterChipLabel,
} from "@/lib/labels";
import { shelterPath } from "@/lib/shelter-path";
import { cn } from "@/lib/utils";

// Adopted and hold are over, and the photo says so quietly: about a fifth of
// the light and two fifths of the colour come off it.
//
// This reinforces the badge beside the name, it does not replace it. It used
// to be the only signal either of those states had, which told anyone who
// could not see the difference - or did not know there was one to look for -
// that an animal they cannot adopt is available.
const QUIET_PHOTO = "saturate-[60%] opacity-80";

// The photo's own frame. Rounded on all four corners and not only the top
// two, because nothing is drawn around it any more: the card stands on the
// page ground, and the photo is the one shape on it (see the article below).
// rounded-xl is 14px on this site's scale, where the bordered surfaces sit at
// rounded-ui's 10px. A photograph is the largest rounded thing in the grid and
// wants the larger corner; a 10px corner on a 228px picture read as tight.
const PHOTO_FRAME = "relative aspect-[4/3] overflow-hidden rounded-xl bg-muted";

export function AnimalCard({
  animal,
  reference,
  species = "all",
  eager = false,
  onOpen,
  showShelter = false,
  className,
  style,
}: {
  animal: ClientAnimal;
  /** The dataset's build time, so prerendered ages survive hydration. */
  reference: Date;
  /** The grid's active tab, so the meta line can drop what the tab already said. */
  species?: SpeciesFilter;
  /** Set on the first row, so the largest image on screen is not lazy. */
  eager?: boolean;
  onOpen: (id: string, origin?: DialogOrigin) => void;
  /** Draws the shelter line, which links to that shelter's own page. Opt-in,
   *  and it is what decides whether the line is drawn at all: a shelter's own
   *  page already names itself in its heading, so a line under every card
   *  there would be the page linking to itself. */
  showShelter?: boolean;
  /** The grid's, for the entrance stagger; the card has no opinion of its own. */
  className?: string;
  style?: CSSProperties;
}) {
  const { locale, messages, t } = useI18n();
  const cardRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [announcePhotoChanges, setAnnouncePhotoChanges] = useState(false);
  // Every photo here is one the card may draw: the projection that built this
  // animal dropped the rest.
  const photoCount = animal.images.length;
  const waitMonths = longStayMonths(animal, reference);
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
    setAnnouncePhotoChanges(true);
    setPhotoIndex((current) => (current + direction + photoCount) % photoCount);
  }

  return (
    /* No border, no shadow, no ground of its own. The card used to be a
       ui/card.tsx surface, and sixty of those beside a sidebar of bordered
       tiles read as a form rather than a gallery. What a photo grid needs is
       the photo with its corners rounded and the words set flush under it on
       the page, which is how every photo-first index draws its cards, and the
       one box a visitor sees is the one the pointer is on: the photo zooms on
       hover (photo-gallery.tsx), and the ring below draws for the keyboard.

       flex-col so the leftover height a stretched grid row hands the card
       collects above the shelter line rather than below it. Without it a
       card whose neighbour wrapped onto a second line kept up to 20px of
       empty space under its last line, and two cards in one row visibly
       disagreed about their bottom padding. */
    <article
      ref={cardRef}
      // <article> maps to a role screen readers announce on entry, and 503
      // unnamed ones say nothing at all. The heading is the name it should
      // have been carrying.
      aria-labelledby={headingId}
      // active:scale is the press answering back where hover never fires,
      // which is every touch screen. 0.99 is felt, not watched.
      //
      // It answers only for the presses that open this animal: the photo and
      // the name block. Anything carrying data-press-exempt is held out with
      // :has(), because the whole card squeezing is a promise that this card
      // is about to open, and the gallery chevrons only turn the picture
      // while the shelter line leaves for another page entirely.
      className={cn(
        // group/card and not a bare group: the photo's zoom lives in
        // photo-gallery.tsx and reaches back up to this element, and an
        // unnamed group would tie it to whichever ancestor happened to carry
        // one. The same reasoning the gallery's own chevrons already follow
        // with group/photo.
        //
        // One focus ring for the whole card, drawn here and not on the links
        // inside it. The text block sits flush with the photo's edge, so an
        // outline on the link itself either cuts through the first letters
        // (inset) or falls outside the card's box (offset), and card-paint in
        // globals.css clips everything outside that box. An inset ring on the
        // article follows the photo's corners and stays inside. :has() and
        // not focus-within, so a mouse press on the way to the dialog does
        // not flash it; the shelter row underlines itself as well, which is
        // what says which of the two links the ring is standing for.
        "group/card flex flex-col overflow-hidden rounded-xl transition-transform has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-inset has-[a:focus-visible]:ring-ring motion-safe:[&:active:not(:has([data-press-exempt]:active))]:scale-[0.99]",
        className,
      )}
      style={style}
    >
      <div className="relative shrink-0">
        <PhotoGallery
          images={animal.images}
          name={animal.name}
          className={PHOTO_FRAME}
          sizes={CARD_PHOTO_SIZES}
          // A plain click here opens the dialog, whose fan mounts its five
          // prints at once at 24rem. The rung ladder is 320/480/640 plus the
          // original, so at every common density that is a different file
          // from the 229px card's: the front print would otherwise be a cold
          // fetch the moment the dialog opens. Tied to openDialog below,
          // which is what makes this photo open the fan at all.
          //
          // The constant comes from lib and not from the fan itself: an
          // import of photo-spread here would pull the whole fan into the
          // grid's bundle.
          warmSizes={FAN_PHOTO_SIZES}
          tone={settled ? QUIET_PHOTO : undefined}
          href={href}
          onNavigate={openDialog}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          announceChanges={announcePhotoChanges}
          eager={eager}
        />
        {/* One copy, on the photo, at every width. A status disqualifies the
            whole card, so it belongs on the thing it disqualifies rather
            than queueing for space beside the name. It used to be two DOM
            copies swapped by a breakpoint, which also left the phone copy
            orphaned between the two links, inside neither. */}
        {/* 8px in from the corner, which the 14px radius asks for: at 6px
            the pill's own corner sat on the photo's curve. */}
        <StatusBadge
          status={animal.status}
          locale={locale}
          overlay
          className="absolute left-2 top-2"
        />
        {waitMonths !== undefined && (
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
          //
          // One quiet tier, and not amber. A solid warm pill on every photo
          // is an alarm ringing so often it stops being one, and the filled
          // warm treatment stays with the status badge, which really does
          // disqualify a card. A second, louder tier for the longest waits
          // does not work either: the default sort is longest in shelter, so
          // every card above the fold would wear it.
          //
          // Top right, opposite the status. The bottom edge belongs to the
          // gallery dots now, and on a phone card the two met in the middle.
          <Badge
            variant="overlay-quiet"
            className="absolute right-2 top-2"
          >
            {t("longStayMark", { duration: ageLabel(waitMonths, locale) })}
          </Badge>
        )}
      </div>
      <a
        // The card's own link, and the one thing in the article that names
        // the animal. animal-grid.tsx looks for this after "show more" so
        // the keyboard lands here and not on the photo's decorative anchor.
        data-slot="card-link"
        href={href}
        onClick={openDialog}
        onKeyDown={stepPhoto}
        // stepPhoto is good keyboard behaviour that nothing announces. A
        // visible hint would print an instruction 503 times for the one
        // visitor in a hundred it is aimed at, so the announcement goes
        // where the behaviour already is.
        aria-keyshortcuts={photoCount > 1 ? "ArrowLeft ArrowRight" : undefined}
        // No horizontal padding: the words start where the photo starts.
        // The 12px inset was the border's, setting text inside a box, and
        // on a card with no box it read as the text drifting off the
        // picture's edge. pt-2.5 and not pt-3, and gap-0.5 below it: on a
        // 390px phone the text block stood as tall as the photo above it,
        // and the line boxes already hold 6px of air between the name and
        // the meta line before any gap is added. The shelter line below is
        // a sibling and carries the card's bottom.
        //
        // gap and not space-y. space-y-* is a margin on :not(:last-child),
        // so the moment a child here is conditional or hidden at a
        // breakpoint, the one above it takes a bottom margin and collapses
        // it through an anchor with no bottom padding. That shipped once,
        // when the wait line was still in this block.
        //
        // outline-none, because the article draws the focus ring for both
        // of the card's links; see its className.
        className="flex flex-col gap-0.5 pt-2.5 outline-none"
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
        {/* Allowed to wrap: an ellipsis here eats the animal's age, and
            "10..." is not an age. Wrapping used to leave cards in a row
            disagreeing about their bottom padding, which is what made
            clipping look like the lesser evil; mt-auto on the shelter line
            settles that now, so a second line costs a row of pixels and
            nothing else. The shelter line itself truncates instead, because
            a shortened shelter name still names the shelter.

            text-pretty so the last word does not end up alone on it. */}
        <p className="text-pretty text-sm text-muted-foreground tabular-nums">
          {/* The middots recede to half strength so the facts between them
              read as three words rather than one string. The parts come from
              labels.ts already separate, so nothing here has to know how the
              joined form is glued together. */}
          {animalMetaParts(animal, locale, reference, species).flatMap(
            (part, i) =>
              i === 0
                ? [part]
                : [
                    <span key={i} className={META_DOT_CLASS}>
                      {META_SEPARATOR}
                    </span>,
                    part,
                  ],
          )}
        </p>
      </a>

      {/* The shelter's own line, at the card's full width, on one line.

          The shelter's own name, not its town. Two shelters in the registry
          are in Celje, so a town does not identify one, and this line goes to
          one shelter's page, so a label naming a town would be saying one
          thing and doing another. The whole index is organised by shelter,
          which is the thing worth naming here.

          shelterChipLabel takes off the word "zavetišče", which five of the
          eleven live names begin with, and any trailing operator
          parenthetical. What is left fits one line on every card, so the
          line can truncate as a last resort instead of wrapping, and every
          footer in a row is the same height.

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
          // This line leaves for the shelter's page, so the card must not
          // squeeze under it. See the article's own comment.
          data-press-exempt
          // No divider and no hover ground. The muted colour and the gap
          // mt-auto keeps above the line do the separating, and the hover
          // is the contact rows' (shelter-card.tsx): the ink comes up and
          // the name underlines, which is what says this answers a press.
          // A ground here would have to reach past the text on both sides
          // to read as a row, and card-paint clips anything past the box.
          //
          // 44px for a thumb and no more than the line for a mouse.
          // pointer-coarse:min-h-11 grows the box only where a finger is
          // what presses it; on a desktop the row is the six, sixteen and
          // twelve pixels it is drawn with. items-start rather than
          // items-center, so the grown box keeps its air below the words
          // instead of around them: what a phone reads is a line the same
          // distance under the meta line at every pointer, and the target's
          // extra height falls to the card's bottom edge, where on a card
          // with no border it is only the gap before the next row.
          className="mt-auto flex w-full items-start gap-1 pt-1.5 pb-3 text-left text-xs text-muted-foreground underline-offset-4 outline-none transition-colors pointer-coarse:min-h-11 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
        >
          {/* House and not MapPin. The pin means "place" everywhere else on
              the site (shelter-card.tsx draws it beside a city), and this
              line is not where the animal is, it is who is keeping it.
              mt-0.5 puts the 12px glyph on the 16px line's centre, which
              items-start alone no longer does. */}
          <House className="mt-0.5 size-3 shrink-0" strokeWidth={1.75} aria-hidden />
          {/* The link's own text is its accessible name, the way the shelter
              card's is. An aria-label here could only repeat the name with
              words around it, and WCAG 2.5.3 asks that what is spoken start
              from what is written. */}
          <span className="min-w-0 truncate">
            {shelterChipLabel(animal.shelter.name)}
          </span>
          {/* The chevron appears when a pointer or the keyboard is already
              on the card. At rest the icon and the muted line are enough,
              and on touch, where hover never fires, the whole row is the
              affordance. */}
          <ChevronRight
            aria-hidden
            className="ml-auto mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-60 group-focus-within/card:opacity-60"
          />
        </a>
      ) : (
        // A shelter's own page names itself in its heading, so the line has
        // nothing to add and nowhere to click; the anchor above just carries
        // the card's bottom padding instead.
        <div className="mt-auto pb-3" />
      )}
    </article>
  );
}
