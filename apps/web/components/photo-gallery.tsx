"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  adjacentImages,
  photoDotWindow,
  type PermittedPhoto,
} from "@/lib/animal-images";
import { translate } from "@/lib/i18n";
import { preloadPhotos } from "@/lib/preload-photos";
import { declareAxis, swipeVerdict } from "@/lib/swipe";
import { cn } from "@/lib/utils";

// Shared with the dialog's photo spread, so both sets of chevrons behave and
// look the same. The spread drives its own reveal off its own ancestor, so the
// group here is unqualified and this constant carries no pointer-events of its
// own; see OWN_BUTTON_CLASS below for what this component uses.
//
// A near-solid ground and no backdrop filter. These sit on the fan, whose
// photos move under them every frame of a drag, and a backdrop filter has to
// re-sample and re-blur what it stands over each of those frames on a real
// GPU. The extra 10% of opacity is what the blur was there for: to keep a
// chevron legible over a photograph of any colour. The card's own chevrons
// below keep theirs, because their photo stands still.
export const GALLERY_BUTTON_CLASS =
  "absolute inset-y-0 z-10 my-auto rounded-full bg-background/90 opacity-0 shadow-xs transition-opacity hover:bg-background active:translate-y-0! group-hover:opacity-100 group-focus-within:opacity-100";

// This component's own chevrons, which differ from the shared constant in two
// ways.
//
// They gate pointer events on the same conditions as the opacity. opacity: 0
// does not remove hit-testing, and touch has no hover, so on a phone these
// were two permanently invisible, permanently tappable 32px discs sitting on
// the photo: 64px of a 171px card, over a 32px band, about a tenth of the
// photo's area. A tap meant to open the animal advanced the picture instead.
// pointer-events never blocks focus, so the keyboard is unaffected.
//
// And they scope the group to the photo rather than to whatever ancestor
// happens to carry `group`. Only the grid card ever had one, which left these
// permanently invisible on the animal page and in the dialog's phone hero -
// invisible and, until this change, still tappable.
const OWN_BUTTON_CLASS =
  "absolute inset-y-0 z-10 my-auto rounded-full bg-background/80 opacity-0 pointer-events-none shadow-xs backdrop-blur-sm transition-opacity hover:bg-background active:translate-y-0! group-hover/photo:opacity-100 group-hover/photo:pointer-events-auto group-focus-within/photo:opacity-100 group-focus-within/photo:pointer-events-auto";

const DEFAULT_WRAPPER_CLASS =
  "relative aspect-[4/3] overflow-hidden rounded-ui-top bg-muted";

// One dot's shape, hoisted so the ~1500 of them the grid draws are not 1500
// string builds per render.
// A shadow that is a dark edge rather than a soft drop, because what these sit
// on is a photograph and a photograph can be any colour. shadow-xs is tuned to
// lift a control off a known surface; over a white cat on a cream blanket both
// the bg-background dot and its shadow are the same value as the picture and
// the row disappears. The ring is drawn in black at low alpha, so it reads as
// the dot's own edge on a light photo and disappears into a dark one, where the
// white dots never needed help.
const DOT_CLASS =
  "size-1.5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.35)] transition-colors";

type SwipeStart = { x: number; y: number; time: number; width: number };

// A pointer that crosses the photo and leaves again was not asking for the
// next picture. Mean image weight is about 52KB and a mouse can cross a whole
// grid row in a second, so an ungated preload on enter pulled megabytes.
const PRELOAD_DWELL_MS = 150;
// Which photo the surface a click here opens starts on. This gallery's own
// stepped index does not travel with the click: useAnimalDialog's open()
// strips ?foto= from the address it pushes, so the dialog opens on the first
// photo whatever the card was showing.
const WARM_INDEX = 0;

