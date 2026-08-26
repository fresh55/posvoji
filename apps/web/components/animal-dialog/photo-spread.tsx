"use client";

import Image from "next/image";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  animate,
  m,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import type { Animal } from "@posvoji/schema";
import { PhotoLightbox } from "@/components/animal-dialog/photo-lightbox";
import { STAGE_WIDTH } from "@/components/animal-dialog/photo-wash";
import { useI18n } from "@/components/i18n-provider";
import {
  GALLERY_BUTTON_CLASS,
  PhotoGallery,
} from "@/components/photo-gallery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { permittedImageUrls } from "@/lib/animal-images";
import { cn } from "@/lib/utils";

// Five photos is where a fan still reads as a fan. Past that the window walks
// the rest into view as the visitor steps through them.
const FAN_LIMIT = 5;

const FAN_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 26,
  mass: 0.5,
} as const;

const ENTRANCE_STAGGER = 0.04;

// A fixed nudge per photo keeps the fan from looking machine cut. It is picked
// by position, never at random, so the same animal always fans out the same.
const TILT_NUDGE = [0, -1.2, 0.8, -0.6, 1.4];

// The fan's swipe copies the card gallery's contract number for number, so a
// thumb that learned the gesture on the grid does not have to relearn it here.
// A drag past this share of the stage's width commits even at no particular
// speed; a flick short of that still commits if it was quick enough and went
// further than finger drift.
const SWIPE_DISTANCE_RATIO = 0.22;
const SWIPE_VELOCITY_PX_MS = 0.5;
const MIN_SWIPE_PX = 24;
// How far a gesture travels before it declares its axis. Under this it is a
// tap; past it on the vertical it belongs to the dialog's own scroll and
// dismiss gesture, which ask for vertical dominance and so can never claim
// the same gesture this fan does.
const AXIS_SLOP_PX = 8;

// How much of the stage's width a finger crosses to walk the fan one whole
// photo. Shorter than the full width, because the photo the finger is pulling
// in starts more than half a stage away and matching the two would make the
// fan feel geared down.
const DRAG_SPAN_RATIO = 0.6;
// The finger can pull a little past the next photo, and the spring brings it
// back: the give is what says "you are at the step", the way a notch does.
const DRAG_OVERSHOOT = 1.15;

/** One tier of the fan: where a photo this far from the front stands. */
type FanDepth = { shift: number; drop: number; tilt: number; scale: number };

const REST_DEPTH: FanDepth = { shift: 0, drop: 0, tilt: 0, scale: 1 };

// The two layouts run the same recipe and differ only in numbers. The desktop
// fan stands in a centered box with air either side; the phone fan is full
// bleed, its photos take more of the stage, and the outermost ones run off
// the screen edges, which is what says "there are more" without a strip of
// thumbnails saying it again.
const DESKTOP_DEPTHS: [FanDepth, FanDepth] = [
  { shift: 58, drop: 6, tilt: 4.5, scale: 0.55 },
  { shift: 72, drop: 10, tilt: 7, scale: 0.42 },
];

const PHONE_DEPTHS: [FanDepth, FanDepth] = [
  { shift: 56, drop: 7, tilt: 5, scale: 0.58 },
  { shift: 70, drop: 12, tilt: 8, scale: 0.44 },
];

// The desktop boxes: every photo box is the same size and is pulled into
// place by transforms, so the fan scales with the dialog instead of with a
// pixel guess.
const DESKTOP_PHOTO_BOX = "absolute bottom-0 left-1/2 aspect-[4/3] w-[58%]";
// A lone photo has no fan to sit in the middle of, so it takes more of the
// stage rather than floating there at fan size.
const DESKTOP_SOLO_BOX = "absolute bottom-0 left-1/2 aspect-[4/3] w-[72%]";
const DESKTOP_STAGE_ASPECT = "aspect-[2.3/1]";
const DESKTOP_SOLO_STAGE_ASPECT = "aspect-[1.85/1]";

