"use client";

import {
  memo,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Chevron } from "@/components/chevron";
import { useAnimalPhotos } from "@/hooks/use-animal-photos";
import { DeferredStatus } from "@/components/deferred-status";
import type { DialogOrigin } from "@/components/animal-dialog/animal-dialog";
import { cardPhoto } from "@/components/grid-rendering";
import { useI18n } from "@/components/i18n-context";
import { PhotoGallery } from "@/components/photo-gallery";
import { ShelterDistance } from "@/components/shelter-distance";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { useIsNewListing } from "@/hooks/use-last-visit";
import type { ClientAnimal } from "@/lib/animal";
import { SPECIES_ICONS } from "@/lib/animal-icons";
import { FAN_PHOTO_SIZES, FAN_SIDE_PHOTO_SIZES } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { opensElsewhere } from "@/lib/opens-elsewhere";
import {
  CARD_PHOTO_ASPECT,
  CARD_PHOTO_RADIUS,
  CARD_PHOTO_RATIO,
  CARD_PHOTO_SIZES,
} from "@/lib/card-grid";
import type { SpeciesFilter } from "@/lib/filters";
import {
  animalMetaParts,
  longStay,
  META_DOT_CLASS,
  META_SEPARATOR,
  shelterChipLabel,
  stayDuration,
} from "@/lib/labels";
import { shelterPath } from "@/lib/shelter-path";
import type { AnimalSort } from "@/lib/sort";
import { cn } from "@/lib/utils";
import { canMorphPhoto, morphPhoto } from "@/lib/view-transition";

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
// The corner and the box are CARD_PHOTO_RADIUS and CARD_PHOTO_ASPECT, which
// lib/card-grid.ts owns because the grid's loading skeleton has to draw both
// of them and card-paint's height estimate depends on the second. Their
// reasoning is over there with them.
//
// The card's focus ring is drawn here, as an inset ring on a ::after that
// covers the frame, whenever either of the card's links has keyboard focus.
// Here and on an overlay for two reasons. An inset box-shadow on the article
// was painted under its children, so the photo covered the top of it and the
// rest cut through the first letters of the name; an outline on this frame
// computed but never showed either, because Chrome paints the absolutely
// positioned photo inside it after the frame's own outline. A pseudo-element
// positioned last in the frame is painted over the photo and its chevrons by
// tree order. And nothing may reach outside the card's box, because
// card-paint (globals.css) clips there; an inset ring on a box the size of
// the frame stays inside it and follows its corners. pointer-events-none, so
// the overlay never takes a press meant for the photo. The shelter row
// underlines itself as well, which is what says which of the two links the
// ring is standing for.
//
// That same overlay carries a permanent hairline. Many shelter photos are
// studio shots on a white ground, and on the white page such a photo has no
// edge at all: the corners disappear and the wait mark at the top right sits
// in what reads as empty page. 9% black in light mode and 8% white in dark
// close the shape without reading as a border around the picture. Those two
// values are --card-photo-edge (globals.css), which is the only thing the
// theme changes about this frame: both shadows below read the token, so the
// hairline and the focused ring's inner edge are each one string instead of a
// light one and a dark one that had to be kept in step by hand. It was 6%,
// and at 6% the edge is rgb(240) on the white page: the top of the frame read,
// but where a studio photo runs to pure white at the bottom the corners
// vanished and the picture ended nowhere. 9% is rgb(232), an edge the eye
// finds at the corners and still the photo's own rim rather than a line drawn
// round it. It covers
// the empty frame as well, because an animal with no photo draws its caption
// inside this same box (photo-gallery.tsx).
//
// An inset box-shadow and not a second ring, because the focus ring above is a
// ring and an element has one --tw-ring-shadow: two ring utilities here would
// be one value, and whichever the compiler emitted last would take it.
// Tailwind builds box-shadow out of --tw-ring-shadow and --tw-shadow together,
// so the two coexist, and the ring comes first in that list, which is what
// paints the focused 3px over the 1px it covers.
//
// That list is also how the focused ring gets an inner edge. The ring is drawn
// inside the picture, so its inner boundary falls on whatever the photograph
// happens to be there, and on 54 of 59 lead photos that boundary measured
// under 3:1: the ring is a light green, and most shelter photos are studio
// shots on white. So while a card is focused the shadow slot carries a second
// layer, 4px of black at 45%, which the 3px ring covers all but the innermost
// pixel of. What is left is a dark line between the green and the picture,
// 3.4:1 against a white photo, and on a dark photo the ring was already the
// bright thing. The hairline stays in the same value: it is under the ring
// while the ring is there, and back on its own the moment focus leaves.
//
// The 45% black is the same in both themes, so with the hairline behind a
// token neither shadow has a dark twin left to write. That pair used to be
// four strings differing in one colour, and the focused dark one existed only
// to restate the hairline's dark rule, which wrote the same property at the
// same specificity and would otherwise have won.
//
// shrink-0 is the frame's own. It used to sit on a wrapper div around the
// gallery, back when the two marks on the photo were positioned against that
// div; they are drawn against the article now, which left the wrapper holding
// one child and one class. PhotoGallery puts this string on its own root, the
// element carrying data-slot="photo-frame", so the frame is the card's flex
// item and holds its box whatever the text under it does.
const PHOTO_FRAME =
  `relative shrink-0 ${CARD_PHOTO_ASPECT} ${CARD_PHOTO_RADIUS} overflow-hidden bg-muted` +
  " after:pointer-events-none after:absolute after:inset-0 after:z-20" +
  ` after:${CARD_PHOTO_RADIUS}` +
  " after:shadow-[inset_0_0_0_1px_var(--card-photo-edge)]" +
  " group-has-[a:focus-visible]/card:after:shadow-[inset_0_0_0_4px_rgba(0,0,0,0.45),inset_0_0_0_1px_var(--card-photo-edge)]" +
  " group-has-[a:focus-visible]/card:after:ring-3 group-has-[a:focus-visible]/card:after:ring-inset group-has-[a:focus-visible]/card:after:ring-ring";