type PhotoGalleryProps = {
  /** Already resolved to what is drawn, and already free of anything no
   *  surface may draw. The client gets them off the animal it was handed
   *  (see animalsForClient); a server-rendered page resolves its own with
   *  permittedPhotos. Either way the rights are settled before this. */
  images: PermittedPhoto[];
  /** The animal's, for the alt text on a surface that is not a link. */
  name?: string | null;
  sizes: string;
  /** A second sizes value the dwell also fetches the opening photo and its
   *  neighbours at, for a surface that a click on this gallery opens and that
   *  draws the same photos larger. Leave it out on a gallery that opens
   *  nothing, or that opens something drawing them at `sizes`. */
  warmSizes?: string;
  className?: string;
  /**
   * Laid over whatever the surface already is, for callers that want the
   * photo and its counter to read quieter than the rest of the page.
   */
  tone?: string;
  /** Set to make the photo a link; leave out for a plain surface. */
  href?: string;
  // Runs only for a click the swipe handler did not already swallow. The
  // event comes along because the caller decides whether to keep the
  // navigation (a modified click) or take it over.
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Set to drive the gallery from outside; leave out to keep its own index. */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Activate the position live region when a parent changes a controlled index. */
  announceChanges?: boolean;
  /** Above-the-fold cards, so the largest image on screen is not lazy. */
  eager?: boolean;
  /** Serve the AVIF sibling of the photo where ingest derived one. See
   *  AnimalPhoto: only worth it where the layout asks for the top rung. */
  avif?: boolean;
};