// The phone's boxes come in two sizes: the compact tier for short phones,
// where every stage pixel is a card pixel not shown, and a taller tier from
// 760px of viewport up, where the card fits on screen either way and the
// photo may as well take the room. 760 splits the small phones from the rest:
// an SE-class 667 stays compact, anything iPhone X-shaped and up gets the
// large fan.
// Written out in full rather than composed from a shared prefix: Tailwind
// reads classes out of the raw source, and a name built through interpolation
// is one it never generates.
const PHONE_PHOTO_BOX =
  "absolute bottom-2 left-1/2 aspect-[4/3] w-[66%] [@media(min-height:47.5rem)]:w-[80%]";
const PHONE_SOLO_BOX =
  "absolute bottom-2 left-1/2 aspect-[4/3] w-[76%] [@media(min-height:47.5rem)]:w-[88%]";
const PHONE_STAGE_ASPECT =
  "aspect-[1.6/1] [@media(min-height:47.5rem)]:aspect-[1.22/1]";
const PHONE_SOLO_STAGE_ASPECT =
  "aspect-[1.5/1] [@media(min-height:47.5rem)]:aspect-[1.35/1]";

// A photo edge has to read against the photo, not against the surface behind
// it, so the border is drawn from the foreground: dark on light, light on
// dark.
const PHOTO_FRAME_CLASS =
  "origin-bottom overflow-hidden rounded-ui border border-foreground/10 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Images are served unoptimized today, so this picks nothing; it is here so
// the fan asks for the right file if that ever changes. The wash behind the
// fan runs off the thumb instead and carries its own.
const PHOTO_SIZES = "(max-width: 639px) 80vw, 24rem";

// The dialog counts photos where the grid card shows dots: the card is a
// thumbnail whose gallery is incidental, and this is the surface someone came
// to to look through them, where "4 / 12" is the useful answer.
const PHOTO_BADGE_CLASS =
  "absolute right-1.5 bottom-1.5 h-5 bg-background/80 px-1.5 text-3xs tabular-nums shadow-xs backdrop-blur-sm";

