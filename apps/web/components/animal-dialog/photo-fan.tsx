import { GALLERY_BUTTON_CLASS } from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRINT_ASPECT, type PermittedPhoto } from "@/lib/animal-images";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type DragEvent, type ReactNode } from "react";
import { frontPrintOf } from "./fan-focus";
import { printBox } from "./fan-geometry";
import { ENTRANCE_STAGGER, TILT_NUDGE } from "./fan-options";
import { FanPhoto } from "./fan-photo";
import { PHOTO_BADGE_CLASS } from "./fan-photo-styles";
import { SHEET_FROM } from "./lightbox-gesture-options";
import { useFanControls, type FanProps } from "./use-fan-controls";

/**
 * The front print's own box, laid over it.
 *
 * Two controls stand in it, the count and the chevrons, and neither may be
 * nested inside the print's button: one is a control of its own and the other
 * would be a button inside a button. Both have to take the front print's shape
 * rather than the standard one, or they end up out in the air beside a
 * portrait photograph instead of at its edges.
 *
 * Transparent to the pointer, so a drag started on the photograph still
 * reaches the stage under here; what wants presses takes them back for itself.
 */
export function FrontPrintBox({
  box,
  photo,
  children,
}: {
  /** The layout's photo box, which is where the print itself stands. */
  box: string;
  /** The photo at the front, absent only for an index no photo answers. */
  photo: PermittedPhoto | undefined;
  children: ReactNode;
}) {
  return (
    <div
      style={printBox(photo?.aspect ?? PRINT_ASPECT)}
      className={cn(box, "pointer-events-none z-30 -translate-x-1/2")}
    >
      {children}
    </div>
  );
}

/**
 * The fan, in one of the two geometries. Which one is chosen from the
 * breakpoint above, so only that one is mounted. A gesture walks it live,
 * whichever gesture it is: a finger, a mouse held down, or two fingers on a
 * trackpad. Release either snaps the next photo home or puts everything back.
 */