export function PhotoGallery({
  images,
  name,
  sizes,
  warmSizes,
  className,
  tone,
  href,
  onNavigate,
  index,
  onIndexChange,
  announceChanges = false,
  eager = false,
  avif = false,
}: PhotoGalleryProps) {
  const [ownIndex, setOwnIndex] = useState(0);
  const swipeStart = useRef<SwipeStart | null>(null);
  const suppressImageLink = useRef(false);
  const preloadedImages = useRef(new Set<string>());
  // Its own set, because warmSizes asks for a different file of the same
  // photo: the rung ladder is 320/480/640 plus the original, so the card picks
  // 320 or 480 where the dialog's fan picks 480 or 640. preloadPhotos dedupes
  // by src within the set it is handed, so sharing one would let whichever
  // sizes asked first swallow the other's fetch.
  const warmedImages = useRef(new Set<string>());
  // One gesture at a time. swipeStart is a single slot, so a second finger
  // used to overwrite the first one's origin and steal the capture, which made
  // finishSwipe measure one finger's position against the other's start - a
  // large bogus number that cleared the distance threshold every time.
  const activePointer = useRef<number | null>(null);
  // Decided once, past the slop, and then remembered. The dominance test used
  // to run again on the two endpoints, so a long horizontal drag that curled
  // downward before release failed it, returned before setting the suppress
  // flag, and let the click through: the photo snapped back and the dialog
  // opened.
  const axis = useRef<"x" | "y" | null>(null);
  const preloadTimer = useRef<number | undefined>(undefined);
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // The finger's own position while dragging, so the photo moves with it
  // rather than waiting for release to react at all. Reduced motion skips
  // this and reacts only once the gesture is over.
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [announceOwnChanges, setAnnounceOwnChanges] = useState(false);
  // The card owns nothing and keeps its own index; the dialog shares one index
  // between the swipeable photo and the thumbnails under it.
  const imageIndex = index ?? ownIndex;
  const image = images[imageIndex];
  const hasGallery = images.length > 1;
  const dots = photoDotWindow(images.length, imageIndex);
  // Without an href there is no card link for the arrows to live on, and the
  // chevrons' way out of the tab order (see the comment on them below) was
  // written for that link. The animal's own page has no such link, so on a
  // plain surface the frame itself takes the focus and the keys, and the
  // chevrons stay in the tab order and in the accessibility tree.
  //
  // The dialog handles its own arrows in photo-spread.tsx, and mounts this
  // component only for an animal with no photo at all, where hasGallery is
  // false. So the two can never answer the same key press.
  const keyboardGallery = hasGallery && href === undefined;

  useEffect(() => {
    return () => window.clearTimeout(preloadTimer.current);
  }, []);

  function setImageIndex(next: number) {
    // Only a gallery the visitor has actually driven gets to speak. The grid
    // mounts one of these per multi-photo card, which was 425 live regions in
    // one document, and a filter change inserts new nodes that already carry
    // their text. result-count.tsx gates the same shape the same way.
    setAnnounceOwnChanges(true);
    if (index === undefined) setOwnIndex(next);
    onIndexChange?.(next);
  }

  // The two neighbours of `index`, warmed with this gallery's own sizes. The
  // dialog's fan warms the tier about to walk in through the same helper.
  function preloadAdjacent(index: number) {
    preloadPhotos(adjacentImages(images, index), sizes, preloadedImages.current);
  }

  // What the surface behind a click here mounts first, at the sizes that
  // surface draws with. Three prints and not the dialog fan's five: the outer
  // two are scaled to 0.42 and tucked behind the rest, and five files for one
  // hovered card is more than a hover should cost.
  function preloadWarm() {
    if (!warmSizes) return;
    const opening = images[WARM_INDEX];
    if (!opening) return;
    preloadPhotos(
      [opening, ...adjacentImages(images, WARM_INDEX)],
      warmSizes,
      warmedImages.current,
    );
  }

  function goToImage(nextIndex: number) {
    if (!hasGallery) return;
    preloadAdjacent(nextIndex);
    setImageIndex(nextIndex);
  }

  function changeImage(direction: -1 | 1) {
    goToImage((imageIndex + direction + images.length) % images.length);
  }

  // Home and End as well as the arrows: the longest gallery in the register
  // runs to fourteen photos, which is a long walk one key at a time.
  function stepPhoto(event: KeyboardEvent<HTMLDivElement>) {
    if (!keyboardGallery) return;
    if (event.key === "ArrowLeft") changeImage(-1);
    else if (event.key === "ArrowRight") changeImage(1);
    else if (event.key === "Home") goToImage(0);
    else if (event.key === "End") goToImage(images.length - 1);
    else return;
    // The page must not scroll out from under the visitor stepping photos.
    event.preventDefault();
  }

  function endGesture() {
    swipeStart.current = null;
    activePointer.current = null;
    axis.current = null;
    setDragging(false);
    setDragOffset(0);
  }

  function startSwipe(event: PointerEvent<HTMLElement>) {
    // Cleared before any early return. It used to be cleared after them, so a
    // swipe whose compatibility click never arrived left the flag set, and the
    // next mouse click or Enter on the same photo was swallowed instead.
    suppressImageLink.current = false;
    if (!hasGallery || event.pointerType === "mouse") return;
    if (activePointer.current !== null) return;
    activePointer.current = event.pointerId;
    axis.current = null;
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      width: event.currentTarget.clientWidth || 1,
    };
    setDragging(true);
    preloadAdjacent(imageIndex);
    // Optional call: jsdom has no pointer capture, and a gesture that cannot
    // be captured still works, it just stops tracking a finger that leaves the
    // element.
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current;
    if (!start || shouldReduceMotion) return;
    if (event.pointerId !== activePointer.current) return;

    const distanceX = event.clientX - start.x;
    const distanceY = event.clientY - start.y;

    if (axis.current === null) {
      // A vertical drag belongs to the page's own scroll, not to the photo.
      axis.current = declareAxis(distanceX, distanceY);
      // Still short of the slop: it could yet turn out to be a tap.
      if (axis.current === null) return;
    }
    if (axis.current !== "x") return;

    const clamped = Math.max(-start.width, Math.min(start.width, distanceX));
    setDragOffset(clamped);
  }

  function finishSwipe(event: PointerEvent<HTMLElement>) {
    const start = swipeStart.current;
    if (!start || event.pointerId !== activePointer.current) {
      endGesture();
      return;
    }
    const committedAxis = axis.current;
    const distanceX = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.time);
    endGesture();

    if (committedAxis !== "x") return;
    // Any gesture that committed to the horizontal is the photo's, whether or
    // not it travelled far enough to turn the page. One that snaps back must
    // not also navigate.
    suppressImageLink.current = true;

    const verdict = swipeVerdict({
      dx: distanceX,
      elapsed,
      width: start.width,
    });
    if (verdict === 0) return;

    changeImage(verdict);
  }

  function handleSwipeCancel() {
    suppressImageLink.current = false;
    endGesture();
  }

  function handlePointerEnter() {
    window.clearTimeout(preloadTimer.current);
    // The dwell is the only path that warms at warmSizes. Stepping or swiping
    // is somebody reading this gallery, not somebody about to open the surface
    // behind it, and those paths keep to this gallery's own sizes.
    preloadTimer.current = window.setTimeout(() => {
      preloadAdjacent(imageIndex);
      preloadWarm();
    }, PRELOAD_DWELL_MS);
  }

  function handlePointerLeave() {
    window.clearTimeout(preloadTimer.current);
  }

  function openImageLink(event: MouseEvent<HTMLAnchorElement>) {
    // A held modifier or a non-primary button is asking the browser for a tab,
    // and that has to win over a stale suppression: the card's own handler
    // deliberately lets those through, and this path used to swallow them.
    const modified =
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0;
    const suppressed = suppressImageLink.current;
    suppressImageLink.current = false;
    if (suppressed && !modified) {
      event.preventDefault();
      return;
    }
    onNavigate?.(event);
  }

  // The swipe contract is the same whether the photo is a link or not, so
  // both surfaces are handed the same set of handlers. The offset and the
  // transition both live on this element rather than on imageContent, so the
  // fallback "no photo yet" note tracks the finger too instead of sitting
  // still while its surface moves.
  //
  // touch-pinch-zoom alongside touch-pan-y: in the touch-action grammar pan-y
  // excludes pinch-zoom, so declaring it alone turned off zoom on the one
  // element a low-vision visitor most wants to zoom. Composing the two keeps
  // the horizontal capture the swipe needs and gives the pinch back.
  // tone lands here and not on the wrapper. On the wrapper every child
  // inherited it, so a settled animal's chevrons and its position dots were
  // dimmed and desaturated along with the photograph. Here it reaches the
  // picture and the "no photo yet" note and stops.
  //
  // A plain string of its own, because the keyboard surface below adds its
  // focus ring to it, and reading it back off `surface` is reading an object
  // that also carries the pointer handlers and their refs.
  const surfaceClassName = cn(
    "absolute inset-0 touch-pan-y touch-pinch-zoom",
    tone,
  );
  const surface = {
    onPointerDown: startSwipe,
    onPointerMove: moveSwipe,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onPointerUp: finishSwipe,
    onPointerCancel: handleSwipeCancel,
    onLostPointerCapture: handleSwipeCancel,
    className: surfaceClassName,
    style: {
      transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
      transition:
        dragging || shouldReduceMotion
          ? undefined
          : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
  };

  const imageContent = image ? (
    <AnimalPhoto
      photo={image}
      // Empty when the photo is a link, because that anchor is aria-hidden and
      // the card names the animal twice over already: in its heading and in
      // the link the heading sits inside.
      //
      // On a plain surface the picture is the only thing there, so it gets a
      // real alternative. "Rex" alone was not one: it names the subject and
      // reads the same for every photo in the set, so the position goes in it
      // and the alt changes as the gallery is walked.
      alt={
        href
          ? ""
          : translate(
              locale,
              images.length > 1 ? "photoAlt" : "photoAltSingle",
              {
                name: name ?? messages.unnamed,
                current: imageIndex + 1,
                total: images.length,
              },
            )
      }
      sizes={sizes}
      eager={eager}
      avif={avif}
      // The zoom is the card's hover lift reaching the photograph: the frame
      // clips it, so nothing moves but the picture inside its box. Named to
      // the card's group rather than an unqualified one, so it answers a
      // hover on the card and cannot be switched on by any other ancestor
      // that happens to carry `group`. Surfaces that are not a card (the
      // animal page, the dialog) have no group/card and get a still photo,
      // which is right for both.
      className="object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover/card:scale-[1.03]"
    />
  ) : (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {messages.photoAtShelter}
    </div>
  );

  return (
    // data-slot, because the card hands the dialog this box to grow its zoom
    // out of and used to find it by walking to the article's firstElementChild.
    // That is the wrapper div, not this one, and it only returned the right
    // rectangle because the wrapper happens to have exactly one in-flow child.
    <div
      data-slot="photo-frame"
      className={cn("group/photo", className ?? DEFAULT_WRAPPER_CLASS)}
    >
      {href ? (
        // A pointer affordance, not a second name for the animal. It stays a
        // real anchor so a held modifier still deep links, but it leaves the
        // tab order and the accessibility tree: every card used to offer the
        // same animal as two links under two unrelated names, which put 503
        // "Odpri podrobnosti o ..." rows in the rotor ahead of the headings
        // that actually distinguish them.
        <a
          href={href}
          aria-hidden="true"
          tabIndex={-1}
          onClick={openImageLink}
          {...surface}
        >
          {imageContent}
        </a>
      ) : keyboardGallery ? (
        // A group, not a listbox or a tablist: nothing here is chosen or
        // selected, the visitor is walking one picture at a time. The label
        // names whose photos these are; which one is showing is the picture's
        // own alt text and the live line at the bottom of this component.
        <div
          role="group"
          aria-label={translate(locale, "photoAltSingle", {
            name: name ?? messages.unnamed,
          })}
          aria-keyshortcuts="ArrowLeft ArrowRight Home End"
          tabIndex={0}
          onKeyDown={stepPhoto}
          {...surface}
          // Inside the frame's own rounded, clipping box, so the ring is drawn
          // as an inset outline the way the grid card draws it.
          className={cn(
            surfaceClassName,
            "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground dark:focus-visible:outline-background",
          )}
        >
          {imageContent}
        </div>
      ) : (
        <div {...surface}>{imageContent}</div>
      )}

      {hasGallery && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            // Out of the tab order on a card: two chevrons on every card came
            // to 850 of the grid's tab stops. The keyboard route through a
            // card's gallery is the arrow keys on the card's own link, which
            // is one stop instead of two and faster than pressing Enter on a
            // disc. A surface with no link has no such route, so there these
            // are ordinary buttons.
            tabIndex={keyboardGallery ? undefined : -1}
            // Read by the grid card, whose press feedback squeezes the whole
            // card. These turn the picture and open nothing, so they are held
            // out of it. Surfaces that do not squeeze ignore the attribute.
            data-press-exempt
            onClick={() => changeImage(-1)}
            aria-label={messages.previousPhoto}
            // Out of the accessibility tree too, same reason as the photo
            // anchor and the dots below: tabIndex=-1 keeps these off the tab
            // order, but a screen reader's virtual cursor walks the tree by
            // DOM position, not by tab order, so it still landed on both
            // chevrons on every multi-photo card - about 850 of them across
            // the grid. The keyboard route is the arrow keys on the card
            // link, and the sr-only line below announces the position. Again
            // the card's case only: where there is no link these are the
            // announced way through the gallery.
            aria-hidden={keyboardGallery ? undefined : "true"}
            className={`${OWN_BUTTON_CLASS} left-1.5`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            tabIndex={keyboardGallery ? undefined : -1}
            data-press-exempt
            onClick={() => changeImage(1)}
            aria-label={messages.nextPhoto}
            aria-hidden={keyboardGallery ? undefined : "true"}
            className={`${OWN_BUTTON_CLASS} right-1.5`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {/* Dots, not a fraction. "1 / 13" is bookkeeping; a row of dots says
              "there are more photos" and which one this is in a glance, and it
              is the shape every photo carousel has trained a thumb to expect.
              Capped at five with a sliding window, so a 14-photo gallery does
              not draw a ruler across the picture; the ends of a long gallery
              show as the window not moving any further.

              aria-hidden and pointer-events-none: decoration on top of the
              photo's link, the way the fraction badge was. The sr-only line
              below still speaks the exact count. */}
          <div
            data-slot="photo-dots"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-1.5 z-10 flex justify-center gap-1"
          >
            {Array.from({ length: dots.count }, (_, dot) => (
              <span
                key={dot}
                className={cn(
                  DOT_CLASS,
                  dots.start + dot === imageIndex
                    ? "bg-background"
                    : "bg-background/50",
                )}
              />
            ))}
          </div>
          <span
            // Named, because it is what says where the gallery is now that the
            // visible marker is dots with no text: the tests read this line,
            // and querying it by ".sr-only" meant reading whichever sr-only
            // node came first in the document.
            data-slot="photo-position"
            className="sr-only"
            aria-live={announceChanges || announceOwnChanges ? "polite" : undefined}
            aria-atomic={announceChanges || announceOwnChanges ? "true" : undefined}
          >
            {translate(locale, "photoCount", {
              current: imageIndex + 1,
              total: images.length,
            })}
          </span>
        </>
      )}
    </div>
  );
}