// Where a photo `offset` slots from the front stands. Used by the desktop
// fan, whose photos only ever stand on whole offsets.
function fanPose(offset: number, depths: [FanDepth, FanDepth]) {
  if (offset === 0) return { x: "-50%", y: 0, rotate: 0, scale: 1 };
  const side = Math.sign(offset);
  const depth = Math.min(Math.abs(offset), 2);
  const { shift, drop, tilt, scale } = depths[depth - 1];
  return {
    x: `${-50 + side * shift}%`,
    y: drop,
    rotate: side * tilt,
    scale,
  };
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

// The same poses on a continuous offset, for the fan that follows a finger:
// between the whole offsets the pose is read off the line between the tiers,
// so a photo halfway through a drag stands halfway between its two seats.
function continuousPose(offset: number, depths: [FanDepth, FanDepth]) {
  const side = offset < 0 ? -1 : 1;
  const depth = Math.min(Math.abs(offset), 2);
  const from = depth <= 1 ? REST_DEPTH : depths[0];
  const to = depth <= 1 ? depths[0] : depths[1];
  const t = depth <= 1 ? depth : depth - 1;
  return {
    shift: side * lerp(from.shift, to.shift, t),
    drop: lerp(from.drop, to.drop, t),
    tilt: side * lerp(from.tilt, to.tilt, t),
    scale: lerp(from.scale, to.scale, t),
  };
}

// The window walks around the list, so the active photo is always in the
// middle and every photo stays reachable however many there are.
function fanSlots(count: number, active: number): { index: number; offset: number }[] {
  // Two photos have no middle to walk around. Wrapping put the other one on
  // the right both times, which read as a mistake; keeping it on the side it
  // belongs on by number means it swaps sides as you switch, and the pair
  // stays balanced whichever one you are looking at.
  if (count === 2) {
    return [
      { index: 0, offset: 0 - active },
      { index: 1, offset: 1 - active },
    ];
  }
  const span = Math.min(count, FAN_LIMIT);
  const half = Math.floor((span - 1) / 2);
  const slots = [];
  for (let offset = -half; offset <= span - 1 - half; offset++) {
    slots.push({ index: (active + offset + count) % count, offset });
  }
  return slots;
}

/**
 * One photo of the phone fan. Its pose is a pure function of how far it
 * stands from the front minus how far the finger has walked, so the whole fan
 * moves under a drag as one thing, every frame, without a re-render.
 */
function PhoneFanPhoto({
  source,
  index,
  offset,
  count,
  progress,
  nudge,
  entrance,
  label,
  active,
  onPick,
}: {
  source: string;
  index: number;
  offset: number;
  count: number;
  /** How far the fan has been walked, in photos: +1 is one step forward. */
  progress: MotionValue<number>;
  nudge: number;
  /** Whether this mount should cascade in, and with how much delay. */
  entrance: number | false;
  label: string;
  active: boolean;
  onPick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const x = useTransform(
    progress,
    (p) => `${-50 + continuousPose(offset - p, PHONE_DEPTHS).shift}%`,
  );
  const y = useTransform(
    progress,
    (p) => continuousPose(offset - p, PHONE_DEPTHS).drop,
  );
  const rotate = useTransform(progress, (p) => {
    const at = offset - p;
    // The nudge belongs to the stack: it fades in as the photo leaves the
    // front, so the one being looked at always hangs straight.
    return (
      continuousPose(at, PHONE_DEPTHS).tilt + nudge * Math.min(Math.abs(at), 1)
    );
  });
  const scale = useTransform(
    progress,
    (p) => continuousPose(offset - p, PHONE_DEPTHS).scale,
  );
  // Rounded, because z-index has no halves: the order swaps exactly when two
  // photos cross, which is when they visually trade places.
  const zIndex = useTransform(progress, (p) =>
    Math.round(20 - Math.min(Math.abs(offset - p), 3)),
  );

  return (
    <m.button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      aria-label={label}
      style={{ x, y, rotate, scale, zIndex }}
      className={cn(
        count === 1 ? PHONE_SOLO_BOX : PHONE_PHOTO_BOX,
        PHOTO_FRAME_CLASS,
        active ? "cursor-zoom-in shadow-sm" : "shadow-xs brightness-95",
      )}
      initial={entrance === false ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        entrance === false
          ? { duration: 0 }
          : { ...FAN_SPRING, delay: entrance }
      }
    >
      <Image src={source} alt="" fill sizes={PHOTO_SIZES} className="object-cover" />
      {/* The count sits on the photo being looked at, and it is what tells
          you how many there are in total. */}
      {active && count > 1 && (
        <Badge aria-hidden variant="secondary" className={PHOTO_BADGE_CLASS}>
          {index + 1} / {count}
        </Badge>
      )}
    </m.button>
  );
}

/**
 * The phone's fan. Same shape as the desktop one, but the finger walks it
 * live: a drag pulls every photo through the poses between its seats, and
 * release either snaps the next one home or puts everything back.
 */
function PhoneFan({
  images,
  activeIndex,
  onSelect,
  onOpenLightbox,
}: {
  images: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onOpenLightbox: (from: DOMRect) => void;
}) {
  const { t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const solo = images.length === 1;
  const slots = fanSlots(images.length, activeIndex);

  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  const progress = useMotionValue(0);
  const snap = useRef<ReturnType<typeof animate> | null>(null);
  // A snap that outlives the fan would keep a frame loop alive.
  useEffect(() => () => snap.current?.stop(), []);

  // The walk commits by re-seating the window and zeroing the progress in the
  // same breath. The zero has to wait for the new offsets to be in the tree,
  // or one frame would draw the old seats at rest; a layout effect runs
  // between the two paints, which is exactly the gap it must land in.
  const pendingReset = useRef(false);
  useLayoutEffect(() => {
    if (!pendingReset.current) return;
    pendingReset.current = false;
    progress.jump(0);
  }, [activeIndex, progress]);

  // Walks the fan `delta` photos and then commits the new front. Also the
  // reduced-motion path, where the walk is skipped and the commit is instant.
  function walkTo(delta: number, commit: () => void) {
    snap.current?.stop();
    if (shouldReduceMotion) {
      pendingReset.current = true;
      commit();
      return;
    }
    const run = animate(progress, delta, FAN_SPRING);
    snap.current = run;
    run.then(() => {
      // A superseded walk must not also commit: only the one still holding
      // the slot gets to.
      if (snap.current !== run) return;
      pendingReset.current = true;
      commit();
    });
  }

  function step(direction: -1 | 1) {
    walkTo(direction, () =>
      onSelect((activeIndex + direction + images.length) % images.length),
    );
  }

  // The swipe's own state. A single slot: the fan walks one step per
  // gesture, so there is nothing for a second finger to do but be ignored.
  const swipeStart = useRef<{
    x: number;
    y: number;
    time: number;
    width: number;
  } | null>(null);
  const swipeAxis = useRef<"x" | "y" | null>(null);
  // A gesture that committed to the horizontal is the fan's, whether or not
  // it went far enough to turn the page. The click the browser still fires at
  // whatever photo the finger ended on must not also select or open it.
  const suppressTap = useRef(false);

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    suppressTap.current = false;
    if (images.length < 2 || event.pointerType === "mouse") return;
    if (swipeStart.current) return;
    snap.current?.stop();
    snap.current = null;
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      width: event.currentTarget.clientWidth || 1,
    };
    swipeAxis.current = null;
    // No setPointerCapture here on purpose. A touch pointer is implicitly
    // captured to the photo it pressed, and those events bubble through this
    // stage; an explicit capture would fight the dialog's dismiss gesture
    // over the same pointer, and whoever called last would win.
  }

  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (swipeAxis.current === null) {
      if (Math.hypot(dx, dy) < AXIS_SLOP_PX) return;
      // Decided once and remembered, the same way the card gallery does it: a
      // horizontal drag that curls at the end must not be re-judged on its
      // endpoints. The dialog's dismiss gesture asks for vertical dominance,
      // so the two can never claim the same gesture.
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (swipeAxis.current !== "x" || shouldReduceMotion) return;
    // The fan under the finger, live. Dragging left pulls the next photo in,
    // which is the fan walking forward.
    const raw = -dx / (start.width * DRAG_SPAN_RATIO);
    progress.set(Math.max(-DRAG_OVERSHOOT, Math.min(DRAG_OVERSHOOT, raw)));
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    const axis = swipeAxis.current;
    swipeStart.current = null;
    swipeAxis.current = null;
    if (!start || axis !== "x") return;
    suppressTap.current = true;

    const dx = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.time);
    const velocity = Math.abs(dx) / elapsed;
    const farEnough = Math.abs(dx) > start.width * SWIPE_DISTANCE_RATIO;
    const flicked =
      velocity > SWIPE_VELOCITY_PX_MS && Math.abs(dx) > MIN_SWIPE_PX;
    if (farEnough || flicked) {
      step(dx < 0 ? 1 : -1);
      return;
    }
    // Not far, not fast: the fan goes back to where it stood.
    if (!shouldReduceMotion) {
      snap.current?.stop();
      snap.current = animate(progress, 0, FAN_SPRING);
    }
  }

  // A cancelled pointer is not a decision, and it ends with no click to
  // suppress.
  function cancelSwipe() {
    swipeStart.current = null;
    swipeAxis.current = null;
    suppressTap.current = false;
    if (!shouldReduceMotion) {
      snap.current?.stop();
      snap.current = animate(progress, 0, FAN_SPRING);
    }
  }

  function swallowSwipedTap(event: MouseEvent<HTMLDivElement>) {
    if (!suppressTap.current) return;
    suppressTap.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      data-slot="photo-fan"
      // Arrows walk the fan while focus is anywhere inside it, and the page
      // must not scroll out from under the visitor doing it.
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        step(event.key === "ArrowLeft" ? -1 : 1);
      }}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={cancelSwipe}
      onClickCapture={swallowSwipedTap}
      // overflow-x-clip and not hidden: the neighbours have to clip at the
      // screen edge or they would hand the dialog's scroller a horizontal
      // scrollbar, but the drop still hangs the side photos a few pixels past
      // the stage's bottom and clip on one axis is the one combination that
      // leaves the other visible. touch-pan-y touch-pinch-zoom, same grammar
      // as the card gallery: the fan owns the horizontal, the dialog keeps
      // its scroll, and the pinch stays for whoever needs the photo bigger.
      className={cn(
        "group relative w-full touch-pan-y touch-pinch-zoom overflow-x-clip sm:hidden",
        solo ? PHONE_SOLO_STAGE_ASPECT : PHONE_STAGE_ASPECT,
      )}
    >
      {slots
        .slice()
        .sort((a, b) => a.index - b.index)
        // The cascade is chosen from the mount marker above, which has to be
        // read where the transition is built. The read is idempotent, so a
        // re-render cannot land on a different answer.
        // eslint-disable-next-line react-hooks/refs
        .map(({ index, offset }) => {
          const active = offset === 0;
          return (
            <PhoneFanPhoto
              key={index}
              source={images[index]}
              index={index}
              offset={offset}
              count={images.length}
              progress={progress}
              nudge={shouldReduceMotion ? 0 : TILT_NUDGE[index % TILT_NUDGE.length]}
              entrance={
                shouldReduceMotion || entered.current
                  ? false
                  : Math.abs(offset) * ENTRANCE_STAGGER
              }
              label={
                active
                  ? t("viewPhotoLarge", { n: index + 1 })
                  : t("showPhoto", { n: index + 1 })
              }
              active={active}
              onPick={(event) => {
                if (!active) {
                  walkTo(offset, () => onSelect(index));
                  return;
                }
                // Where it is standing right now, so the lightbox can grow
                // out of it rather than appear over it.
                onOpenLightbox(event.currentTarget.getBoundingClientRect());
              }}
            />
          );
        })}

      {/* Lives inside the stage, so only the layout on screen announces
          itself: the other one is display: none, which is silent. */}
      {images.length > 1 && (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {t("photoCount", { current: activeIndex + 1, total: images.length })}
        </span>
      )}
    </div>
  );
}