export function Fan(props: FanProps) {
  const {
    geometry,
    images,
    name,
    activeIndex,
    tempo,
    stageRef,
    onOpenLightbox,
    onOpenSheet,
  } = props;
  const {
    messages,
    t,
    shouldReduceMotion,
    count,
    solo,
    slots,
    factors,
    seatOf,
    entered,
    progress,
    selectPhoto,
    step,
    walkToIndex,
    resetSuppressedTap,
    startSwipe,
    moveSwipe,
    endSwipe,
    cancelSwipe,
    leaveSwipe,
    swallowSwipedTap,
    stage,
  } = useFanControls(props);
  return (
    <div
      ref={stage}
      data-slot={geometry.slot}
      // A group, not a listbox or a tablist, and named the same way the card
      // gallery names its own: nothing here is chosen or selected, the visitor
      // is walking one picture at a time, and which one is showing is the live
      // line at the bottom of this stage. The keys were answered in silence
      // until now, so the shortcuts are stated where a reader can find them.
      role="group"
      aria-label={t("photoAltSingle", { name })}
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      // Arrows walk the fan one photo and Home and End walk it to the ends,
      // while focus is anywhere inside it. The page must not scroll out from
      // under the visitor doing either.
      onKeyDown={(event) => {
        // The tap a swipe swallows belongs to that swipe, and a key is not it.
        // A touch swipe fires no click at all, so nothing cleared the flag it
        // set: it sat here until the next press, and the Enter that opens the
        // print in front was swallowed instead.
        resetSuppressedTap();
        // A lone photo has nowhere to walk, and swallowing the key would take
        // the page's own scroll with it.
        if (count < 2) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        if (event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        walkToIndex(event.key === "Home" ? 0 : count - 1);
      }}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onPointerLeave={leaveSwipe}
      onClickCapture={swallowSwipedTap}
      // The browser's own image drag would otherwise start a ghost of the
      // photograph the moment a mouse drag passes the slop, and the fan would
      // be walking under a picture stuck to the cursor.
      onDragStart={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
      // touch-pan-y touch-pinch-zoom, same grammar as the card gallery: the
      // fan owns the horizontal, the dialog keeps its scroll, and the pinch
      // stays for whoever needs the photo bigger.
      // Static, all of it: what a drag switches is data-dragging on the element
      // itself, which the variants below read without a render.
      className={cn(
        "group relative touch-pan-y touch-pinch-zoom",
        geometry.stageClass,
        solo ? geometry.soloStageAspect : geometry.stageAspect,
        count > 1 &&
          "cursor-grab data-dragging:cursor-grabbing data-dragging:select-none",
      )}
    >
      {/* Empty paper frames used to stand behind the outermost photos for a
          set the fan cannot show at once. They read as blank cards rather than
          as the rest of a stack, so what says there are more photos is the
          count in the corner, which opens the whole set. */}
      {/* In the order fanSlots hands them over, which is seat order, left to
          right, and so the order a tab walks them in. They used to be sorted
          by photo number here, which walked a gallery of ten as 1, 2, 3, 9,
          10 while 9 and 10 stood on the left: the fan reading itself back to
          the keyboard in an order the eye cannot see.

          The keys are still the photo, so a print keeps its identity and its
          seat value across a commit; what changes is that React moves a node
          rather than re-rendering it. A moved node loses focus, and the walk
          already answers that: focusOnPrint is asked before the commit and
          focusFrontPrint puts the keyboard back after the re-seat. */}
      {slots
        // Two refs are read here on purpose. The cascade is chosen from the
        // mount marker above, which has to be read where the transition is
        // built, and a print's seat value is looked up or made where the print
        // is built, because the print's transforms take it on their first
        // render. Both reads are idempotent, so a re-render cannot land on a
        // different answer, which is what the rule is guarding against.
        .map(({ index, offset }) => {
          const active = offset === 0;
          return (
            <FanPhoto
              key={index}
              photo={images[index]}
              index={index}
              offset={seatOf(index, offset)}
              count={count}
              progress={progress}
              depths={geometry.depths}
              factors={factors}
              box={solo ? geometry.soloBox : geometry.photoBox}
              nudge={
                shouldReduceMotion ? 0 : TILT_NUDGE[index % TILT_NUDGE.length]
              }
              entrance={
                shouldReduceMotion || entered.current
                  ? false
                  : Math.abs(offset) * ENTRANCE_STAGGER
              }
              tempo={tempo}
              label={
                active
                  ? t("viewPhotoLarge", { n: index + 1 })
                  : t("showPhoto", { n: index + 1 })
              }
              active={active}
              hoverable={!active && !shouldReduceMotion}
              onSelect={selectPhoto}
              onOpenLightbox={onOpenLightbox}
            />
          );
        })}

      {/* On a set the fan cannot show at once, "4 / 12" is the one thing on
          the stage that names the whole gallery, so it is also the way into
          it. That makes it a control, and a control cannot be nested inside
          the print's own button: it used to sit in there aria-hidden, which
          left the only way to the contact sheet invisible to a screen reader
          and unreachable by tab.

          Drawn over the front print rather than in it, the way the chevrons
          already are, so the mark itself is unchanged. It is named for what it
          does and carries the count, because "Vse fotografije" alone would not
          say how many there are; the number it shows says which photo is on
          top, which the live line below states in words.

          The hit area grows and the mark does not: 20px of badge is under half
          the 44px a thumb is measured against, and a bigger chip on the
          photograph is the wrong answer. 8px a side is 36px, which a mouse can
          hit; where the pointer is coarse the overlay reaches 12px instead and
          the mark is worth the whole 44px.

          Overlaid by hand rather than with the tap-target utility in
          globals.css: that one sets position: relative, and this badge is
          positioned into the front print's corner. The rule it carries about
          crowding still applies, and there is nothing within the overhang:
          the chevrons sit at the middle of the print's height and this sits at
          its bottom corner. */}
      {count >= SHEET_FROM && (
        <FrontPrintBox box={geometry.photoBox} photo={images[activeIndex]}>
          <Badge
            asChild
            variant="secondary"
            className={cn(
              PHOTO_BADGE_CLASS,
              // The badge clips its own children, and the hit area below is
              // drawn outside its edges. Nothing else in here overflows.
              "pointer-events-auto cursor-pointer overflow-visible",
              "after:absolute after:-inset-2 pointer-coarse:after:-inset-3",
            )}
          >
            <button
              type="button"
              title={messages.allPhotos}
              aria-label={`${messages.allPhotos} (${count})`}
              onClick={(event) => {
                // The sheet grows out of the photograph, not out of the mark
                // in its corner.
                const stage = stageRef.current;
                const front = frontPrintOf(stage);
                onOpenSheet(
                  (
                    front ??
                    stage ??
                    event.currentTarget
                  ).getBoundingClientRect(),
                );
              }}
            >
              {activeIndex + 1} / {count}
            </button>
          </Badge>
        </FrontPrintBox>
      )}

      {/* Over the active photo, in the same box it occupies. Hidden until
          the fan is hovered or focused, exactly like the card gallery. */}
      {geometry.chevrons && count > 1 && (
        <FrontPrintBox box={geometry.photoBox} photo={images[activeIndex]}>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => step(-1)}
            aria-label={messages.previousPhoto}
            className={`${GALLERY_BUTTON_CLASS} left-1.5`}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => step(1)}
            aria-label={messages.nextPhoto}
            className={`${GALLERY_BUTTON_CLASS} right-1.5`}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </FrontPrintBox>
      )}

      {/* Lives inside the stage, with the photos it is counting. */}
      {count > 1 && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {t("photoCount", { current: activeIndex + 1, total: count })}
        </span>
      )}
    </div>
  );
}
