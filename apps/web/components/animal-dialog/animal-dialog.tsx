"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, ExternalLink, XIcon } from "lucide-react";
import {
  LazyMotion,
  animate,
  domAnimation,
  m,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { DialogShareButton } from "@/components/animal-dialog/dialog-share-button";
import { PhotoBloom } from "@/components/animal-dialog/photo-bloom";
import { PhotoStage } from "@/components/animal-dialog/photo-stage";
import { ShelterBlock } from "@/components/animal-dialog/shelter-block";
import { useI18n } from "@/components/i18n-provider";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClientAnimal } from "@/lib/animal";
import { animalPath, photoFromSearch } from "@/lib/animal-path";
import { speciesLabel } from "@/lib/labels";
import {
  getSearchSnapshot,
  getServerSearchSnapshot,
  subscribeToLocation,
} from "@/lib/location-search";
import type { ShelterLogos } from "@/lib/shelter-logos";
import type { ShelterPhones } from "@/lib/shelters";

/** Where a photo was standing on screen, in viewport coordinates. */
export type DialogPhotoRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Viewport coordinates of the card the dialog was opened from. The point is
 * what the zoom grows out of; the photo box is what the fan's first picture
 * travels from, and is absent when there was no card to measure.
 */
export type DialogOrigin = {
  x: number;
  y: number;
  photo?: DialogPhotoRect;
};

// Written fresh rather than layered on DialogContent: the default is a
// centered max-w-lg box, and this is a full-screen takeover on phones that
// only becomes a centered box from sm up. From sm the surface itself moves to
// the info card, because the photos have to spill out above it.
// The phone scrolls the whole dialog; from sm the shell stops scrolling and
// hands that job to the card, so the scrollbar belongs to the card it scrolls
// rather than hanging in the air beside the photos.
// motion-reduce:duration-0, not motion-reduce:animate-none: see the comment
// on DialogOverlay in ui/dialog.tsx for why the animate-none guard does not
// actually take effect on a data-open:/data-closed: element.
// max-sm:overflow-x-hidden is policy, not the fix for any one layer: naming
// only the vertical axis leaves the other computing to auto, and on a phone
// the dialog is the viewport, so it never scrolls sideways. Decoration that
// overhangs still clips itself where it stands (photo-wash.tsx). Anything wide
// enough to need reading, a long URL or a table, has to wrap or scroll inside
// its own box, because this boundary will not offer it a scrollbar.
const CONTENT_CLASS =
  "fixed inset-0 z-50 flex flex-col text-sm text-popover-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 max-sm:h-dvh max-sm:overflow-x-hidden max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:bg-popover max-sm:data-open:slide-in-from-bottom-4 max-sm:data-closed:slide-out-to-bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[92dvh] sm:w-[calc(100vw-3rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:pt-2 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95";

// The card carries what used to be the dialog's own frame, and pulls itself up
// under the photos so the fan overlaps its top edge. The wide top padding is
// the band the fan is allowed to hang into; the title row starts below it.
const CARD_CLASS =
  "relative flex flex-1 flex-col gap-4 p-4 sm:-mt-4 sm:min-h-0 sm:overflow-y-auto sm:rounded-ui sm:border sm:bg-popover sm:bg-clip-padding sm:p-6 sm:pt-12 sm:text-popover-foreground sm:shadow-lg";

// Same round, translucent language as the photo chevrons, one level up: these
// walk the list of animals rather than the list of photos. Centred by margin
// rather than by transform, because the button's own press animation writes
// the same translate variable.
const ANIMAL_NAV_CLASS =
  "absolute inset-y-0 z-40 my-auto hidden size-9 rounded-full bg-background/80 shadow-xs backdrop-blur-sm hover:bg-background sm:inline-flex";

// The same two steps for a phone, which has neither the edge arrows above nor
// the PageUp and PageDown keys they double for: without these the only way to
// the next animal is to close the dialog and find the next card. They ride the
// title row beside the share button rather than the edges of the screen, where
// the fan's own chevrons and the close button already are. No backdrop blur:
// they sit on the card's own ground, not over a photograph. size-11 is the
// 44px floor every other control on the phone layout is held to (the share
// button beside them does the same); icon-sm alone would be 32px.
const PHONE_NAV_CLASS =
  "size-11 rounded-full bg-background/80 shadow-xs hover:bg-background sm:hidden";

const DRAG_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.6,
} as const;

