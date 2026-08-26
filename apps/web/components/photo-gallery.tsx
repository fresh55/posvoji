"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { Animal } from "@posvoji/schema";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  adjacentImageUrls,
  permittedImageUrls,
  photoDotWindow,
} from "@/lib/animal-images";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Shared with the dialog's photo spread, so both sets of chevrons behave and
// look the same. The spread drives its own reveal off its own ancestor, so the
// group here is unqualified and this constant carries no pointer-events of its
// own; see OWN_BUTTON_CLASS below for what this component uses.
export const GALLERY_BUTTON_CLASS =
  "absolute inset-y-0 z-10 my-auto rounded-full bg-background/80 opacity-0 shadow-xs backdrop-blur-sm transition-opacity hover:bg-background active:translate-y-0! group-hover:opacity-100 group-focus-within:opacity-100";

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
const DOT_CLASS = "size-1.5 rounded-full shadow-xs transition-colors";

type SwipeStart = { x: number; y: number; time: number; width: number };

// A drag past this share of the frame's width commits the swipe even at no
// particular speed; a flick short of that distance still commits if it was
// quick enough. Either heuristic alone was too easy to trigger by accident or
// too hard to pull off on purpose, so a swipe only has to clear one of them.
const SWIPE_DISTANCE_RATIO = 0.22;
const SWIPE_VELOCITY_PX_MS = 0.5;
// The flick heuristic used to be velocity and nothing else, which let a 2px
// twitch over 3ms clear 0.5px/ms and commit. That is a tap with finger drift,
// and the result was the worst of both: the photo advanced and the tap that
// meant to open the animal was swallowed.
const MIN_SWIPE_PX = 24;
// How far a gesture has to travel before it is allowed to declare its axis.
const AXIS_SLOP_PX = 8;
// A pointer that crosses the photo and leaves again was not asking for the
// next picture. Mean image weight is about 52KB and a mouse can cross a whole
// grid row in a second, so an ungated preload on enter pulled megabytes.
const PRELOAD_DWELL_MS = 150;

type PhotoGalleryProps = {
  animal: Animal;
  sizes: string;
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
  /** Above-the-fold cards, so the largest image on screen is not lazy. */
  priority?: boolean;
};

export function PhotoGallery({
  animal,
  sizes,
  className,
  tone,
  href,
  onNavigate,
  index,
  onIndexChange,
  priority = false,
}: PhotoGalleryProps) {
  const images = permittedImageUrls(animal.images);
  const [ownIndex, setOwnIndex] = useState(0);
  const swipeStart = useRef<SwipeStart | null>(null);
  const suppressImageLink = useRef(false);
  const preloadedImages = useRef(new Set<string>());
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
  const [announce, setAnnounce] = useState(false);
  // The card owns nothing and keeps its own index; the dialog shares one index
  // between the swipeable photo and the thumbnails under it.
  const imageIndex = index ?? ownIndex;
  const image = images[imageIndex];
  const hasGallery = images.length > 1;
  const dots = photoDotWindow(images.length, imageIndex);

  useEffect(() => {
    return () => window.clearTimeout(preloadTimer.current);
  }, []);

  function setImageIndex(next: number) {
    // Only a gallery the visitor has actually driven gets to speak. The grid
    // mounts one of these per multi-photo card, which was 425 live regions in
    // one document, and a filter change inserts new nodes that already carry
    // their text. result-count.tsx gates the same shape the same way.
    setAnnounce(true);
    if (index === undefined) setOwnIndex(next);
    onIndexChange?.(next);
  }

  function preloadAdjacent(index: number) {
    for (const source of adjacentImageUrls(images, index)) {
      if (preloadedImages.current.has(source)) continue;
      preloadedImages.current.add(source);
      const preload = new window.Image();
      // The visitor has not asked for these yet, so they must not compete with
      // the photo they are actually looking at.
      preload.fetchPriority = "low";
      preload.decoding = "async";
      preload.src = source;
    }
  }

  function changeImage(direction: -1 | 1) {
    if (!hasGallery) return;
    const nextIndex = (imageIndex + direction + images.length) % images.length;
    preloadAdjacent(nextIndex);
    setImageIndex(nextIndex);
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
      if (Math.hypot(distanceX, distanceY) < AXIS_SLOP_PX) return;
      // A vertical drag belongs to the page's own scroll, not to the photo.
      axis.current = Math.abs(distanceX) > Math.abs(distanceY) ? "x" : "y";
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

    const velocity = Math.abs(distanceX) / elapsed;
    const farEnough = Math.abs(distanceX) > start.width * SWIPE_DISTANCE_RATIO;
    const flicked =
      velocity > SWIPE_VELOCITY_PX_MS && Math.abs(distanceX) > MIN_SWIPE_PX;
    if (!farEnough && !flicked) return;

    changeImage(distanceX < 0 ? 1 : -1);
  }

  function handleSwipeCancel() {
    suppressImageLink.current = false;
    endGesture();
  }

  function handlePointerEnter() {
    window.clearTimeout(preloadTimer.current);
    preloadTimer.current = window.setTimeout(
      () => preloadAdjacent(imageIndex),
      PRELOAD_DWELL_MS,
    );
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
  const surface = {
    onPointerDown: startSwipe,
    onPointerMove: moveSwipe,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onPointerUp: finishSwipe,
    onPointerCancel: handleSwipeCancel,
    onLostPointerCapture: handleSwipeCancel,
    // tone lands here and not on the wrapper. On the wrapper every child
    // inherited it, so a settled animal's chevrons and its position dots were
    // dimmed and desaturated along with the photograph. Here it reaches the
    // picture and the "no photo yet" note and stops.
    className: cn("absolute inset-0 touch-pan-y touch-pinch-zoom", tone),
    style: {
      transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
      transition:
        dragging || shouldReduceMotion
          ? undefined
          : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
    },
  };

  const imageContent = image ? (
    <Image
      src={image}
      // Empty when the photo is a link, because that anchor is aria-hidden and
      // the card names the animal twice over already: in its heading and in
      // the link the heading sits inside. "Rex" is not a text alternative for
      // a photograph of Rex, and it does not change when the gallery does.
      alt={href ? "" : (animal.name ?? messages.unnamed)}
      fill
      // Inert while next.config.ts keeps images unoptimized: that emits a bare
      // <img> with no srcset, so there is one candidate at every width and
      // nothing for this to choose between. Kept because it is correct for the
      // day optimization is turned on, and wrong to silently drop until then.
      sizes={sizes}
      priority={priority}
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
      ) : (
        <div {...surface}>{imageContent}</div>
      )}

      {hasGallery && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            // Out of the tab order: two chevrons on every card came to 850 of
            // the grid's tab stops. The keyboard route through a gallery is
            // the arrow keys on the card's own link, which is one stop instead
            // of two and faster than pressing Enter on a disc.
            tabIndex={-1}
            // Read by the grid card, whose press feedback squeezes the whole
            // card. These turn the picture and open nothing, so they are held
            // out of it. Surfaces that do not squeeze ignore the attribute.
            data-press-exempt
            onClick={() => changeImage(-1)}
            aria-label={messages.previousPhoto}
            className={`${OWN_BUTTON_CLASS} left-1.5`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            tabIndex={-1}
            data-press-exempt
            onClick={() => changeImage(1)}
            aria-label={messages.nextPhoto}
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
            aria-live={announce ? "polite" : undefined}
            aria-atomic={announce ? "true" : undefined}
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
