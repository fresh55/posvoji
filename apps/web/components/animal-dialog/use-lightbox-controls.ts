import { useWheelStep } from "@/components/animal-dialog/use-wheel-step";
import { useI18n } from "@/components/i18n-provider";
import type { PermittedPhoto } from "@/lib/animal-images";
import {
  MIN_SWIPE_PX,
  SWIPE_DISTANCE_RATIO,
  SWIPE_VELOCITY_PX_MS,
  WHEEL_SETTLE_MS,
  declareAxis,
  releasePointer,
  swipeVerdict,
} from "@/lib/swipe";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { PhotoBox, clamp, measure, panLimit } from "./lightbox-geometry";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP_PX,
  GESTURE_SPRING,
  MAX_ZOOM,
  PHOTO_REST,
  PINCH_SETTLE_SCALE,
  PULL_CLOSE_PX,
  PULL_FADE_PX,
  PULL_SCALE,
  PULL_SCRIM,
  PhotoPose,
  SHEET_FROM,
  SWIPE_DISTANCE_PX,
  ZOOM_SCALE,
  type LightboxView,
} from "./lightbox-gesture-options";

export type PhotoLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: PermittedPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  title: string;
  /** Where the photo was sitting in the fan when it was clicked. */
  originRect?: DOMRect;
  /** Which view a visit opens on. A caller that opened the lightbox from
   *  something naming the whole set asks for the sheet; everything else lands
   *  on the photo it was opened on. */
  initialView?: LightboxView;
  /** Where focus goes on the way out when the print it came from is no longer
   *  in the document. The index is shared with the fan behind, so stepping in
   *  here walks the fan too, and a print more than two steps from the front
   *  leaves its window: focus handed back to it lands on nothing. The fan
   *  answers with the print now at its front. */
  returnFocusFallback?: () => HTMLElement | null | undefined;
};

