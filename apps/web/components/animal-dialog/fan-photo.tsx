import { frontness } from "@/components/animal-dialog/photo-wash";
import { AnimalPhoto } from "@/components/animal-photo";
import {
  FAN_PHOTO_SIZES,
  FAN_SIDE_PHOTO_SIZES,
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
  type Transition,
} from "motion/react";
import { memo, useEffect, useRef, type RefObject } from "react";
import { isFocusVisible, type FanFocusKind } from "./fan-focus";
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
  PHOTO_FRAME_CLASS,
  PHOTO_SEAT_CLASS,
  PHOTO_WELL_CLASS,
} from "./fan-photo-styles";

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
  printId,
  offset,
  count,
  progress,
  depths,
  factors,
  box,
  nudge,
  entrance,
  fade,
  tempo,
  label,
  active,
  hoverable,
  onSelect,
  onOpenLightbox,
}: {
  photo: PermittedPhoto;
  index: number;
  /** The key this print is drawn under, written into the DOM so the fan can
   *  tell a print from the copy a wrap has left behind. */
  printId: string;
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
  /** How this print's mount is drawn: a delay into the fan's opening cascade,
   *  a plain fade for a print that steps into the window mid-walk, or nothing
   *  at all, which is a print that was already standing here. */
  entrance: number | "fade" | false;
  /** The tween a print arrives and leaves on when it is not part of the
   *  opening cascade. Zero where motion was asked for none. */
  fade: Transition;
  tempo: FanTempo;
  label: string;
  active: boolean;
  /** Whether a pointer on this photo should lift and straighten it. */
  hoverable: boolean;
  /** Walks this print to the front. It is told which print, where that print
   *  is standing and whose press it was, so the fan can build one callback for
   *  all five rather than a closure per seat. */
  onSelect: (index: number, offset: number, by: FanFocusKind) => void;
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
          // Enter on a print and a click on it arrive here as the same event,
          // and whether the browser is drawing this print's focus is what
          // tells them apart: a press that moved focus to this print is one
          // the browser has just made its mind up about.
          onSelect(
            index,
            offset.get(),
            isFocusVisible(event.currentTarget) ? "keyboard" : "pointer",
          );
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
      // Which photograph of the set the fan is holding. It used to be
      // aria-pressed, which made every print a toggle: a reader walking the
      // stage announced five buttons as pressed or not pressed, a row of
      // switches rather than a gallery with one picture on top, and pressing
      // one of them does not turn anything on. aria-current is the same answer
      // the lightbox's contact sheet already gives about its own tiles, so the
      // two views of one set say the same thing.
      //
      // Only the print in front carries it. The rest carry nothing, because
      // aria-current has no false to state: the absent attribute is the
      // answer.
      aria-current={active ? "true" : undefined}
      aria-label={label}
      // Which print this node is, as the fan is drawing it. A print that wraps
      // to the other side of the stage is drawn again under a new key while
      // the copy it leaves behind fades out, and for that moment two nodes are
      // showing the same photograph: this is what tells them apart, for the
      // fan itself (see the commit effect in use-fan-controls.ts) and for the
      // tests. Static, so it costs this print nothing.
      data-print={printId}
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
        // What the browser morphs the card's photograph into on the way in,
        // and back out of on the way out. The whole seat and not the picture
        // inside it: what the morph names is lifted out of the page for the
        // length of it, so naming the well alone left this print's paper
        // standing empty at the far end, a white card waiting for its
        // photograph. Named here, the print arrives as one thing.
        //
        // The name is the one in lib/view-transition.ts, written out because
        // Tailwind reads the class and not the constant. Only the print in
        // front carries it, and only one element may carry it at a time: the
        // card takes its own off inside the same update that mounts this one,
        // or the browser skips the morph.
        active && "[view-transition-name:animal-photo]",
      )}
      initial={entrance === false ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      // A print leaves the window in two ways. One walks off the trailing edge,
      // where the seats are clamped and there is nothing left of it to see, and
      // one is the copy of a print that has wrapped round to the other side of
      // the fan, which is still standing at the tier it was walked to. Both
      // fade, because the second one has to and the first one costs nothing.
      exit={{ opacity: 0, transition: fade }}
      // A print that was already standing here is mounted with no initial
      // and an animate that never changes, so it transitions nothing and the
      // value here is never read for it.
      transition={
        entrance === "fade" ? fade : { ...tempo.spring, delay: entrance || 0 }
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
              // The seat's own size and not the front's, for the four prints
              // that are not in front. They are drawn at 0.42 to 0.58 of the
              // front print, and asking in the front's name had every one of
              // them select the master file for a picture 88 to 144px wide.
              // The constant says how that number is arrived at.
              //
              // No AVIF here, deliberately: the fan draws five photos, four of
              // them scaled to under 60%, and the AVIF sibling only exists at
              // the cached copy's full width. Serving it would hand the whole
              // fan the largest file there is.
              sizes={active ? FAN_PHOTO_SIZES : FAN_SIDE_PHOTO_SIZES}
              // Every print the fan draws is on stage the moment the dialog
              // opens, so none of them is a candidate for deferring: a
              // neighbour that opened as an empty card was the most visible
              // thing the paper margin made worse, and the browser's lazy
              // heuristic has no reason to hold back images that are already
              // on the screen. The front print asks for the front of the queue
              // as well, because it is the one being looked at.
              eager={active}
              loading="eager"
              // The print's own shape: a photo wider than 4:3 is cut to it,
              // and a portrait taller than 3:4 likewise, so the print says
              // what it is cutting to and keeps the animal inside.
              frame={aspect}
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
    </m.button>
  );
});
