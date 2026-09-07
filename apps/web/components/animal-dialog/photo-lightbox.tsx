"use client";

import { LightboxWash } from "@/components/animal-dialog/photo-wash";
import { AnimalPhoto } from "@/components/animal-photo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, LayoutGrid, XIcon } from "lucide-react";
import { m } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, type PointerEvent } from "react";
import { framePose } from "./lightbox-geometry";
import {
  useLightboxControls,
  type PhotoLightboxProps,
} from "./use-lightbox-controls";

const LIGHTBOX_BUTTON_CLASS =
  "absolute z-10 rounded-full bg-background/80 shadow-xs backdrop-blur-sm hover:bg-background active:translate-y-0!";

// Slow enough to read as one photo travelling, quick enough that nobody waits
// for it. Barely underdamped, so it lands rather than wobbles.
const MORPH_SPRING = {
  type: "spring",
  stiffness: 300,
  damping: 32,
  mass: 0.9,
} as const;

// How many photos an animal needs before the lightbox offers an overview of
// them. The fan already shows five at once, so up to five the overview would
// only repeat what is on the page behind it; six is where a grid starts saying
// something the fan does not.
export { SHEET_FROM } from "./lightbox-gesture-options";

function stopPointer(event: PointerEvent<HTMLDivElement>) {
  event.stopPropagation();
}