export function PhotoSpread({
  animal,
  onWashSource,
}: {
  animal: Animal;
  /**
   * Which photo the stage wash should be showing. The wash is mounted above
   * this component so it outlives the remount, which is the only way one
   * animal's colour can fade into the next one's.
   */
  onWashSource?: (source: string | undefined) => void;
}) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  const images = permittedImageUrls(animal.images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOrigin, setLightboxOrigin] = useState<DOMRect | undefined>(
    undefined,
  );
  // The cascade belongs to the mount, which is once per animal: the first
  // render reads false, and every render after it is a photo being picked.
  const entered = useRef(false);
  useEffect(() => {
    entered.current = true;
  }, []);

  // Reported rather than read from above, because which photo is showing is
  // this component's business. An animal with nothing to show reports nothing
  // and the wash goes out with it.
  const washSource = images[activeIndex];
  useEffect(() => {
    onWashSource?.(washSource);
  }, [onWashSource, washSource]);

  if (images.length === 0) {
    return (
      <PhotoGallery
        animal={animal}
        sizes="(max-width: 639px) 100vw, 24rem"
        className="relative aspect-[4/3] w-full overflow-hidden bg-muted sm:mx-auto sm:w-[58%] sm:rounded-ui sm:border"
      />
    );
  }

  const solo = images.length === 1;
  const slots = fanSlots(images.length, activeIndex);

  function step(direction: -1 | 1) {
    setActiveIndex(
      (current) => (current + direction + images.length) % images.length,
    );
  }

  return (
    <>
      {/* The same fan on both sides of the breakpoint. The phone used to get
          a full-width hero with a thumbnail strip, which spent 365px saying
          what the fan says in less: which photo is on show, that there are
          more, and where you are among them. */}
      <PhoneFan
        images={images}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        onOpenLightbox={(from) => {
          setLightboxOrigin(from);
          setLightboxOpen(true);
        }}
      />

      {/* Wider screens get the whole set at once: the chosen one large in the
          middle, the rest tilted and tucked behind it. */}
      <div
        data-slot="photo-spread"
        // Arrows walk the fan while focus is anywhere inside it, and the
        // page must not scroll out from under the visitor doing it.
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          step(event.key === "ArrowLeft" ? -1 : 1);
        }}
        className={cn(
          "group relative mx-auto hidden sm:block",
          STAGE_WIDTH,
          solo ? DESKTOP_SOLO_STAGE_ASPECT : DESKTOP_STAGE_ASPECT,
        )}
      >
        {/* The wash that used to sit here is mounted by the dialog now, so it
            survives this component being remounted for the next animal. */}
        {slots
          .slice()
          .sort((a, b) => a.index - b.index)
          // The cascade is chosen from the mount marker below, which has to be
          // read where the transition is built. The read is idempotent, so a
          // re-render cannot land on a different answer.
          // eslint-disable-next-line react-hooks/refs
          .map(({ index, offset }) => {
            const pose = fanPose(offset, DESKTOP_DEPTHS);
            const active = offset === 0;
            const rotate =
              active || shouldReduceMotion
                ? pose.rotate
                : pose.rotate + TILT_NUDGE[index % TILT_NUDGE.length];
            return (
              <m.button
                key={index}
                type="button"
                onClick={(event) => {
                  if (!active) {
                    setActiveIndex(index);
                    return;
                  }
                  // Where it is standing right now, so the lightbox can grow
                  // out of it rather than appear over it.
                  setLightboxOrigin(event.currentTarget.getBoundingClientRect());
                  setLightboxOpen(true);
                }}
                aria-pressed={active}
                aria-label={
                  active
                    ? t("viewPhotoLarge", { n: index + 1 })
                    : t("showPhoto", { n: index + 1 })
                }
                style={{ zIndex: 20 - Math.abs(offset) }}
                className={cn(
                  solo ? DESKTOP_SOLO_BOX : DESKTOP_PHOTO_BOX,
                  PHOTO_FRAME_CLASS,
                  active
                    ? "cursor-zoom-in shadow-sm"
                    : "shadow-xs brightness-95 transition-[filter] duration-150 hover:brightness-100",
                )}
                initial={
                  shouldReduceMotion
                    ? false
                    : { ...pose, rotate, opacity: 0, y: pose.y + 8 }
                }
                animate={{ ...pose, rotate, opacity: 1 }}
                // Hovering a photo from the stack straightens it and lifts it
                // a little, so it reads as the thing a click would pick.
                whileHover={
                  active || shouldReduceMotion
                    ? undefined
                    : {
                        scale: pose.scale * 1.08,
                        rotate: rotate * 0.3,
                        y: pose.y - 4,
                      }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        ...FAN_SPRING,
                        delay: entered.current
                          ? 0
                          : Math.abs(offset) * ENTRANCE_STAGGER,
                      }
                }
              >
                <Image
                  src={images[index]}
                  alt=""
                  fill
                  sizes={PHOTO_SIZES}
                  className="object-cover"
                />
                {/* The count sits on the photo being looked at, and it is
                    what tells you how many there are in total. */}
                {active && images.length > 1 && (
                  <Badge
                    aria-hidden
                    variant="secondary"
                    className={PHOTO_BADGE_CLASS}
                  >
                    {activeIndex + 1} / {images.length}
                  </Badge>
                )}
              </m.button>
            );
          })}

        {/* Over the active photo, in the same box it occupies. Hidden until
            the fan is hovered or focused, exactly like the card gallery. */}
        {images.length > 1 && (
          <div
            className={cn(
              DESKTOP_PHOTO_BOX,
              "pointer-events-none z-30 -translate-x-1/2",
            )}
          >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => step(-1)}
              aria-label={messages.previousPhoto}
              className={`${GALLERY_BUTTON_CLASS} pointer-events-auto left-1.5`}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => step(1)}
              aria-label={messages.nextPhoto}
              className={`${GALLERY_BUTTON_CLASS} pointer-events-auto right-1.5`}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}

        {/* Lives inside the stage, so only the layout on screen announces
            itself: the other one is display: none, which is silent. */}
        {images.length > 1 && (
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {t("photoCount", {
              current: activeIndex + 1,
              total: images.length,
            })}
          </span>
        )}
      </div>

      <PhotoLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={images}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        title={animal.name ?? messages.unnamed}
        originRect={lightboxOrigin}
      />
    </>
  );
}
