"use client";

import {
  useEffect,
  useRef,
  useState,
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
import type { Animal } from "@posvoji/schema";
import { AnimalFacts } from "@/components/animal-dialog/animal-facts";
import { PhotoBloom } from "@/components/animal-dialog/photo-bloom";
import { PhotoSpread } from "@/components/animal-dialog/photo-spread";
import { StageWash } from "@/components/animal-dialog/photo-wash";
import { ShareButton } from "@/components/animal-dialog/share-button";
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
import { permittedImageUrls } from "@/lib/animal-images";
import { animalPath } from "@/lib/animal-path";
import { speciesLabel } from "@/lib/labels";
import type { ShelterLogos } from "@/lib/shelter-logos";

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
const CONTENT_CLASS =
  "fixed inset-0 z-50 flex flex-col text-sm text-popover-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:duration-0 max-sm:h-dvh max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:bg-popover max-sm:data-open:slide-in-from-bottom-4 max-sm:data-closed:slide-out-to-bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[92dvh] sm:w-[calc(100vw-3rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:pt-2 sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95";

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
  origin,
  siblingIds,
  reference,
  onNavigate,
  onClose,
  onSeeLongestWaiting,
}: {
  /** Undefined while nothing is open, and for an id no animal answers to. */
  animal: Animal | undefined;
  logos: ShelterLogos;
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
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragSnap = useRef<ReturnType<typeof animate> | null>(null);

  // A snap back that outlives the dialog would keep a frame loop alive.
  useEffect(() => () => dragSnap.current?.stop(), []);

  // Closing, or stepping to another animal, leaves no half-finished gesture
  // behind for the next one to inherit.
  useEffect(() => {
    dragSnap.current?.stop();
    dragStart.current = null;
    dragging.current = false;
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
  // The fan is remounted per animal so its photos start over, which means the
  // wash cannot live inside it: it would go out with the old animal and come
  // back from nothing. Held here instead, it is one continuous layer, and
  // stepping animals crossfades one colour into the next. On the way out it
  // keeps the last animal's colour and leaves with the dialog.
  const [washSource, setWashSource] = useState<string | undefined>(undefined);
  // The card shows an animal's first photo, and so does the fan on the way in,
  // so that is the one the bloom carries across.
  const firstPhoto = lastAnimal && permittedImageUrls(lastAnimal.images)[0];

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
    // The gesture belongs to the full-screen phone layout. From sm up the
    // card scrolls instead, so the shell's scrollTop says nothing.
    if (!window.matchMedia(PHONE_LAYOUT).matches) return;
    if ((contentRef.current?.scrollTop ?? 0) > 0) return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragging.current = false;
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const dy = event.clientY - start.y;
    const dx = event.clientX - start.x;
    // A sideways swipe belongs to the photos, and an upward one to the scroll.
    if (!dragging.current) {
      if (dy < 8 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
      dragging.current = true;
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
    const start = dragStart.current;
    dragStart.current = null;
    if (!dragging.current || !start) return;
    dragging.current = false;
    if (event.clientY - start.y > DRAG_CLOSE_PX) {
      dragY.set(0);
      onClose();
      return;
    }
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  // A cancelled pointer is not a decision, so it always snaps back.
  function cancelDrag() {
    dragStart.current = null;
    dragging.current = false;
    dragSnap.current = animate(dragY, 0, DRAG_SPRING);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        {/* Outside the content on purpose: the content carries the zoom, and a
            copy aimed at viewport coordinates cannot sit inside a transform. */}
        <PhotoBloom from={origin?.photo} source={firstPhoto} />
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
                <StageWash source={washSource} status={lastAnimal.status} />
                {/* Keyed, so stepping to another animal starts its photos
                    over rather than inheriting the last one's state. */}
                <PhotoSpread
                  key={lastAnimal.id}
                  animal={lastAnimal}
                  onWashSource={setWashSource}
                />
              </m.div>

              <div className={CARD_CLASS}>
                <m.div
                  className="space-y-1"
                  variants={CONTENT_ITEM}
                  transition={transition}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-lg">{name}</DialogTitle>
                    <StatusBadge
                      status={lastAnimal.status}
                      locale={locale}
                    />
                    <span className="ms-auto flex items-center gap-1">
                      <ShareButton
                        path={animalPath(lastAnimal, locale)}
                        name={name}
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
                  view without scrolling far. */}
              {lastAnimal.source.sourceUrl && (
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