// What a card with no dialog behind it answers: the dev gallery draws these
// cards on their own, and a press there has nowhere to carry a photograph.
// Written once rather than defaulted inline, so the answer is the same
// function every render.
const NO_DIALOG = () => false;

/**
 * One animal in the grid.
 *
 * Memoised, because the click that opens the dialog re-renders the grid around
 * it: the open animal is an address (use-animal-dialog.ts), so the whole page
 * renders again inside the same synchronous commit the view transition is
 * holding, and at sixty cards that was most of the freeze between the tap and
 * the first frame on a mid-range phone. Not one of them changes.
 *
 * Every prop both grids hand it is already stable: the animal comes out of a
 * memoised sort, the reference date and both callbacks are held by the host
 * above, and the rest are strings and flags that only a filter change moves.
 * The entrance delay the home grid gives its first dozen cards is a style
 * object, which is why that one is written once per ordinal rather than per
 * render (animal-grid.tsx). Whether the dialog has arrived is a fact about the
 * page that flips once, which is why it arrives as the accessor below rather
 * than as the flag it used to be: as a value it re-rendered every drawn card
 * at the flip, from the same idle callback that prefetches the descriptions.
 */
export const AnimalCard = memo(function AnimalCard({
  animal,
  reference,
  species = "all",
  eager = false,
  onOpen,
  isDialogReady = NO_DIALOG,
  showShelter = false,
  order,
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
  onOpen: (id: string, origin?: DialogOrigin, photoIndex?: number) => void;
  /** Asks whether the dialog this card opens is already on the page. The home
   *  grid mounts it on idle, so a press that beats the idle callback, or
   *  Safari's two-second fallback, would start a morph into a state that has no
   *  dialog in it yet: the photograph would leave the card and land nowhere.
   *  Such a press gets the plain open, which is what it got before any of this.
   *
   *  Asked at the press rather than handed over as a flag, so the answer
   *  changing is not sixty cards rendering again; see the memo above. Left off
   *  by a caller with no dialog behind it, and then no card carries a photo
   *  anywhere. */
  isDialogReady?: () => boolean;
  /** Draws the shelter line, which links to that shelter's own page. Opt-in,
   *  and it is what decides whether the line is drawn at all: a shelter's own
   *  page already names itself in its heading, so a line under every card
   *  there would be the page linking to itself. */
  showShelter?: boolean;
  /** The order the list around this card is in, where it has one. The card
   *  reads it to decide whether the long-stay mark is worth drawing; see the
   *  Badge below. Left out on a surface with no order of its own, and then the
   *  mark is drawn. */
  order?: AnimalSort;
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
  const photos = useAnimalPhotos(animal);
  const photoCount = photos.count;
  const pendingIndex = useRef(0);
  // Whether the visitor is waiting on a photo they asked for. The gallery is
  // fetched by two paths and only this one is worth a word on the card: the
  // mouse dwell in photo-gallery.tsx warms the gallery silently and never sets
  // this, so a hover leaves the card quiet.
  const [awaitingStep, setAwaitingStep] = useState(false);
  function selectPhoto(next: number) {
    pendingIndex.current = next;
    if (photos.ready) {
      setPhotoIndex(next);
      return;
    }
    setAwaitingStep(true);
    void photos
      .load()
      .then(() => {
        if (cardRef.current?.isConnected) setPhotoIndex(pendingIndex.current);
        setAwaitingStep(false);
      })
      // Left standing on a failure, which is what lets the note below offer
      // the retry.
      .catch(() => {});
  }
  const wait = longStay(animal, reference);
  // The animal's own page, which is also what the dialog writes to the
  // address bar when this card is clicked. Filters are deliberately left out:
  // the href is written at build time, where the visitor's filters do not
  // exist, and computing it on the client would not survive hydration. A
  // modified click therefore deep links to the animal without them, while a
  // plain click keeps them and opens the dialog in place.
  // A mark saying how long this animal has waited, except where the list it
  // sits in is already ordered by the wait and every card would wear one. The
  // rule lives here rather than at the call site because there are two grids
  // and the shelter page's sorts by the wait too, so a caller passing the
  // answer rather than the fact had to remember a rule that is really about
  // this badge.
  const showWaitMark = order !== "longest-in-shelter";
  const settled = animal.status === "adopted" || animal.status === "hold";
  const href = animalPath(animal, locale);
  // The href is a real deep link, so a middle click or a held modifier gets
  // the tab it asked for. A plain click stays on the page and opens the
  // dialog, and carries this card's photograph into it.
  function openDialog(event: MouseEvent<HTMLAnchorElement>) {
    if (opensElsewhere(event)) return;
    event.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    // Where the dialog grows from when nothing carries the photo: the card's
    // own centre, which is the fallback zoom's origin.
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;
    // The photo as the visitor sees it, which is the box the browser morphs
    // into the dialog's front print. Found through the helper both ends of the
    // morph share (grid-rendering.ts): the dialog finds this same box again on
    // the card behind it when it closes, and spelled separately the two failed
    // apart.
    const photo = cardPhoto(cardRef.current);
    // An animal with no photograph has nothing to carry, a dialog that is not
    // on the page yet has nowhere to carry it, and a browser without the API
    // or a visitor who asked for less movement gets the plain open.
    if (!photo || photoCount === 0 || !isDialogReady() || !canMorphPhoto()) {
      onOpen(animal.id, origin, photoIndex);
      return;
    }
    morphPhoto({
      photo,
      direction: "open",
      update: () => onOpen(animal.id, origin, photoIndex),
    });
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
    selectPhoto((photoIndex + direction + photoCount) % photoCount);
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
        // No focus styling on the article or on the links inside it: the
        // photo frame draws one ring for the whole card (PHOTO_FRAME above).
        // The text block sits flush with the photo's edge, so an outline on
        // the link itself either cuts through the first letters (inset) or
        // falls outside the card's box (offset), and card-paint in
        // globals.css clips everything outside that box.
        //
        // On hover the name underlines, which is the text block's half of
        // the card answering a pointer at all. Hovering used to zoom the
        // photo and bring in the chevrons and the dots while the words under
        // it did nothing, although those words are the card's main link and
        // half its height, so nothing said the two were one target.
        //
        // The underline and nothing else. A hover colour, a ground or a
        // shadow would all be paint the design does not have, and card-paint
        // clips at the card's box anyway, so a ground could not reach past
        // the text to read as a row.
        //
        // Held off the shelter row by the same :has() the press feedback
        // above uses, for the same reason: that row is a link to another
        // page, and underlining the animal's name while the pointer is on it
        // would promise the wrong destination. can-hover (globals.css) keeps
        // it off touch, where :hover sticks after a tap.
        //
        // relative, because the two marks on the photo are drawn last in this
        // element and positioned against it; see them below.
        "group/card relative flex flex-col overflow-hidden transition-transform motion-safe:[&:active:not(:has([data-press-exempt]:active))]:scale-[0.99] can-hover:[&:hover:not(:has([data-press-exempt]:hover))_h3]:underline",
        className,
      )}
      style={style}
    >
      <PhotoGallery
        images={photos.images}
        imageCount={photoCount}
        onRequestImages={() => {
          void photos.load().catch(() => {});
        }}
        name={animal.name}
        className={PHOTO_FRAME}
        sizes={CARD_PHOTO_SIZES}
        // The frame is square, and 265 of the 484 lead photos are wider
        // than 4:3: a square cut from the middle of one throws away a third
        // of its width, and with it a tail or the whole cat at one end of
        // the bench. Told the shape, the photo keeps the animal ingest
        // found in the box.
        frame={CARD_PHOTO_RATIO}
        // A plain click here opens the dialog, whose fan mounts its five
        // prints at once at 24rem. The rung ladder is 320/480/640 plus the
        // original, so at every common density that is a different file
        // from the card's: the front print would otherwise be a cold fetch
        // the moment the dialog opens. Tied to openDialog below,
        // which is what makes this photo open the fan at all.
        //
        // The constant comes from lib and not from the fan itself: an
        // import of photo-spread here would pull the whole fan into the
        // grid's bundle.
        warmSizes={FAN_PHOTO_SIZES}
        warmSideSizes={FAN_SIDE_PHOTO_SIZES}
        tone={settled ? QUIET_PHOTO : undefined}
        // What the empty frame draws above its caption, for an animal the
        // shelter published without a photo. A frame holding one grey
        // sentence is the only card in the grid with nothing in its
        // picture, and at a glance it reads as a card that failed to load
        // rather than as a dog whose photo is on the shelter's own page.
        //
        // The card is what knows the species. The gallery is handed images
        // and a name and nothing else, and it is drawn on the animal's own
        // page and in the dialog as well, so teaching it to read an animal
        // would tie a photo component to the schema for one caller's sake.
        //
        // It takes the component and not the species for the same reason:
        // a species would make the gallery import the icon map and own the
        // mapping, which is animal-icons.ts's job and is already shared by
        // the filter panel and the dialog. Handed the component, the
        // gallery only draws what it is given.
        //
        // animal.species, not the species prop above, which is the grid's
        // active tab and is "all" on most of these cards.
        emptyMark={SPECIES_ICONS[animal.species]}
        variant="card"
        href={href}
        onNavigate={openDialog}
        index={photoIndex}
        onIndexChange={selectPhoto}
        announceChanges={announcePhotoChanges}
        eager={eager}
      />
      {awaitingStep && (photos.error || photos.pending) && (
        <div className="absolute inset-x-2 top-2 z-30">
          <DeferredStatus
            error={photos.error}
            retry={() => selectPhoto(pendingIndex.current)}
          />
        </div>
      )}
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
        // outline-none, because the photo frame draws the focus ring for
        // both of the card's links; see PHOTO_FRAME.
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
            next to a photograph four times its size and was losing.

            underline-offset-4 for the hover underline the article draws on
            this heading. At the default offset the rule cuts through the
            descenders of a name like "Srečko"; 4px clears them, and it is
            what the shelter line below already underlines at. */}
        {/* 18px from xl, 16px below it. The card is 275 to 291px wide from
            xl and a 16px name beside a photograph that size read as a
            caption; on the smaller cards below xl it is the right size for
            the box. The step is at the breakpoint where the card grows
            (CARD_GRID in lib/card-grid.ts), so the name and the photo move
            together.

            18px was tried once before and reverted, not for how it looked
            but because the longest name in the /dev/cards fixture landed
            exactly on its wrapping point at that size, one line on Windows
            and two on the Linux runner CI uses, and the grid baseline failed
            by 28px. That was the fixture's problem: its long name now breaks
            with room to spare at both sizes (card-gallery.tsx), so the
            snapshot is the same height on both machines. Reserving a second
            line for every card is still not the answer, for the reason the
            block above gives. */}
        <h3
          id={headingId}
          className="line-clamp-2 font-semibold underline-offset-4 xl:text-lg"
        >
          {animal.name ?? messages.unnamed}
        </h3>
        {/* Allowed to wrap: an ellipsis here eats the animal's age, and
            "10..." is not an age. Wrapping used to leave cards in a row
            disagreeing about their bottom padding, which is what made
            clipping look like the lesser evil; mt-auto on the shelter line
            settles that now, so a second line costs a row of pixels and
            nothing else. The shelter line itself truncates instead, because
            a shortened shelter name still names the shelter.

            text-pretty so the last word does not end up alone on it.

            Ink, not muted, at the same size and weight. The facts are what a
            visitor scans a card for; the shelter line under them is
            provenance. Both were muted, and two muted lines stacked read as
            one grey block with the name above it, so nothing said which of
            the two to read first. Lightening the shelter line instead was the
            other way to separate them and it is the one contrast rules out:
            muted-foreground on white is about 4.7:1, so anything lighter
            fails AA, and that line is a link. */}
        <p className="text-pretty text-sm text-foreground tabular-nums">
          {/* The middot is drawn one step under the facts it stands between,
              so the line reads as words rather than as one string; how far
              under, and why it is not an alpha any more, is META_DOT_CLASS's
              own comment in labels.ts. The parts come from there already
              separate, so nothing here has to know how the joined form is
              glued together. */}
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
          // No divider and no hover ground. The muted colour and the air
          // above the line do the separating, and the hover is the contact
          // rows' (shelter-card.tsx): the ink comes up and the name
          // underlines, which is what says this answers a press.
          // A ground here would have to reach past the text on both sides
          // to read as a row, and card-paint clips anything past the box.
          //
          // pt-2.5, and it is this padding that is the air: 10px, the same
          // step the photo keeps above the name (see the anchor above), so
          // the two gaps in the text block are one measurement. It was 6px,
          // against 10px above, which left the card's quietest line closer
          // to the facts than the facts are to the picture. mt-auto adds to
          // it only on a row where a neighbour's text wrapped and this card
          // has leftover height to collect; measured across the grid the
          // cards in a row differ by 0.0px at every band, so on almost every
          // card the padding is the whole gap. The 4px costs a desktop card
          // 4px of height and a phone nothing, because the coarse box below
          // is 44px either way and absorbs it.
          //
          // 44px for a thumb and no more than the line for a mouse.
          // pointer-coarse:min-h-11 grows the box only where a finger is
          // what presses it; on a desktop the row is the ten, sixteen and
          // twelve pixels it is drawn with. items-start rather than
          // items-center, so the grown box keeps its air below the words
          // instead of around them: what a phone reads is a line the same
          // distance under the meta line at every pointer, and the target's
          // extra height falls to the card's bottom edge, where on a card
          // with no border it is only the gap before the next row.
          className="mt-auto flex w-full items-start pt-2.5 pb-3 text-left text-xs text-muted-foreground underline-offset-4 outline-none transition-colors pointer-coarse:min-h-11 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
        >
          {/* No mark at all. This used to carry a House, and the argument for
              it was that the pin means "place" everywhere else on the site
              while this line means "who has this animal". That argument is
              about which icon, and the better answer turned out to be
              neither: sixty of them run down a page whose whole point is the
              photographs, they repeat a thing the name already says, and the
              line is the quietest on the card by design. The reasoning that
              chose the house over the pin, kept in case this comes back:

              House and not MapPin. The pin means "place" everywhere else on
              the site (shelter-card.tsx draws it beside a city), and this
              line is not where the animal is, it is who is keeping it. */}
          {/* The link's own text is its accessible name, the way the shelter
              card's is. An aria-label here could only repeat the name with
              words around it, and WCAG 2.5.3 asks that what is spoken start
              from what is written. */}
          <span className="min-w-0 truncate">
            {shelterChipLabel(animal.shelter.name)}
          </span>
          {/* How far the shelter's town is, once the visitor has given the
              location picker a place: "Horjul · 24 km". A visitor from
              Maribor cannot place Horjul, Zavod Muri or Turk by name, and
              until this the distance was only in the picker. Nothing is drawn
              without an origin, and the name truncates before the distance
              does. Its own component, so a new origin renders the number and
              not the card; see shelter-distance.tsx. */}
          <ShelterDistance city={animal.shelter.city} />
          {/* The chevron appears when a pointer or the keyboard is already
              on the card. At rest the muted line is enough on its own, now
              that the house that used to sit beside it is gone.

              Except on a coarse pointer, where it is drawn the whole time.
              The row is the target, but hover never fires on a thumb, so
              everything that answered for this line on a desktop answered for
              nothing on a phone: 12px of muted text 6px under the meta line,
              with no mark on the card saying that this one line leaves for
              another page while everything above it opens the animal. The
              same 60% the hover draws, so it is one mark in two places rather
              than a phone treatment of its own. */}
          <Chevron className="ml-auto mt-0.5 size-3 shrink-0 opacity-0 transition-opacity pointer-coarse:opacity-60 group-hover/card:opacity-60 group-focus-within/card:opacity-60" />
        </a>
      ) : (
        // A shelter's own page names itself in its heading, so the line has
        // nothing to add and nowhere to click; the anchor above just carries
        // the card's bottom padding instead.
        <div className="mt-auto pb-3" />
      )}
      {/* The marks on the photograph, drawn last and positioned against the
          article (relative, above).

          Last because this is the order they are read in. They used to sit
          in the photo's wrapper, before the animal's name, so a screen
          reader walking a card said "Čaka 8 let. Fotografija 1 od 6." and
          only then whose card it was. Drawn after the shelter line they are
          the card's footnotes in the tree and its corners on the screen: the
          frame's top edge is the article's top edge and the article carries
          no padding, so a row at inset-x-2 top-2 starts on the pixels the
          marks were drawn on. The aria-labelledby on the article still puts
          the name first for anyone who enters it as a whole.

          One wrapping row and not a mark pinned to each corner, because there
          are three marks now and pairs of them can meet. The status and the
          wait never can, since the wait is drawn only for an animal still
          waiting, but Novo goes with either, and "trenutno ni na voljo" is
          most of a 320px card on its own. Pinned to the corners, two marks on
          a narrow card would be drawn over each other; in a row the second
          wraps under the first. The wait keeps its corner with ml-auto, on
          whichever line it ends up, so every card that carries one mark
          draws it where it always was.

          pointer-events-none, so the row is no strip of dead photo: a press
          on it, or on a mark, reaches the photo's link under it.

          They stay over the photo by tree order: the row is positioned with
          no z-index of its own and comes after the frame, and the only layer
          above it is the frame's own ::after, which is a 1px hairline and a
          3px focus ring at the frame's edge, four pixels short of an 8px
          inset. */}
      <div
        data-slot="photo-marks"
        className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start gap-1.5"
      >
        {/* One copy, on the photo, at every width. A status disqualifies the
            whole card, so it belongs on the thing it disqualifies rather
            than queueing for space beside the name. It used to be two DOM
            copies swapped by a breakpoint, which also left the phone copy
            orphaned between the two links, inside neither. */}
        {/* 8px in from the corner, which the 14px radius asks for: at 6px
            the pill's own corner sat on the photo's curve. */}
        {/* "trenutno ni na voljo" is 128px at the badge's own 12px, and a
            card at 320px is 136px wide, so below 360px the pill gives up 2px
            of padding a side rather than a pixel of type (status-badge.tsx
            says why the size is one tier everywhere) and keeps 4px clear of
            the photo's far edge. That is 4px past the row's own edge, which
            the row lets it overhang: nothing in it clips. */}
        <StatusBadge
          status={animal.status}
          locale={locale}
          overlay
          className="max-[359px]:px-1.5"
        />
        <NewListingMark
          listedAt={animal.listedAt}
          status={animal.status}
          reference={reference}
        />
        {showWaitMark && wait !== undefined && (
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
          // Which is also the rule the order prop carries. A mark on every
          // card in a list already ordered by the wait says nothing the order
          // has not said: under the default sort the first hundred cards all
          // wore it, and the shelter page sorts the same way. So both grids
          // hand over the order they sorted by and the mark stays off there,
          // while every other order and every caller with no order of its own
          // draws it. The animal's own page says how long it has been waiting
          // either way.
          //
          // Top right, opposite the status, where ml-auto keeps it in the
          // row. The bottom edge belongs to the gallery dots now, and on a
          // phone card the two met in the middle.
          <Badge variant="overlay-quiet" className="ml-auto">
            {t("longStayMark", { duration: stayDuration(wait, locale) })}
          </Badge>
        )}
      </div>
    </article>
  );
});

/**
 * "Novo", on the photo of a card listed since the visitor's last visit that
 * can be adopted now (isNewsToVisitor in hooks/use-last-visit.ts), and
 * nothing for anyone else: a first visit has seen nothing, so nothing on it
 * is new, and a new intake on hold already wears its status.
 *
 * The wait's quiet tier and not a colour of its own. It is a flag about what
 * this visitor has seen, the same kind of fact the wait is about the animal,
 * and green already says a shelter shares its data, a chosen answer and the
 * health record. Beside the wait it reads as the second of two quiet marks
 * rather than as a louder one.
 *
 * Its own component for the reason ShelterDistance is one: the threshold
 * arrives after hydration, from the visitor's own storage, and it is this
 * mark that renders again then, on the cards whose answer changed, and not
 * the memoised card around it.
 */
function NewListingMark({
  listedAt,
  status,
  reference,
}: {
  listedAt: number | undefined;
  status: ClientAnimal["status"];
  reference: Date;
}) {
  const { messages } = useI18n();
  const isNew = useIsNewListing({ listedAt, status }, reference);
  if (!isNew) return null;
  return <Badge variant="overlay-quiet">{messages.newListingMark}</Badge>;
}
