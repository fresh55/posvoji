import { GALLERY_BUTTON_CLASS } from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRINT_ASPECT, type PermittedPhoto } from "@/lib/animal-images";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { type DragEvent, type ReactNode } from "react";
import { frontPrintOf } from "./fan-focus";
import { printBox } from "./fan-geometry";
import {
  ENTRANCE_LEAD,
  ENTRANCE_STAGGER,
  MOUNT_FADE,
  NO_FADE,
  TILT_NUDGE,
} from "./fan-options";
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
    prints,
    printAt,
    spoken,
    factors,
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

  // How a print's arrival is drawn.
  //
  // The cascade belongs to the fan's own mount, which is once per animal: the
  // first render reads false and every render after it is a photo being
  // picked. A print that steps into the window later arrives mid-walk, where a
  // cascade delay would have it appear after the fan had already stopped
  // moving, so it is a plain fade instead. It used to be drawn at full opacity
  // in one frame, which on a gallery past the fan's reach was a photograph
  // switching on at the leading tier as the step landed.
  //
  // The front print is not drawn in at all. It is the box the browser carries
  // the card's photograph into, and what arrives there is that photograph: a
  // fade under it would be a second photo appearing behind the one already
  // landing. The rest wait for the landing and then cascade, so that for the
  // length of the morph the only thing moving on the stage is the picture the
  // visitor pressed (ENTRANCE_LEAD).
  function entranceOf(active: boolean, offset: number, fresh: boolean) {
    if (shouldReduceMotion) return false;
    if (!entered.current) {
      return active ? false : ENTRANCE_LEAD + Math.abs(offset) * ENTRANCE_STAGGER;
    }
    return fresh ? "fade" : false;
  }
  const fade = shouldReduceMotion ? NO_FADE : MOUNT_FADE;

  return (
    <div
      ref={stage}
      data-slot={geometry.slot}
      // A group, not a listbox or a tablist: nothing here is chosen or
      // selected, the visitor is walking one picture at a time, and which one
      // is showing is the live line at the bottom of this stage. The keys were
      // answered in silence until now, so the shortcuts are stated where a
      // reader can find them.
      role="group"
      // A name of its own. It borrowed photoAltSingle, which is one
      // photograph's text alternative, so a stage holding thirteen of them
      // announced itself as "Fotografija: Klopka". A gallery of one keeps that
      // string, because there it is what the stage is holding.
      aria-label={
        count > 1 ? t("photoFanLabel", { name }) : t("photoAltSingle", { name })
      }
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      // Focusable by script and not by tab: the prints are what a tab walks.
      // This is where the keyboard goes when a walk unmounts the print that was
      // holding it and nobody asked for the keyboard in the first place, which
      // is what a drag or a swipe is. The arrows are answered here, so they
      // carry on working; the stage draws no ring of its own, because nothing
      // about a gesture should end with an outline around the photographs.
      tabIndex={-1}
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
          // The one walk the fan hands the keyboard on to the print it brings
          // forward, which is the only way a key press has of saying what it
          // did.
          step(event.key === "ArrowLeft" ? -1 : 1, "keyboard");
          return;
        }
        if (event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        walkToIndex(event.key === "Home" ? 0 : count - 1, "keyboard");
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
      //
      // select-none and the callout for the same reason, a finger held still
      // mid-swipe: iOS reads a long press on an image as a request for the
      // sheet that offers to save or copy it, and one anywhere else as the
      // start of a selection. Either one arrives while the fan is being walked
      // and takes the gesture with it. Not only while a drag is running, which
      // is what data-dragging:select-none used to say: the press that raises
      // the sheet is the one before the drag has declared itself.
      // Static, all of it: what a drag switches is data-dragging on the element
      // itself, which the variants below read without a render.
      className={cn(
        "group relative touch-pan-y touch-pinch-zoom outline-none",
        "[-webkit-touch-callout:none] select-none",
        geometry.stageClass,
        solo ? geometry.soloStageAspect : geometry.stageAspect,
        count > 1 && "cursor-grab data-dragging:cursor-grabbing",
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

          A print's key is the photo for as long as it keeps its seat on one
          side of the fan, so a commit moves its node rather than re-rendering
          it, and the print keeps its identity and its seat value across the
          re-seat. A moved node loses focus, and the walk already answers that:
          who was holding the keyboard is asked before the commit and answered
          after the re-seat. A print the commit would carry across the stage is
          drawn under a new key instead, and the two copies cross over as a
          fade; see keyOf.

          AnimatePresence for the copy that is leaving: on a gallery of three
          or four it is still standing at the trailing tier when the commit
          lands, and it has to be taken away rather than vanish.

          presenceAffectsLayout is off because nothing here is laid out: every
          print is absolute, so a copy on its way out moves no sibling and
          there is no layout for its leaving to affect. Left on, the flag hands
          every present child a rebuilt presence context on every render of
          this component, and context reaches inside memo: all five prints
          re-rendered their four motion elements each, for a commit that
          changes two of them. */}
      <AnimatePresence presenceAffectsLayout={false}>
        {prints.map((slot) => {
          const { index, offset } = slot;
          const active = offset === 0;
          // Three answers are read out of the fan here rather than passed as
          // props, because all three are questions about this render: which
          // node this print is drawn as, the seat value its transforms take on
          // their first render, and whether this is that first render. All of
          // them are idempotent, so a re-render cannot land on a different
          // answer, which is what the rule is guarding against.
          const { key, fresh, seat } = printAt(slot);
          return (
            <FanPhoto
              key={key}
              printId={key}
              photo={images[index]}
              index={index}
              offset={seat}
              count={count}
              progress={progress}
              depths={geometry.depths}
              factors={factors}
              box={solo ? geometry.soloBox : geometry.photoBox}
              nudge={
                shouldReduceMotion ? 0 : TILT_NUDGE[index % TILT_NUDGE.length]
              }
              entrance={entranceOf(active, offset, fresh)}
              fade={fade}
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
      </AnimatePresence>

      {/* The front print's own box, and everything the fan draws over the
          photograph rather than inside it: the count, and on a pointer the
          chevrons either side.

          One box for all of them. Each of the three used to lay its own, so
          three transparent copies of the same rectangle stood over the same
          photograph and the front print's shape was worked out three times for
          one render.

          The count comes in two shapes and never both at once. Under
          SHEET_FROM it is a mark and nothing more, hidden from assistive
          technology, because the live line at the bottom of this stage already
          says which photo of how many is on show and there is no set behind
          the number to lead anywhere. From SHEET_FROM up that same mark is
          also the only way into the whole gallery, which makes it a control,
          and a control cannot be nested inside the print's own button: it used
          to sit in there aria-hidden, which left the contact sheet invisible
          to a screen reader and unreachable by tab.

          Drawing the mark here rather than inside the print is what makes its
          two shapes behave alike. Inside the print's own button it rode with
          the photograph, so a step carried it off to the side with the print
          it was leaving on and brought it back with the next one, while past
          SHEET_FROM the same mark stood still and the photographs slid under
          it. One mark behaving two ways is the sort of difference nobody can
          name and everybody sees.

          This box takes no presses, so the corner of the photograph under the
          mark still opens the print the way the rest of it does; what wants
          presses takes them back for itself. */}
      {count > 1 && (
        <FrontPrintBox box={geometry.photoBox} photo={images[activeIndex]}>
          {count < SHEET_FROM ? (
            <Badge
              aria-hidden
              variant="secondary"
              className={PHOTO_BADGE_CLASS}
            >
              <span>{messages.photosShort}</span>{" "}
              {activeIndex + 1} / {count}
            </Badge>
          ) : (
            /* Its name leads with the mark. An aria-label of "Vse fotografije (13)"
          named what the control does, but it also replaced the only words on
          it: a visitor who speaks to their machine reads "Foto 1 / 13" on the
          photograph and has nothing by that name to ask for, which is what
          WCAG 2.5.3 is about. The visible text is the name's first words now
          and "Vse fotografije" follows it, said to a reader and not drawn.

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
          its bottom corner. */
            <Badge
              asChild
              variant="secondary"
              className={cn(
                PHOTO_BADGE_CLASS,
                // The badge clips its own children, and the hit area below is
                // drawn outside its edges. Nothing else in here overflows.
                "pointer-events-auto cursor-pointer overflow-visible",
                // 14px a side on a finger, not 12: the pill is 20px tall, and
                // 12 left the hit area at 43px, one under the bar it is
                // measured against.
                "after:absolute after:-inset-2 pointer-coarse:after:-inset-3.5",
              )}
            >
              {/* What this opens is said in the name and nowhere else. A title
                repeated those words to a pointer and to nothing else, and the
                count is how a phone reaches the rest of the set. */}
              <button
                type="button"
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
                <span>{messages.photosShort}</span>{" "}
                {activeIndex + 1} / {count}{" "}
                {/* The rest of the name, carried as text so the drawn words lead
                  it. sr-only and not aria-hidden: this is the half a reader
                  needs and the half the photograph has no room for. */}
                <span className="sr-only">{messages.allPhotos}</span>
              </button>
            </Badge>
          )}

          {/* Hidden until the fan is hovered or focused, exactly like the card
              gallery.

              pointer-coarse:size-11 because this geometry stands on the 768px
              tablet too, where icon-sm is a 32px disc for a thumb. They are
              hidden from a finger that cannot hover, but a hybrid tablet with
              a mouse reaches them, and keyboard focus draws them on any
              device. The size is on the pointer and not on the width, so a
              mouse keeps the small disc at every size.

              Last in the box, so they are drawn over the mark rather than
              under it. */}
          {geometry.chevrons && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(-1)}
                aria-label={messages.previousPhoto}
                className={`${GALLERY_BUTTON_CLASS} left-1.5 pointer-coarse:size-11`}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => step(1)}
                aria-label={messages.nextPhoto}
                className={`${GALLERY_BUTTON_CLASS} right-1.5 pointer-coarse:size-11`}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </FrontPrintBox>
      )}

      {/* Lives inside the stage, with the photos it is counting.

          It names the photo the fan says it is on rather than the one in
          front, and the two differ for exactly one commit: the walk that hands
          the keyboard to the new front print is announced by that print's own
          name as it takes focus, and this line changing in the same breath had
          a screen reader read one step out twice. */}
      {count > 1 && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {t("photoCount", { current: spoken + 1, total: count })}
        </span>
      )}
    </div>
  );
}
