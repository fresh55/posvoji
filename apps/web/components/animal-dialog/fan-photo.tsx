import { frontness } from "@/components/animal-dialog/photo-wash";
import { AnimalPhoto } from "@/components/animal-photo";
import { Badge } from "@/components/ui/badge";
import {
  FAN_PHOTO_SIZES,
  PRINT_ASPECT,
  type PermittedPhoto,
} from "@/lib/animal-images";
import { cn } from "@/lib/utils";
import {
  animate,
  m,
  useMotionValue,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import { memo, useEffect, useRef, type RefObject } from "react";
import { isFocusVisible } from "./fan-focus";
import {
  FanDepths,
  FanFactors,
  FanTempo,
  continuousPose,
  printBox,
  printFactor,
  seatCentre,
} from "./fan-geometry";
import {
  PHOTO_BADGE_CLASS,
  PHOTO_FRAME_CLASS,
  PHOTO_SEAT_CLASS,
  PHOTO_WELL_CLASS,
} from "./fan-photo-styles";
import { SHEET_FROM } from "./lightbox-gesture-options";

// What a hover does to a photo from the stack: bigger, lifted, and most of the
// way back to straight, so it reads as the thing a click would pick.
const HOVER_SCALE = 1.08;

const HOVER_LIFT_PX = 4;

// Not all the way to zero. A photo pulled fully upright reads as already
// chosen, and the fan then has two photos claiming the front.
const HOVER_STRAIGHTEN = 0.7;

// What one tier back costs a print in light, and what a hover hands back. Two
// tiers is as deep as the fan goes, so the furthest print loses a tenth of its
// light and the front loses none. It is read off the walk rather than switched
// by a class on the non-active prints, so a print dims as it is pushed back
// under the finger instead of switching when the step lands.
//
// Drawn as the opacity of a black layer over the picture rather than as a
// brightness filter on the print: opacity is composited, while the filter had
// the browser repaint all five photographs on every frame of a drag. Reduced
// motion is untouched: this is a function of where the fan stands, not an
// animation.
const DIM_PER_TIER = 0.05;

// The paper's margin, the width of the border a real print leaves around the
// picture. It belongs to the prints behind and not to the one in front: the
// front print is the photograph being looked at, and the grid card it was
// opened from has no paper round it either, so there the picture runs to the
// paper's own edge. Behind it the paper is what makes a strip legible as a
// stacked print: the second tier shows a narrow band of itself past the front,
// and with the picture running to the edge that band read as a photograph cut
// off rather than as a sheet peeking out from under another one.
//
// Six pixels at the front print's own size, reached a whole tier back. Stated
// once here and handed to the seat as a custom property the walk writes, so
// the well's clip and the corner it rounds to read the same number and the
// margin grows as a print is pushed back, on the same curve the shadow and the
// wash already run on. The seat carries the fan's scale transform, so a print
// at the second tier gets the same margin in proportion rather than the same
// margin in pixels.
const PRINT_MARGIN_PX = 6;

/**
 * One photo of the fan. Its pose is a pure function of how far it stands from
 * the front minus how far the gesture has walked, so the whole fan moves under
 * a drag as one thing, every frame, without a re-render.
 *
 * Memoised, and every prop the fan hands it is stable across a render that
 * does not concern this print. Without that, anything that re-rendered the fan
 * rebuilt the ten MotionValues below for all five prints, which is what the
 * press at the start of a drag used to cost.
 *
 * Where a print stands is a MotionValue for the same reason: a commit moves
 * every seat, and as a number it re-rendered all five prints at the end of
 * every step. What actually changes at a commit is which two prints trade the
 * front, and only those two are handed a different prop.
 */
export const FanPhoto = memo(function FanPhoto({
  photo,
  index,
  offset,
  count,
  progress,
  depths,
  factors,
  box,
  nudge,
  entrance,
  tempo,
  label,
  active,
  hoverable,
  onSelect,
  onOpenLightbox,
}: {
  photo: PermittedPhoto;
  index: number;
  /** How far this print stands from the front, in photos. A value rather than
   *  a number: a commit re-seats every print, and only the two trading the
   *  front have anything else to re-render for. */
  offset: MotionValue<number>;
  count: number;
  /** How far the fan has been walked, in photos: +1 is one step forward. */
  progress: MotionValue<number>;
  depths: FanDepths;
  /** The shapes of the whole window, because this print's seat is measured off
   *  the edges of the prints between it and the front. A ref and not the
   *  record itself: it is rebuilt at every commit, so as a prop it would
   *  re-render all five prints. A transform re-runs whenever the offset or the
   *  walk changes, and the commit jumps both, so what it reads is always the
   *  record the commit has just written. */
  factors: RefObject<FanFactors>;
  box: string;
  nudge: number;
  /** Whether this mount should cascade in, and with how much delay. */
  entrance: number | false;
  tempo: FanTempo;
  label: string;
  active: boolean;
  /** Whether a pointer on this photo should lift and straighten it. */
  hoverable: boolean;
  /** Walks this print to the front. It is told which print and where that
   *  print is standing, so the fan can build one callback for all five rather
   *  than a closure per seat. */
  onSelect: (index: number, offset: number) => void;
  /** Opens the print in front, from the box it is standing in. */
  onOpenLightbox: (from: DOMRect) => void;
}) {
  const aspect = photo.aspect ?? PRINT_ASPECT;
  // The seat is a distance in standard print widths and x is a percentage of
  // this element's own width, which is that same standard scaled by the
  // print's factor. A narrower print therefore travels more of itself to stand
  // in the same place, in exactly the proportion it is narrower by.
  const factor = printFactor(aspect);
  // Every pose below is read off the pair: where this print is seated and how
  // far the fan has been walked. A commit changes both in one paint, and the
  // difference between them is what a print is drawn from, so it lands where
  // it already stood.
  const x = useTransform(
    [offset, progress],
    ([o, p]: number[]) =>
      `${-50 + (seatCentre(o, p, depths, factors.current, factor) / factor) * 100}%`,
  );
  const y = useTransform(
    [offset, progress],
    ([o, p]: number[]) => continuousPose(o - p, depths).drop,
  );
  const rotate = useTransform([offset, progress], ([o, p]: number[]) => {
    const at = o - p;
    // The nudge belongs to the stack: it fades in as the photo leaves the
    // front, so the one being looked at always hangs straight.
    return continuousPose(at, depths).tilt + nudge * Math.min(Math.abs(at), 1);
  });
  const scale = useTransform(
    [offset, progress],
    ([o, p]: number[]) => continuousPose(o - p, depths).scale,
  );
  // Rounded, because z-index has no halves: the order swaps exactly when two
  // photos cross, which is when they visually trade places.
  const zIndex = useTransform([offset, progress], ([o, p]: number[]) =>
    Math.round(20 - Math.min(Math.abs(o - p), 3)),
  );
  // The softer, wider shadow belongs to the photo in front. It used to be
  // switched on at the commit, which made it the last thing in the fan that
  // snapped rather than walked; read off the same curve the wash blends its
  // light on, it deepens as a print is pulled forward.
  const depth = useTransform([offset, progress], ([o, p]: number[]) =>
    frontness(o, p),
  );
  // The paper follows the same curve from the other end: no margin at the
  // front, the whole of it a tier back and further.
  //
  // Rounded to a half pixel, and the coarseness is the point rather than a
  // tidy-up. The well below clips itself to this margin, so every distinct
  // value re-rasterises the clipped photograph; at a hundredth of a pixel that
  // was a new value on nearly every frame of a drag, for a difference nobody
  // can see. Half-pixel steps make the whole walk thirteen values.
  const printMargin = useTransform([offset, progress], ([o, p]: number[]) => {
    const back = Math.min(Math.abs(o - p), 1);
    return `${Math.round(PRINT_MARGIN_PX * back * 2) / 2}px`;
  });

  // 0 at rest, 1 while a mouse or a visible focus is on this photo. The three
  // hover effects are all read off it, on a layer of their own: the seat above
  // is holding four MotionValues that a drag writes every frame, and a hover
  // animating the same numbers would be two owners for one transform. The
  // straighten is derived from the tilt the seat is holding rather than from a
  // remembered one, so it stays correct mid-drag.
  const hover = useMotionValue(0);
  const hoverRun = useRef<ReturnType<typeof animate> | null>(null);
  useEffect(() => () => hoverRun.current?.stop(), []);
  const hoverScale = useTransform(hover, (h) => 1 + (HOVER_SCALE - 1) * h);
  const hoverLift = useTransform(hover, (h) => -HOVER_LIFT_PX * h);
  const hoverRotate = useTransform(
    [rotate, hover],
    ([tilt, level]: number[]) => -HOVER_STRAIGHTEN * tilt * level,
  );
  // Light falls off with depth, and a hover hands one tier of it back: the
  // print under the pointer is the one a click would pick, so it comes back up
  // towards the front's own light. Two tiers is as far back as the fan goes,
  // the same clamp continuousPose makes, and nothing is dimmed below zero,
  // which is what the floor is for.
  //
  // Rounded to a hundredth for the same reason the margin is rounded to a half
  // pixel: a thousandth of a stop is a value nobody can see and a style write
  // the browser still has to make. Two tiers is a tenth of light in total, so
  // hundredths are ten steps across the whole fall-off.
  const dim = useTransform(
    [offset, progress, hover],
    ([o, walked, level]: number[]) => {
      const back = Math.min(Math.abs(o - walked), 2);
      const shade = Math.max(0, DIM_PER_TIER * back - DIM_PER_TIER * level);
      return Math.round(shade * 100) / 100;
    },
  );

  function setHover(on: boolean) {
    if (on && !hoverable) return;
    hoverRun.current?.stop();
    hoverRun.current = animate(hover, on ? 1 : 0, tempo.spring);
  }

  // A side photo picked with the mouse still over it arrives at the front
  // lifted, and the front is not hoverable, so no leave would ever put it
  // down. Losing the right to hover is what puts it down.
  useEffect(() => {
    if (hoverable || hover.get() === 0) return;
    hoverRun.current?.stop();
    hoverRun.current = animate(hover, 0, tempo.spring);
  }, [hoverable, hover, tempo]);

  return (
    <m.button
      type="button"
      // Which of the two a press means is the print's own to decide, off
      // `active`: the one in front opens, the rest walk here.
      onClick={(event) => {
        if (!active) {
          onSelect(index, offset.get());
          return;
        }
        // Where it is standing right now, so the lightbox can grow out of it
        // rather than appear over it.
        onOpenLightbox(event.currentTarget.getBoundingClientRect());
      }}
      // Touch never hovers: a tap would otherwise leave a photo lifted with
      // nothing to take the hover off it again.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHover(false);
      }}
      onFocus={(event) => {
        if (isFocusVisible(event.currentTarget)) setHover(true);
      }}
      onBlur={() => setHover(false)}
      aria-pressed={active}
      aria-label={label}
      // The margin is stated on the seat rather than on the paper, because the
      // well it insets is under here and because it is read off the same walk
      // the seat's own transforms are. motion writes a MotionValue custom
      // property through style.setProperty, so it changes with the drag rather
      // than with a render. The cast is React's missing key for a CSS
      // variable, nothing more.
      style={
        {
          x,
          y,
          rotate,
          scale,
          zIndex,
          ...printBox(aspect),
          "--print-margin": printMargin,
        } as MotionStyle
      }
      className={cn(
        box,
        PHOTO_SEAT_CLASS,
        // The one in front opens; the rest are there to be pulled across. The
        // grabbing hand is the whole stage's while a mouse drag is running,
        // this photo included, because the cursor sits over a photo the entire
        // time and the stage's own rule cannot reach through it.
        active ? "cursor-zoom-in" : count > 1 && "cursor-grab",
        count > 1 && "group-data-dragging:cursor-grabbing",
      )}
      initial={entrance === false ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        entrance === false
          ? { duration: 0 }
          : { ...tempo.spring, delay: entrance }
      }
    >
      {/* The hover layer carries transforms and nothing else. It cannot clip,
          because the shadow below is drawn outside the frame's own edges. */}
      <m.div
        className="absolute inset-0 origin-bottom"
        style={{ scale: hoverScale, y: hoverLift, rotate: hoverRotate }}
      >
        {/* The front photo's deeper shadow, under the frame and outside it:
            the frame is opaque, so all that shows of this is the spill. */}
        <m.div
          aria-hidden
          className="absolute inset-0 rounded-ui shadow-sm"
          style={{ opacity: depth }}
        />
        {/* The paper. It carries no MotionValue of its own: the margin it
            shows is the seat's custom property, and the light is the layer
            over the picture below. */}
        <div
          data-slot="photo-print"
          className={cn("absolute inset-0 shadow-xs", PHOTO_FRAME_CLASS)}
        >
          <div data-slot="photo-well" className={PHOTO_WELL_CLASS}>
            {/* Decorative on purpose: the button around it is already named
                "PokaĹľi fotografijo 2" / "Odpri fotografijo 2 ...", and an alt
                here would say the same photo twice. The lightbox this opens is
                where the picture gets its own alternative. */}
            <AnimalPhoto
              photo={photo}
              alt=""
              // What the fan's photos really measure. On a phone the stage is
              // full bleed and the front photo takes 66-80% of it; on a desktop
              // the dialog caps at 48rem, the stage takes 80% of that and a
              // photo 58% of the stage, which is about 22rem. The wash behind
              // the fan runs off the thumb and carries its own.
              //
              // No AVIF here, deliberately: the fan draws five photos, four of
              // them scaled to under 60%, and the AVIF sibling only exists at
              // the cached copy's full width. Serving it would hand the whole
              // fan the largest file there is.
              sizes={FAN_PHOTO_SIZES}
              // Every print the fan draws is on stage the moment the dialog
              // opens, so none of them is a candidate for deferring: a
              // neighbour that opened as an empty card was the most visible
              // thing the paper margin made worse, and the browser's lazy
              // heuristic has no reason to hold back images that are already
              // on the screen. The front print asks for the front of the queue
              // as well, because it is the one being looked at.
              eager={active}
              loading="eager"
              className="object-cover"
            />
            {/* Depth in light, over the picture and inside the well, so the
                paper keeps its own colour. A layer's opacity is composited;
                the brightness filter this replaces repainted the photograph
                itself on every frame of a drag. */}
            <m.div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: dim }}
            />
          </div>
        </div>
      </m.div>
      {/* The count sits on the photo being looked at, and it is what tells
          you how many there are in total. Outside the hover layer, so it is
          not scaled with the picture.

          A mark and nothing else, so it is hidden from assistive technology:
          the live line at the bottom of the stage already says which photo of
          how many is on show. Past SHEET_FROM the count is also the way into
          the whole set, and a control cannot be nested inside this button; the
          fan draws it over this print instead. */}
      {active && count > 1 && count < SHEET_FROM && (
        <Badge aria-hidden variant="secondary" className={PHOTO_BADGE_CLASS}>
          {index + 1} / {count}
        </Badge>
      )}
    </m.button>
  );
});