// A nested dialog rather than a bare overlay: Radix stacks the layers, so
// Escape closes this one and leaves the animal open underneath.
export function PhotoLightbox(props: PhotoLightboxProps) {
  const { open, images, title, originRect, returnFocusFallback } = props;
  const {
    messages,
    t,
    shouldReduceMotion,
    shown,
    image,
    many,
    hasSheet,
    setChosenView,
    sheet,
    photoX,
    photoY,
    photoScale,
    scrimOpacity,
    zoomed,
    photoBox,
    handleOpenChange,
    showSheet,
    goTo,
    showPhoto,
    step,
    startTouch,
    moveTouch,
    endTouch,
    startDrag,
    moveDrag,
    endDrag,
    cancelTouch,
    cancelDrag,
    swallowDraggedClick,
    frameRef,
  } = useLightboxControls(props);
  // The photo that was clicked is where focus belongs on the way out.
  const returnFocus = useRef<HTMLElement | null>(null);
  // An animal with no permitted photo at all. The index is clamped above, so
  // this is the empty set and nothing else: there is no photograph to open a
  // full-screen view of, and no caller that asks for one.
  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        {/* asChild so the scrim can be driven by a motion value: a pull-down
            is the photo being thrown away, and the ground behind it goes with
            it. Radix's own open and close animations still run, and while
            either is running the animation's opacity is what shows. */}
        <DialogOverlay
          asChild
          className="z-60 bg-black/80 supports-backdrop-filter:backdrop-blur-none"
        >
          <m.div style={{ opacity: scrimOpacity }} />
        </DialogOverlay>
        <DialogPrimitive.Content
          data-slot="photo-lightbox"
          className="fixed inset-0 z-60 flex items-center justify-center p-4 outline-none sm:p-10"
          // React bubbles a portal's events up the component tree, not the
          // DOM, and the animal dialog this is mounted inside reads the same
          // pointer for its own pull-to-close. The photo box's touch-none
          // keeps the browser from taking the finger, so without this the
          // pull that throws the lightbox away carried on into the dialog
          // underneath and threw that away too.
          onPointerDown={stopPointer}
          onPointerMove={stopPointer}
          onPointerUp={stopPointer}
          onPointerCancel={stopPointer}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const saved = returnFocus.current;
            returnFocus.current = null;
            // isConnected, because a detached element takes focus in silence
            // and leaves it on the body, with the dialog's own keys dead.
            const target = saved?.isConnected ? saved : returnFocusFallback?.();
            if (!target) return;
            event.preventDefault();
            target.focus({ preventScroll: true });
          }}
          onKeyDown={(event) => {
            // The animal dialog this is mounted in walks animals on the page
            // keys, and React bubbles a portal's events up the component tree:
            // a page key pressed in here swapped the animal underneath, which
            // took the lightbox away with it and left focus on the shell. The
            // key stops here whichever view is showing. Nothing scrolls behind
            // a full-screen layer either, so the default goes with it; the
            // sheet keeps its own, which is the container it scrolls.
            if (event.key === "PageUp" || event.key === "PageDown") {
              event.stopPropagation();
              if (!sheet) event.preventDefault();
              return;
            }
            // In the sheet the arrows belong to the scroll container: there is
            // no single photo to step, and preventing the default would leave
            // a keyboard visitor unable to scroll the grid. The numbers go the
            // same way, for the same reason: the grid already shows every
            // photo, and each tile is a button of its own.
            if (!many || sheet) return;
            // A number is the way across a set the arrows walk one at a time.
            // Nine is where it stops: a tenth photo would need a second key
            // and a window to press it in, which is a mode, not a shortcut.
            // With a modifier held the key is the browser's (ctrl+1 is a tab),
            // and taking it here would be taking it from the visitor.
            if (
              /^[1-9]$/.test(event.key) &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              const wanted = Number(event.key) - 1;
              // A photo the animal does not have is not a photo to jump to,
              // and swallowing the key would say it was.
              if (wanted >= images.length) return;
              event.preventDefault();
              goTo(wanted);
              return;
            }
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            step(event.key === "ArrowLeft" ? -1 : 1);
          }}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>

          {/* The same echo the stage has, on the scrim rather than the page.
              It stays under the photo and under the controls, so the only
              thing it changes is the empty ground the photo is matted on. */}
          <LightboxWash source={image.src} />

          {/* Only the way in travels. On the way out Radix takes the content
              away with its own fade, which is what it already did, and is the
              price of leaving the focus trap and Escape alone. */}
          <m.div
            // The box both views are drawn in, which is what a trackpad
            // gesture is measured against.
            ref={frameRef}
            data-slot="photo-lightbox-frame"
            className="relative h-full w-full"
            initial={
              shouldReduceMotion ? false : (framePose(originRect) ?? false)
            }
            animate={{ x: 0, y: 0, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : MORPH_SPRING}
          >
            {sheet ? (
              // The whole set at once, in the frame the single photo had. The
              // container scrolls and nothing else does, so the chrome around
              // it stays where it is; it is not focusable itself, because a
              // tab stop that only scrolls sits in front of every tile.
              <div
                data-slot="photo-lightbox-sheet"
                // The chrome sits over the top of this frame, so the first row
                // starts below it rather than under it. The padding is the
                // same max() the buttons are placed with, plus their height
                // and the grid's own gap, less the frame's inset.
                className="h-full w-full overflow-y-auto overscroll-contain pt-[calc(max(1rem,env(safe-area-inset-top))+2.25rem)] sm:pt-4"
              >
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {images.map((photo, position) => (
                    <button
                      key={`${position}-${photo.src}`}
                      type="button"
                      onClick={() => showPhoto(position)}
                      aria-label={t("showPhoto", { n: position + 1 })}
                      // The tile the sheet was opened from. aria-current says
                      // it in the tree, the ring says it on the screen, and
                      // neither stands alone.
                      aria-current={position === shown ? "true" : undefined}
                      className={cn(
                        "relative aspect-[4/3] overflow-hidden rounded-ui bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        position === shown && "ring-2 ring-background",
                      )}
                    >
                      <AnimalPhoto
                        photo={photo}
                        // The button around it is already labelled, so a text
                        // alternative here would be read twice.
                        alt=""
                        // Three tiles across a phone, five on a wide screen,
                        // with the gaps taken off.
                        sizes="(max-width: 639px) 30vw, (max-width: 1023px) 22vw, 18vw"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* touch-none because every touch gesture over this box is now
                 the lightbox's own: the pinch, the pan, the swipe and the
                 pull-down that closes. It is a full-screen fixed layer with
                 nothing behind it to scroll, so there is nothing left for the
                 browser to do with a finger here. The contact sheet keeps its
                 own scrolling. */
              <div
                ref={photoBox}
                data-slot="photo-lightbox-photo"
                // jsdom runs no frame loop and so cannot see the transform the
                // motion values write. This is the fact the gesture tests read
                // instead, and it is the same one the view branches on.
                data-zoomed={zoomed ? "true" : "false"}
                className="relative h-full w-full touch-none overflow-hidden"
                // Touch and mouse both start here and each handler turns the
                // other's pointer away, so the double tap and the drag never
                // read the same gesture.
                onPointerDown={(event) => {
                  startTouch(event);
                  startDrag(event);
                }}
                onPointerMove={(event) => {
                  moveTouch(event);
                  moveDrag(event);
                }}
                onPointerUp={(event) => {
                  endTouch(event);
                  endDrag(event);
                }}
                onPointerCancel={(event) => {
                  cancelTouch(event);
                  cancelDrag(event);
                }}
                onClickCapture={swallowDraggedClick}
                // The browser's own image drag would otherwise stick a ghost
                // of the photograph to the cursor the moment the drag passes
                // the slop.
                onDragStart={(event) => event.preventDefault()}
              >
                <m.div
                  className="relative h-full w-full"
                  // Driven per frame by the gestures above. A transform origin
                  // is not set: the maths behind the pinch and the double tap
                  // is written against the middle of the box, which is where
                  // motion scales from.
                  style={{ x: photoX, y: photoY, scale: photoScale }}
                >
                  <AnimalPhoto
                    photo={image}
                    // The photograph is the whole of this view, so it carries a
                    // real alternative rather than the empty one the fan's
                    // thumbnails take. Nothing else here names it: the dialog's
                    // title is sr-only and the counter beside it is aria-hidden.
                    alt={t(many ? "photoAlt" : "photoAltSingle", {
                      name: title,
                      current: shown + 1,
                      total: images.length,
                    })}
                    // The full screen, which is what puts the top of the ladder
                    // on every phone and most desktops. That is the right answer
                    // here: this is the view somebody opened to look closely.
                    sizes="100vw"
                    // The photograph somebody is looking at, so it goes for at
                    // once and at the front of the queue. The fan behind has
                    // only seated five prints, and a step past them opened on a
                    // photo the browser was in no hurry to fetch. The tiles in
                    // the sheet keep their lazy loading: they are a grid of
                    // thumbnails, and the one being looked at is not among them.
                    eager
                    // object-contain leaves ground either side of the photo, and
                    // a cover-scaled placeholder would paint into it. The wash
                    // behind is what fills that ground.
                    blur={false}
                    // Nothing is cropped here, so there is no subject to bias
                    // towards: an object-position would only push a photo that
                    // fits entirely off the middle of its ground.
                    crop="center"
                    className="object-contain"
                    // Drawn only while this photo is the one that failed, which
                    // is a fact the photo itself keeps. The tiles in the sheet
                    // pass none and keep their own ground, the way every other
                    // surface does.
                    fallback={
                      // The photograph has taken itself out of the box, so what
                      // is left in this view is the scrim and the wash on it.
                      // One line saying why, and no retry button: reloading is
                      // the browser's own, and a button that may fail again is
                      // worse than a sentence that does not.
                      //
                      // white rather than the background token, which is the
                      // pair to a foreground ground and flips with the theme.
                      // This scrim is bg-black/80 in both themes, so the text
                      // that sits on it does not flip either.
                      <p
                        data-slot="photo-lightbox-unavailable"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80"
                      >
                        {messages.photoUnavailable}
                      </p>
                    }
                  />
                </m.div>
              </div>
            )}
          </m.div>

          <DialogPrimitive.Close asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className={`${LIGHTBOX_BUTTON_CLASS} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] size-11 sm:top-4 sm:right-4 sm:size-9`}
            >
              <XIcon aria-hidden />
              <span className="sr-only">{messages.close}</span>
            </Button>
          </DialogPrimitive.Close>

          {/* Next to the close button, one button's width plus a gap in from
              it, so the two read as the one group of chrome the lightbox has
              at the top. The label names the sheet and aria-pressed says
              whether it is the view showing, which is the pair of facts a
              toggle owes a screen reader. */}
          {hasSheet && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => (sheet ? setChosenView("photo") : showSheet())}
              aria-pressed={sheet}
              aria-label={messages.allPhotos}
              className={`${LIGHTBOX_BUTTON_CLASS} top-[max(1rem,env(safe-area-inset-top))] right-[calc(max(1rem,env(safe-area-inset-right))+3.5rem)] size-11 sm:top-4 sm:right-16 sm:size-9`}
            >
              <LayoutGrid className="size-4" aria-hidden />
            </Button>
          )}

          {many && !sheet && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(-1)}
                aria-label={messages.previousPhoto}
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 left-[max(1rem,env(safe-area-inset-left))] my-auto size-11 sm:left-4 sm:size-9`}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(1)}
                aria-label={messages.nextPhoto}
                className={`${LIGHTBOX_BUTTON_CLASS} inset-y-0 right-[max(1rem,env(safe-area-inset-right))] my-auto size-11 sm:right-4 sm:size-9`}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Badge
                aria-hidden
                variant="secondary"
                className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 h-6 -translate-x-1/2 bg-background/80 px-2 text-xs tabular-nums shadow-xs backdrop-blur-sm sm:bottom-4"
              >
                {shown + 1} / {images.length}
              </Badge>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {t("photoCount", { current: shown + 1, total: images.length })}
              </span>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