export function useLightboxControls({
  open,
  onOpenChange,
  images,
  index,
  onIndexChange,
  initialView = "photo",
}: PhotoLightboxProps) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // Which photo is on show. The index is the caller's and the set behind it
  // can shrink while this is open, so it is clamped rather than trusted: an
  // index past the end draws no photo, and an open dialog that renders nothing
  // takes the layer away with focus still inside it. In range, which is every
  // other moment, this is the index itself.
  const shown = images.length
    ? Math.min(Math.max(index, 0), images.length - 1)
    : 0;
  const image = images[shown];
  const many = images.length > 1;
  const hasSheet = images.length >= SHEET_FROM;

  // The view the visitor switched to, or null for the one the caller asked to
  // open on. Holding the override rather than the view itself is what lets
  // initialView be read on every visit: the lightbox stays mounted, and a
  // state seeded once at mount would answer for the first visit only.
  const [chosenView, setChosenView] = useState<LightboxView | null>(null);
  // A sheet is only ever shown where the toggle out of it is drawn.
  const sheet = hasSheet && (chosenView ?? initialView) === "sheet";

  // The photo box is driven by motion values rather than by state: a pinch or
  // a pan is a new offset every frame, and state would be a render of the
  // whole lightbox every frame. React keeps only the one fact the rest of the
  // view branches on, which is whether the photo is zoomed.
  const photoX = useMotionValue(0);
  const photoY = useMotionValue(0);
  const photoScale = useMotionValue(1);
  const scrimOpacity = useMotionValue(1);

  // Which photo the zoom belongs to, or null for none. A zoom belongs to one
  // picture, and reading the index back rather than a bare boolean is what
  // makes a step to the next photo start unzoomed without an effect that sets
  // state a render after the step. Every step clears it as well, in goTo
  // below: the motion values go back to rest with the photo, and a zoom left
  // standing would meet them there on the way back to the picture it was
  // taken on. jsdom cannot see a transform, so this is also what the tests
  // read, through data-zoomed on the box below.
  const [zoomedAt, setZoomedAt] = useState<number | null>(null);
  const zoomed = zoomedAt === shown;

  // Every live gesture is kept in refs and written from event handlers only.
  // None of it is drawn, and a render per move is a render per frame.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    /** How far apart the fingers started, and what the photo was at then. */
    distance: number;
    scale: number;
    /** The point between the fingers, in the box's own coordinates, and the
     *  offset the photo was already carrying. Together they name the point of
     *  the photograph that has to stay under the fingers. */
    midpoint: { x: number; y: number };
    offset: { x: number; y: number };
    box: PhotoBox;
  } | null>(null);
  const pan = useRef<{
    x: number;
    y: number;
    time: number;
    offset: { x: number; y: number };
    box: PhotoBox;
  } | null>(null);
  // A finger left on the glass after a pinch is not the start of anything, so
  // nothing is read from it until every finger has lifted.
  const spent = useRef(false);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const touchAxis = useRef<"x" | "y" | null>(null);
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const runs = useRef<ReturnType<typeof animate>[]>([]);
  // The box the photograph is drawn in, which is what a gesture measures and
  // what the clamp below re-measures when the window changes shape.
  const photoBox = useRef<HTMLDivElement | null>(null);

  // The four values the photo is drawn from, paired with the part of a pose
  // each one carries. Every write below goes through this rather than naming
  // the four in order and trusting three call sites to keep agreeing.
  const tracks = useMemo(
    () =>
      [
        [photoX, "x"],
        [photoY, "y"],
        [photoScale, "scale"],
        [scrimOpacity, "scrim"],
      ] as const,
    [photoX, photoY, photoScale, scrimOpacity],
  );

  // Whatever a gesture left running, stopped and forgotten.
  const stopRuns = useCallback(() => {
    for (const run of runs.current) run.stop();
    runs.current = [];
  }, []);

  /** The photo put in a pose, either at once or on the gesture spring. The
   *  caller stops what is running first: a jump that leaves a spring behind is
   *  a value written and then walked off. */
  const writePhoto = useCallback(
    (to: PhotoPose, mode: "jump" | "spring") => {
      if (mode === "jump") {
        for (const [track, part] of tracks) track.jump(to[part]);
        return;
      }
      runs.current = tracks.map(([track, part]) =>
        animate(track, to[part], GESTURE_SPRING),
      );
    },
    [tracks],
  );

  // Everything a gesture may have left behind, put back at once. A zoom
  // belongs to one photo and to one visit, so this is what a step to another
  // picture, and the way out, both go through.
  const restPhoto = useCallback(() => {
    stopRuns();
    pointers.current.clear();
    pinch.current = null;
    pan.current = null;
    spent.current = false;
    touchStart.current = null;
    touchAxis.current = null;
    // The tap half of a double tap belongs to the photo it landed on. Left
    // here, a tap on one picture and a tap on the next one within the window
    // would read as a double tap on a photograph the finger only met once.
    lastTap.current = null;
    writePhoto(PHOTO_REST, "jump");
  }, [stopRuns, writePhoto]);

  // The lightbox stays mounted across visits and the index is shared with the
  // fan behind it, so the photo under the gesture can change without anything
  // here being told. The cleanup is what stops a spring outliving the picture
  // it was landing.
  useEffect(() => {
    restPhoto();
    return stopRuns;
  }, [open, shown, restPhoto, stopRuns]);

  // A pan is clamped against a box measured when the finger came down, and a
  // phone turned sideways while zoomed leaves the photograph parked outside
  // the box it is now drawn in, with ground showing beside it until the next
  // gesture. The listener is only ever on while there is a zoom to hold, and
  // the clamp is a jump rather than a spring: the photograph is not travelling
  // anywhere, it is being put back inside a box that changed under it.
  useEffect(() => {
    if (!zoomed) return;
    function reclamp() {
      const container = photoBox.current;
      if (!container) return;
      const limit = panLimit(measure(container), photoScale.get());
      photoX.jump(clamp(photoX.get(), limit.x));
      photoY.jump(clamp(photoY.get(), limit.y));
    }
    window.addEventListener("resize", reclamp);
    // Not every browser reports a turn as a resize of the window, and the
    // ones that do may report it a frame later than this.
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
  }, [zoomed, photoScale, photoX, photoY]);

  // The lightbox stays mounted across visits, so the zoom has to be dropped on
  // the way out or the next visit to the same photo would open into it. Every
  // close goes through here: Escape, the close button and the overlay all
  // reach the caller's setter through Radix's onOpenChange.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setZoomedAt(null);
      restPhoto();
      // Same reason as the zoom: a sheet left standing here is what the next
      // visit would open into, whatever the caller asked for.
      setChosenView(null);
    }
    onOpenChange(next);
  }

  function showSheet() {
    // A zoom belongs to one photo in the single view. Dropping it here means
    // the way back out of the sheet cannot land in it.
    setZoomedAt(null);
    restPhoto();
    setChosenView("sheet");
  }

  /** Another photo, however it was asked for: the chevrons, a swipe, a number
   *  key, a tile in the sheet. The zoom goes with the picture it belonged to.
   *  Cleared here rather than in the effect above, which puts the motion
   *  values back: the two have to land in the same render, or the photograph
   *  sits at its normal size for one frame while every gesture is still read
   *  as a zoomed one. */
  function goTo(next: number) {
    // The number of the photo already in front is not a step, and there is no
    // zoom to drop: nothing moved out from under it.
    if (next !== shown) setZoomedAt(null);
    onIndexChange(next);
  }

  function showPhoto(next: number) {
    goTo(next);
    setChosenView("photo");
  }

  function step(direction: -1 | 1) {
    goTo((shown + direction + images.length) % images.length);
  }

  /** Where the photo lands once the fingers are off it. Reduced motion gets
   *  the landing without the travel. */
  function settle(to: PhotoPose) {
    stopRuns();
    writePhoto(to, shouldReduceMotion ? "jump" : "spring");
  }

  /** The double tap's own step, between resting and ZOOM_SCALE. The tapped
   *  point stays under the finger: the pinch's fixed-point maths with the tap
   *  standing in for the pair of fingers and the photo at rest. */
  function toggleZoom(container: HTMLElement, tapX: number, tapY: number) {
    if (zoomed) {
      setZoomedAt(null);
      settle(PHOTO_REST);
      return;
    }
    const box = measure(container);
    const limit = panLimit(box, ZOOM_SCALE);
    setZoomedAt(shown);
    settle({
      x: clamp((box.width / 2 - (tapX - box.left)) * (ZOOM_SCALE - 1), limit.x),
      y: clamp((box.height / 2 - (tapY - box.top)) * (ZOOM_SCALE - 1), limit.y),
      scale: ZOOM_SCALE,
      scrim: PHOTO_REST.scrim,
    });
  }

  /** What a pinch leaves behind. Anything close enough to resting goes back to
   *  it, so a fumbled pinch does not leave the photo a hair off its size and
   *  the set unsteppable. */
  function endPinch() {
    pinch.current = null;
    if (photoScale.get() < PINCH_SETTLE_SCALE) {
      setZoomedAt(null);
      settle(PHOTO_REST);
      return;
    }
    setZoomedAt(shown);
  }

  /** The pinch measured from the two fingers on the glass now: how far apart
   *  they are, and where the photograph is under them. Seeded when the pair
   *  arrives, and again when the pair itself changes. */
  function seedPinch(container: HTMLElement) {
    const [first, second] = [...pointers.current.values()];
    if (!first || !second) return;
    const box = measure(container);
    pinch.current = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      scale: photoScale.get(),
      midpoint: {
        x: (first.x + second.x) / 2 - box.left,
        y: (first.y + second.y) / 2 - box.top,
      },
      offset: { x: photoX.get(), y: photoY.get() },
      box,
    };
  }

  function startTouch(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    const container = event.currentTarget;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    // Taken on the press rather than on an axis, the way the mouse drag below
    // does it: a pinch is two fingers that both leave this box, and there is
    // nothing behind a full-screen layer that wants the pointer back.
    container.setPointerCapture?.(event.pointerId);

    if (pointers.current.size >= 2) {
      // A second finger ends whatever the first one was starting.
      const pulling = touchAxis.current === "y";
      touchStart.current = null;
      touchAxis.current = null;
      lastTap.current = null;
      pan.current = null;
      spent.current = true;
      stopRuns();
      // A pull had the photograph down the screen, smaller, on a faded scrim,
      // and the pinch is seeded from wherever the photo is. Put back to rest
      // first, or the pinch inherits the pull's pose and a zoom that commits
      // keeps it: the scrim stays half faded with nothing pulling it.
      if (pulling) writePhoto(PHOTO_REST, "jump");
      seedPinch(container);
      return;
    }

    if (spent.current) return;

    // Zoomed in, one finger moves the photograph. It never steps the set and
    // it never closes: the visitor is inside one picture. A finger that stays
    // put is still a tap, which is what the release below falls back to and
    // what leaves the double tap a way back out of the zoom.
    if (zoomed || photoScale.get() > 1) {
      pan.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
        offset: { x: photoX.get(), y: photoY.get() },
        box: measure(container),
      };
      return;
    }

    touchStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
    touchAxis.current = null;
  }

  function moveTouch(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    const tracked = pointers.current.get(event.pointerId);
    if (!tracked) return;
    tracked.x = event.clientX;
    tracked.y = event.clientY;

    const pinching = pinch.current;
    if (pinching) {
      const [first, second] = [...pointers.current.values()];
      if (!first || !second) return;
      const distance = Math.max(
        1,
        Math.hypot(second.x - first.x, second.y - first.y),
      );
      const scale = Math.min(
        MAX_ZOOM,
        Math.max(1, (pinching.scale * distance) / pinching.distance),
      );
      const midX = (first.x + second.x) / 2 - pinching.box.left;
      const midY = (first.y + second.y) / 2 - pinching.box.top;
      // The photograph is drawn about the middle of its box, so a box point q
      // lands at c + (q - c) * scale + offset. The point that was under the
      // fingers when the pinch started is q there; this is the same equation
      // solved for the offset that keeps it under them at the new scale.
      const centreX = pinching.box.width / 2;
      const centreY = pinching.box.height / 2;
      const ratio = scale / pinching.scale;
      const limit = panLimit(pinching.box, scale);
      photoX.set(
        clamp(
          midX -
            centreX -
            (pinching.midpoint.x - centreX - pinching.offset.x) * ratio,
          limit.x,
        ),
      );
      photoY.set(
        clamp(
          midY -
            centreY -
            (pinching.midpoint.y - centreY - pinching.offset.y) * ratio,
          limit.y,
        ),
      );
      photoScale.set(scale);
      return;
    }

    const panning = pan.current;
    if (panning) {
      // Clamped on every move rather than on release, so the photo simply
      // stops at its own edge and there is nothing to put back afterwards.
      const limit = panLimit(panning.box, photoScale.get());
      photoX.set(clamp(panning.offset.x + event.clientX - panning.x, limit.x));
      photoY.set(clamp(panning.offset.y + event.clientY - panning.y, limit.y));
      return;
    }

    const start = touchStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (touchAxis.current === null) {
      // Decided once and remembered, the way the mouse drag below does it: a
      // drag that curls at the end must not be re-judged on its endpoints.
      const axis = declareAxis(dx, dy);
      if (!axis) return;
      touchAxis.current = axis;
    }
    if (touchAxis.current !== "y") return;
    // A sideways drag has nowhere to travel to, since the photo fills the
    // frame and the next one is not drawn, so it is read on release alone. A
    // downward one carries the photo with the finger, because the finger is
    // throwing it away and has to see it go. Upward is clamped out: there is
    // no gesture up there.
    const travel = Math.max(0, dy);
    const progress = Math.min(1, travel / PULL_FADE_PX);
    photoY.set(travel);
    photoScale.set(1 - (1 - PULL_SCALE) * progress);
    scrimOpacity.set(1 - (1 - PULL_SCRIM) * progress);
  }

  function endTouch(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    pointers.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);
    if (pointers.current.size === 0) spent.current = false;

    if (pinch.current) {
      // Down to one finger is the end of a pinch. What is left on the glass
      // belongs to no gesture until it lifts.
      if (pointers.current.size < 2) {
        endPinch();
        return;
      }
      // A third finger was down and one of the pair has gone, so the two left
      // are another pair. Measured again from where they are and from the size
      // the photograph is at now: the distance the pinch started on belongs to
      // fingers that are no longer holding it, and read against the new pair
      // it makes the photo jump.
      seedPinch(event.currentTarget);
      return;
    }

    // A pan's own start point stands in for the tap's below, so a finger that
    // came down zoomed in and did not travel is read as a tap after all.
    const panning = pan.current;
    pan.current = null;
    const start = touchStart.current ?? panning;
    const axis = touchAxis.current;
    touchStart.current = null;
    touchAxis.current = null;
    if (!start || spent.current) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Math.max(1, event.timeStamp - start.time);

    // A tap that barely moved is a candidate for the double tap; two of them
    // close together in time and place toggle the zoom. Judged before the axis
    // is: a finger tapping twice wobbles further than the slop an axis is
    // declared on, and that wobble is not a gesture.
    if (Math.hypot(dx, dy) < DOUBLE_TAP_SLOP_PX) {
      if (axis) settle(PHOTO_REST);
      const previous = lastTap.current;
      if (
        previous &&
        event.timeStamp - previous.time < DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <
          DOUBLE_TAP_SLOP_PX
      ) {
        lastTap.current = null;
        toggleZoom(event.currentTarget, event.clientX, event.clientY);
        return;
      }
      lastTap.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
      return;
    }

    // A pan is over. It was clamped as it went, so there is nothing to put
    // back, and it is neither a step nor a close whatever direction it took.
    if (panning) return;

    if (axis === "y") {
      // Far enough down, or quick enough down, and the photo is thrown away.
      // The distance floor on the flick is the mouse drag's own: a few pixels
      // delivered in one tick are quick by arithmetic, not by intent. The
      // close goes through handleOpenChange like every other one, so the
      // resets stay in one place.
      if (
        dy > PULL_CLOSE_PX ||
        (dy > MIN_SWIPE_PX && dy / elapsed > SWIPE_VELOCITY_PX_MS)
      ) {
        handleOpenChange(false);
        return;
      }
      settle(PHOTO_REST);
      return;
    }

    if (axis !== "x" || !many) return;
    const velocity = Math.abs(dx) / elapsed;
    if (Math.abs(dx) < SWIPE_DISTANCE_PX && velocity < SWIPE_VELOCITY_PX_MS) {
      return;
    }
    step(dx < 0 ? 1 : -1);
  }

  // The mouse's own gesture. Touch already had one; a cursor was offered the
  // chevrons and nothing else, so the photo sat there looking draggable and
  // was not. There is no live follow: the photo fills the frame and has
  // nowhere to travel to, so the drag is read on release alone.
  const dragStart = useRef<{
    x: number;
    y: number;
    time: number;
    width: number;
    pointerId: number;
  } | null>(null);
  const dragAxis = useRef<"x" | "y" | null>(null);
  // A gesture that committed to the horizontal is the photo's, whether or not
  // it went far enough to turn the page. The click the browser fires at the
  // end of it must not also land as a tap.
  const suppressClick = useRef(false);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (event.pointerType !== "mouse" || !many || zoomed) return;
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      width: event.currentTarget.clientWidth || 1,
      pointerId: event.pointerId,
    };
    dragAxis.current = null;
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || dragAxis.current !== null) return;
    // Decided once and remembered, the same way the fan does it: a horizontal
    // drag that curls at the end must not be re-judged on its endpoints.
    const axis = declareAxis(event.clientX - start.x, event.clientY - start.y);
    if (!axis) return;
    dragAxis.current = axis;
    // The capture waits for the axis. Taken on the press it would retarget the
    // click the browser fires afterwards, and the double tap below reads its
    // own events. Optional call: jsdom has no pointer capture, and a drag that
    // cannot be captured still works, it just stops tracking a cursor that
    // leaves the frame.
    if (axis === "x") {
      event.currentTarget.setPointerCapture?.(start.pointerId);
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    const axis = dragAxis.current;
    releasePointer(event.currentTarget, start?.pointerId);
    dragStart.current = null;
    dragAxis.current = null;
    if (!start || axis !== "x") return;
    suppressClick.current = true;

    const direction = swipeVerdict({
      dx: event.clientX - start.x,
      elapsed: event.timeStamp - start.time,
      width: start.width,
    });
    if (direction) step(direction);
  }

  function cancelTouch(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    const pinching = pinch.current !== null;
    pointers.current.delete(event.pointerId);
    releasePointer(event.currentTarget, event.pointerId);
    pan.current = null;
    if (pointers.current.size === 0) spent.current = false;
    // A cancelled gesture is not a decision. A pinch keeps whatever size it
    // reached, on the same rule it would have ended on; a pull goes back. A
    // pan has nothing to put back, having been clamped as it went.
    if (pinching) endPinch();
    else if (!zoomed) settle(PHOTO_REST);
    touchStart.current = null;
    touchAxis.current = null;
  }

  function cancelDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    releasePointer(event.currentTarget, dragStart.current?.pointerId);
    dragStart.current = null;
    dragAxis.current = null;
    suppressClick.current = false;
  }

  function swallowDraggedClick(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // One horizontal trackpad swipe is one photo, on the fan's numbers. No
  // onTravel: there is nothing to move under the gesture, so the fan's live
  // walk has no counterpart here and the step lands on the commit alone. The
  // listener sits on the frame, which is mounted for both views, and is turned
  // off rather than unmounted wherever the gesture does not belong.
  const frameRef = useWheelStep({
    enabled: many && !sheet && !zoomed,
    commitRatio: SWIPE_DISTANCE_RATIO,
    settleMs: WHEEL_SETTLE_MS,
    onStep: step,
  });

  return {
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
  };
}