// Far enough that no ordinary scroll flick throws the dialog away.
const DRAG_CLOSE_PX = 140;

// The layout the dismiss gesture was designed for.
const PHONE_LAYOUT = "(max-width: 639px)";

const REVEAL_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const CONTENT_STAGGER = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04 } },
};

const CONTENT_ITEM = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: REVEAL_SPRING },
};

// The desktop box is centered, so the card's viewport center reads as an
// offset from the middle of the box the zoom grows out of.
function zoomOrigin(origin: DialogOrigin | undefined): string | undefined {
  if (!origin || typeof window === "undefined") return undefined;
  const x = Math.round(origin.x - window.innerWidth / 2);
  const y = Math.round(origin.y - window.innerHeight / 2);
  return `calc(50% + ${x}px) calc(50% + ${y}px)`;
}

export function AnimalDialog({
  animal,
  logos,
  phones,
  origin,
  siblingIds,
  reference,
  onNavigate,
  onClose,
  onSeeLongestWaiting,
}: {
  /** Undefined while nothing is open, and for an id no animal answers to. */
  animal: ClientAnimal | undefined;
  logos: ShelterLogos;
  /** Registry phones for the shelter block's secondary call to action. */
  phones: ShelterPhones;
  origin?: DialogOrigin;
  /** The ids on screen, in the order they are shown. */
  siblingIds: string[];
  /** The dataset's build time, shared with the cards behind the dialog. */
  reference: Date;
  onNavigate: (id: string) => void;
  onClose: () => void;
  /** Hands the long-stay callout a way to the longest-waiting sort. */
  onSeeLongestWaiting?: () => void;
}) {
  const { locale, messages } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const open = animal !== undefined;
  const contentRef = useRef<HTMLDivElement>(null);
  // A phone can throw the dialog away downwards. The offset lives in a motion
  // value so a finger drag does not re-render the dialog on every frame.
  const dragY = useMotionValue(0);
  // Every finger currently on the glass, counted the way the lightbox counts
  // its own. A boolean saying only that a second finger had arrived could not
  // be cleared correctly: any release had to clear it, so with three fingers
  // down, lifting one re-armed the pull while two were still pressing.
  const pointers = useRef(new Set<number>());
  // The pull in flight: the finger it belongs to, where that finger started,
  // and whether it has passed the axis test. A phone can have two fingers on
  // the glass at once, and without an owner the second one moved and ended the
  // first one's gesture: the release was then measured against a start point
  // the other finger had set, which is a dismissal nobody performed. Null while
  // no finger is pulling.
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    committed: boolean;
  } | null>(null);
  const dragSnap = useRef<ReturnType<typeof animate> | null>(null);

  // A snap back that outlives the dialog would keep a frame loop alive.
  useEffect(() => () => dragSnap.current?.stop(), []);

  // Closing, or stepping to another animal, leaves no half-finished gesture
  // behind for the next one to inherit.
  useEffect(() => {
    dragSnap.current?.stop();
    pointers.current.clear();
    drag.current = null;
    dragY.set(0);
  }, [animal, dragY]);

  // Android's back gesture calls history.back(), same as the routing hook's
  // own close button. A dialog opened by a card click already has an entry
  // pushed for it (window.history.state.animal) and the gesture closes it
  // correctly. A dialog reached straight by a link has nothing local to pop,
  // and the gesture leaves the site instead of closing the dialog. Pushing a
  // throwaway entry here guarantees there is always one to consume, whatever
  // way the dialog was opened.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia(PHONE_LAYOUT).matches) return;
    if (window.history.state?.animal) return;

    window.history.pushState(
      { ...window.history.state, mobileDialogGesture: true },
      "",
    );

    function handlePopState() {
      onClose();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [open, onClose]);

  // Radix hands focus back to a trigger, and a dialog driven by the URL has
  // none. What the visitor left behind is the card they clicked.
  const returnFocus = useRef<HTMLElement | null>(null);
  // The closing animation still needs something to draw, and by then the
  // selection is already gone, so the last animal shown stays behind for it.
  const [lastAnimal, setLastAnimal] = useState(animal);
  if (animal && animal !== lastAnimal) setLastAnimal(animal);
  // Radix announces the title on open and never again, so stepping to another
  // animal changed every word in the dialog in silence. The name goes through a
  // live region instead. Adjusted during render the way lastAnimal above is.
  const [announced, setAnnounced] = useState<{
    id: string | undefined;
    name: string;
  }>({ id: animal?.id, name: "" });
  if (announced.id !== animal?.id) {
    setAnnounced({
      id: animal?.id,
      // Silent on the way in, because the title has just been announced, and
      // silent on the way out. Only a step from one animal to another is news.
      name:
        animal && announced.id !== undefined
          ? (animal.name ?? messages.unnamed)
          : "",
    });
  }
  // Which photo the fan has in front, so the share sheet hands over the one
  // the visitor is looking at rather than always the first. A motion value and
  // not state: only the share button reads it, and a step must not re-render
  // the card. DialogShareButton subscribes to it and is the only thing that
  // renders again when the fan turns a photo.
  const shownPhoto = useMotionValue(0);
  const openedId = animal?.id;
  const reportPhoto = useCallback(
    (index: number) => shownPhoto.set(index),
    [shownPhoto],
  );
  // The number belongs to the animal it was counted on, so it is cleared as
  // that animal leaves rather than as the next one arrives: React runs every
  // cleanup in a commit before any of that commit's new effects, so the fan
  // mounting for the next animal still gets the last word and a link opened on
  // ?foto= is not zeroed by its own arrival.
  useEffect(() => {
    if (!openedId) return;
    return () => shownPhoto.jump(0);
  }, [openedId, shownPhoto]);

  // Which photo a shared link asked to open on. Read off the same store the
  // dialog's own address comes from, whose server snapshot is "": nothing is
  // open on the server, so the fan is first mounted once the location can be
  // read, and it takes the number from there. Never read again after that, so
  // stepping through the photos does not fight the parameter.
  const search = useSyncExternalStore(
    subscribeToLocation,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const askedPhoto = useMemo(() => photoFromSearch(search), [search]);

  // The card shows an animal's first photo, and so does the fan on the way in,
  // so that is the one the bloom carries across.
  const firstPhoto = lastAnimal?.images[0];

  if (!lastAnimal) return null;

  const name = lastAnimal.name ?? messages.unnamed;
  // The subtitle carries what the fact badges below it do not: the species and
  // the breed. Sex and age used to be repeated here, one line above their own
  // badges, and the two "10 let" read as a mistake. Slovenian writes breed
  // names lowercase, and the providers deliver them in every casing.
  const breed =
    lastAnimal.breed && locale === "sl"
      ? lastAnimal.breed.toLocaleLowerCase("sl")
      : lastAnimal.breed;
  const subtitle = [speciesLabel(lastAnimal.species, locale), breed]
    .filter(Boolean)
    .join(" · ");
  const transition = shouldReduceMotion ? { duration: 0 } : undefined;

  // Whether the phone gets the sticky bar at the bottom of the dialog. There
  // has to be a button in the card for it to be a mirror of, and an adopted
  // animal has none: the shelter block replaces the call to action with the
  // good news and a quiet text link, while this bar went on giving a settled
  // animal a full-width primary "open the listing" the phone could not miss.
  // The two conditions are shelter-block.tsx's own, so the pair agree: when
  // the bar is absent the box keeps its own element.
  const stickyCta =
    lastAnimal.status !== "adopted" && Boolean(lastAnimal.source.sourceUrl);

  // An animal the current filters hide is still reachable by link, and then
  // there is no list to step through, so the arrows stay away. Closing counts
  // as nothing open, so they leave with the dialog.
  const place = animal ? siblingIds.indexOf(animal.id) : -1;
  const previousId = place > 0 ? siblingIds[place - 1] : undefined;
  const nextId =
    place >= 0 && place < siblingIds.length - 1
      ? siblingIds[place + 1]
      : undefined;

  // Page keys walk animals. The arrows belong to the photos, and taking them
  // here would fight the fan.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    event.preventDefault();
    const target = event.key === "PageUp" ? previousId : nextId;
    if (target) onNavigate(target);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (shouldReduceMotion || event.pointerType === "mouse") return;
    pointers.current.add(event.pointerId);
    // A pull arms on a lone finger and on nothing else. A second finger takes
    // it away from the first rather than joining it or inheriting it: what two
    // fingers mean here is a pinch, which the photo stage offers on purpose,
    // and neither of them is pulling the dialog anywhere. The count is what
    // keeps it away until the glass is clear again, because a press is only
    // the first of a hand while nothing else is down.
    if (pointers.current.size !== 1) {
      if (drag.current) {
        drag.current = null;
        dragSnap.current = animate(dragY, 0, DRAG_SPRING);
      }
      return;
    }
    // The gesture belongs to the full-screen phone layout. From sm up the
    // card scrolls instead, so the shell's scrollTop says nothing.
    if (!window.matchMedia(PHONE_LAYOUT).matches) return;
    if ((contentRef.current?.scrollTop ?? 0) > 0) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      committed: false,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    const dy = event.clientY - pull.y;
    const dx = event.clientX - pull.x;
    // A sideways swipe belongs to the photos, and an upward one to the scroll.
    if (!pull.committed) {
      if (dy < 8 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      pull.committed = true;
      // Capture only once the gesture is committed, so a finger that leaves
      // the element still reports its release. Capturing on pointerdown, the
      // way this used to, retargeted every later pointer event at this
      // element before anyone knew the gesture's axis, which starved the
      // fan's own swipe of its move and release events. Until the commit the
      // touch pointer is implicitly captured to whatever was pressed, and
      // those events bubble here anyway.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    dragY.set(Math.max(0, dy * 0.6));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    // The finger is off the glass whoever it belonged to, and the count is
    // what the next press is read against.
    pointers.current.delete(event.pointerId);
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    drag.current = null;
    if (!pull.committed) return;
    if (event.clientY - pull.y > DRAG_CLOSE_PX) {
      dragY.set(0);
      onClose();
      return;
    }
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  // A cancelled pointer is not a decision, so it always snaps back. Only the
  // owner's cancellation counts: a second finger the browser takes away has
  // nothing to give back.
  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const pull = drag.current;
    if (!pull || event.pointerId !== pull.pointerId) return;
    drag.current = null;
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        {/* Outside the content on purpose: the content carries the zoom, and a
            copy aimed at viewport coordinates cannot sit inside a transform. */}
        <PhotoBloom from={origin?.photo} photo={firstPhoto} />
        <DialogPrimitive.Content
          ref={contentRef}
          data-slot="animal-dialog"
          className={CONTENT_CLASS}
          style={{ transformOrigin: zoomOrigin(origin) }}
          onKeyDown={handleKeyDown}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
            returnFocus.current = null;
          }}
        >
          {/* Mounted empty for as long as the dialog is open, so the name of
              the animal stepped to arrives as a change in a region that was
              already there. */}
          <span
            data-slot="animal-announcement"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {announced.name}
          </span>

          {/* On a phone the close button rides over the photo; on a wider
              screen it belongs on the card's own title line. */}
          <DialogPrimitive.Close asChild>
            <Button
              data-slot="dialog-close-photo"
              variant="ghost"
              size="icon-sm"
              // fixed, not absolute: the phone scrolls the whole dialog, and
              // an absolute button is laid out in that scrollable content, so
              // it left the screen with the photo about 80px in and the only
              // visible way out went with it. The entrance keeps a transform
              // on the content, which makes this fixed to the content box
              // rather than to the viewport, and that box is inset-0 either
              // way. What changes is that it no longer rides the scroll.
              className="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-40 size-11 rounded-full bg-background/80 shadow-xs backdrop-blur-sm hover:bg-background sm:hidden"
            >
              <XIcon aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogPrimitive.Close>

          {previousId && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => onNavigate(previousId)}
              aria-label={messages.previousAnimal}
              className={`${ANIMAL_NAV_CLASS} left-0 -translate-x-1/2`}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          )}
          {nextId && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => onNavigate(nextId)}
              aria-label={messages.nextAnimal}
              className={`${ANIMAL_NAV_CLASS} right-0 translate-x-1/2`}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          )}

          <LazyMotion features={domAnimation}>
            <m.div
              data-slot="animal-dialog-body"
              className="flex min-h-full flex-col sm:min-h-0"
              style={{ y: dragY }}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              variants={CONTENT_STAGGER}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="shown"
              transition={transition}
            >
              <m.div
                className="relative z-10 shrink-0"
                variants={CONTENT_ITEM}
                transition={transition}
              >
                {/* The wash and the fan, with everything a photo step changes
                    held inside them. Not keyed: the wash has to outlive the
                    fan's own per-animal remount for one animal's colour to
                    fade into the next one's. */}
                <PhotoStage
                  animal={lastAnimal}
                  initialIndex={askedPhoto}
                  onIndexChange={reportPhoto}
                />
              </m.div>

              <div className={CARD_CLASS}>
                {/* The title line stays put while the card scrolls under it.

                    The card is its own scrollport on sm and up, and the close
                    button lives on this line, so on a short viewport the only
                    visible way out scrolled away with the name: at 1440x700
                    with the description expanded, both sat 54px above the
                    card's top edge with the dialog scrolled to the bottom.
                    That is the same failure the fixed close on the photo was
                    written for on phones, one breakpoint up, and the note on
                    that button says so in as many words.

                    Sticky rather than a second fixed button, because the card
                    already has the right control in the right place and only
                    needed it to stay: one close button, where it has always
                    been. z-20 clears the photo spread's z-10, so the bar
                    passes over the fan's overhang instead of under it, and
                    the negative inset plus matching padding lets the popover
                    ground span the card's full width rather than leaving the
                    text to scroll through a 24px gutter beside it.

                    sm: only. The phone scrolls the whole dialog rather than
                    this box, has no scrollport for a sticky child to hold
                    itself against, and is already answered by the fixed
                    button on the photo. */}
                <m.div
                  className="space-y-1 sm:sticky sm:-top-12 sm:z-20 sm:-mx-6 sm:-mt-6 sm:bg-popover sm:px-6 sm:pt-6 sm:pb-2"
                  variants={CONTENT_ITEM}
                  transition={transition}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-lg">{name}</DialogTitle>
                    <StatusBadge
                      status={lastAnimal.status}
                      locale={locale}
                    />
                    {/* One unit, so a row that wraps takes the whole group of
                        controls to the next line rather than splitting it. */}
                    <span className="ms-auto flex items-center gap-1">
                      {previousId && (
                        <Button
                          type="button"
                          data-slot="animal-nav-phone"
                          data-direction="previous"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => onNavigate(previousId)}
                          aria-label={messages.previousAnimal}
                          className={PHONE_NAV_CLASS}
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                        </Button>
                      )}
                      {nextId && (
                        <Button
                          type="button"
                          data-slot="animal-nav-phone"
                          data-direction="next"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => onNavigate(nextId)}
                          aria-label={messages.nextAnimal}
                          className={PHONE_NAV_CLASS}
                        >
                          <ChevronRight className="size-4" aria-hidden />
                        </Button>
                      )}
                      <DialogShareButton
                        path={animalPath(lastAnimal, locale)}
                        name={name}
                        photo={shownPhoto}
                      />
                      <DialogPrimitive.Close asChild>
                        <Button
                          data-slot="dialog-close-card"
                          variant="ghost"
                          size="icon-sm"
                          className="hidden sm:inline-flex"
                        >
                          <XIcon aria-hidden />
                          <span className="sr-only">{messages.close}</span>
                        </Button>
                      </DialogPrimitive.Close>
                    </span>
                  </div>
                  <DialogDescription>{subtitle}</DialogDescription>
                </m.div>

                <m.div variants={CONTENT_ITEM} transition={transition}>
                  {/* Keyed, so the health row's expanded state starts over
                      with each animal. */}
                  <AnimalFacts
                    key={lastAnimal.id}
                    animal={lastAnimal}
                    reference={reference}
                  />
                </m.div>

                {/* Identity above, action below: the shelter box anchors the
                    bottom of the card with a little extra air over it. */}
                <m.div
                  className="mt-2"
                  variants={CONTENT_ITEM}
                  transition={transition}
                >
                  <ShelterBlock
                    animal={lastAnimal}
                    logos={logos}
                    phones={phones}
                    reference={reference}
                    // The sticky bar below repeats this box's button on the
                    // phone, so the box keeps its own for sm and up only.
                    ctaMirrored
                    onSeeLongestWaiting={onSeeLongestWaiting}
                  />
                </m.div>
              </div>

              {/* The card's own CTA is the last thing in a long scroll on a
                  phone. This mirrors it at the bottom of the screen instead,
                  so the one action that matters is always a thumb-reach away.
                  Hidden from sm up, where the card's own button is already in
                  view without scrolling far.

                  What it is gated on is above; see stickyCta. */}
              {stickyCta && (
                <div
                  data-slot="sticky-cta"
                  className="sticky inset-x-0 bottom-0 z-30 mt-auto border-t bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden"
                >
                  <Button asChild size="sm" className="h-11 w-full">
                    <a
                      href={lastAnimal.source.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {messages.viewOriginalListing}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                </div>
              )}
            </m.div>
          </LazyMotion>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
