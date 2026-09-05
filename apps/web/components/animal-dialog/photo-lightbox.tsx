"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, XIcon } from "lucide-react";
import { animate, m, useMotionValue, useReducedMotion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { LightboxWash } from "@/components/animal-dialog/photo-wash";
import { useWheelStep } from "@/components/animal-dialog/use-wheel-step";
import { AnimalPhoto } from "@/components/animal-photo";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

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

// The frame fills the content box inside its own padding, and these mirror the
// padding set on that box. Working the landing rect out rather than measuring
// it means the first frame the browser paints is already the small one sitting
// on the fan, so the full-size photo is never shown and then yanked away.
const FRAME_PHONE_PAD = 16;
const FRAME_WIDE_PAD = 40;
const WIDE_FROM = 640;

// A sideways drag past this many pixels, or one quick enough to look like a
// flick even short of it, changes the photo. The same shape as the card
// gallery's own swipe, since a visitor's thumb should not have to relearn it
// for the full-screen view.
//
// A flat count of pixels rather than the shared SWIPE_DISTANCE_RATIO, and more
// sensitive than that ratio at this width, on purpose: a thumb on a
// full-screen photo is not a cursor. Not a number to unify.
const SWIPE_DISTANCE_PX = 48;

// Two taps land inside this window and this close together to read as one
// double tap rather than two separate ones.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const ZOOM_SCALE = 2;

// As far as a pinch may take the photograph. Past four the cached copy has run
// out of pixels and what grows is the upscaler, not the picture.
const MAX_ZOOM = 4;
// A pinch that ends this close to the normal size was a fumble rather than a
// zoom, and the photo goes back to resting rather than sitting a hair off it.
const PINCH_SETTLE_SCALE = 1.05;

// A downward drag past this many pixels, or one quick enough to read as a
// flick, throws the lightbox away. Shorter than the animal dialog's own 140:
// nothing scrolls behind this layer, so there is no scroll flick to survive.
const PULL_CLOSE_PX = 100;
// The travel the photo shrinks and the scrim fades across, so a pull shows how
// far along it is before it commits to anything.
const PULL_FADE_PX = 200;
const PULL_SCALE = 0.9;
const PULL_SCRIM = 0.3;

/** Everywhere a gesture can leave the photo: where it sits, how big it is, and
 *  how much of the ground behind it is left. The four are always written
 *  together, so they are named together. */
type PhotoPose = { x: number; y: number; scale: number; scrim: number };

// Where the photo sits when no gesture is holding it.
const PHOTO_REST: PhotoPose = { x: 0, y: 0, scale: 1, scrim: 1 };

// The tail of a gesture: a spring back, a snap out, the step a double tap
// takes. Nothing here starts on its own; every run is something a finger has
// just finished doing.
const GESTURE_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.6,
} as const;

// How many photos an animal needs before the lightbox offers an overview of
// them. The fan already shows five at once, so up to five the overview would
// only repeat what is on the page behind it; six is where a grid starts saying
// something the fan does not.
export const SHEET_FROM = 6;

// Which of the two views the lightbox is showing: the one photo it opened on,
// or the contact sheet of the whole set.
type LightboxView = "photo" | "sheet";

/**
 * Where the frame has to start for the photo to look like it grew out of the
 * one in the fan. The scale is uniform: the two boxes are cropped differently,
 * and stretching one into the other reads as a squash rather than a zoom.
 */
function framePose(origin: DOMRect | undefined) {
  if (!origin?.width || typeof window === "undefined") return undefined;
  const pad = window.innerWidth >= WIDE_FROM ? FRAME_WIDE_PAD : FRAME_PHONE_PAD;
  const width = window.innerWidth - pad * 2;
  const height = window.innerHeight - pad * 2;
  if (width <= 0 || height <= 0) return undefined;
  return {
    x: origin.left + origin.width / 2 - (pad + width / 2),
    y: origin.top + origin.height / 2 - (pad + height / 2),
    scale: origin.width / width,
  };
}

/**
 * The photo box and the photograph drawn inside it, measured once at the start
 * of a gesture.
 *
 * The photo is object-contain, so it leaves ground either side of itself, and
 * it is the drawn rectangle rather than the box that a pan has to keep on
 * screen: clamping to the box would let a letterboxed photo be dragged out of
 * sight and still count as being in bounds. clientWidth rather than the
 * bounding rect for the size, because the frame around this is still carrying
 * the opening morph's scale on the first frames.
 */
type PhotoBox = {
  width: number;
  height: number;
  left: number;
  top: number;
  drawnWidth: number;
  drawnHeight: number;
};

function measure(container: HTMLElement): PhotoBox {
  const rect = container.getBoundingClientRect();
  const width = container.clientWidth || rect.width;
  const height = container.clientHeight || rect.height;
  const image = container.querySelector("img");
  const naturalWidth = image?.naturalWidth ?? 0;
  const naturalHeight = image?.naturalHeight ?? 0;
  // Before the photo has decoded there is nothing to work the drawn box out
  // from. The box itself is the honest fallback: it is what the clamp would
  // settle on anyway once a photo fills it.
  const fit =
    naturalWidth && naturalHeight
      ? Math.min(width / naturalWidth, height / naturalHeight)
      : 0;
  return {
    width,
    height,
    left: rect.left,
    top: rect.top,
    drawnWidth: fit ? naturalWidth * fit : width,
    drawnHeight: fit ? naturalHeight * fit : height,
  };
}

/** How far the photo may travel from the middle before the ground shows on the
 *  side the finger is pulling away from. Zero on an axis the photo does not
 *  overflow, which is what pins a photo smaller than its box to the middle. */
function panLimit(box: PhotoBox, scale: number) {
  return {
    x: Math.max(0, (box.drawnWidth * scale - box.width) / 2),
    y: Math.max(0, (box.drawnHeight * scale - box.height) / 2),
  };
}

function clamp(value: number, limit: number) {
  return Math.min(limit, Math.max(-limit, value));
}

function stopPointer(event: PointerEvent<HTMLDivElement>) {
  event.stopPropagation();
}

// A nested dialog rather than a bare overlay: Radix stacks the layers, so
// Escape closes this one and leaves the animal open underneath.
export function PhotoLightbox({
  open,
  onOpenChange,
  images,
  index,
  onIndexChange,
  title,
  originRect,
  initialView = "photo",
  returnFocusFallback,
}: {
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
}) {
  const { messages, t } = useI18n();
  const shouldReduceMotion = useReducedMotion();
  // The photo that was clicked is where focus belongs on the way out, and a
  // dialog opened from the URL has no trigger for Radix to hand it back to.
  const returnFocus = useRef<HTMLElement | null>(null);
  const image = images[index];
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
  // state a render after the step. jsdom cannot see a transform, so this is
  // also what the tests read, through data-zoomed on the box below.
  const [zoomedAt, setZoomedAt] = useState<number | null>(null);
  const zoomed = zoomedAt === index;

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
    writePhoto(PHOTO_REST, "jump");
  }, [stopRuns, writePhoto]);

  // The lightbox stays mounted across visits and the index is shared with the
  // fan behind it, so the photo under the gesture can change without anything
  // here being told. The cleanup is what stops a spring outliving the picture
  // it was landing.
  useEffect(() => {
    restPhoto();
    return stopRuns;
  }, [open, index, restPhoto, stopRuns]);

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

  function showPhoto(next: number) {
    onIndexChange(next);
    setChosenView("photo");
  }

  function step(direction: -1 | 1) {
    onIndexChange((index + direction + images.length) % images.length);
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
    setZoomedAt(index);
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
    setZoomedAt(index);
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
      touchStart.current = null;
      touchAxis.current = null;
      lastTap.current = null;
      pan.current = null;
      spent.current = true;
      stopRuns();
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
      if (pointers.current.size < 2) endPinch();
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
              onIndexChange(wanted);
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
            initial={shouldReduceMotion ? false : (framePose(originRect) ?? false)}
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
                      aria-current={position === index ? "true" : undefined}
                      className={cn(
                        "relative aspect-[4/3] overflow-hidden rounded-ui bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        position === index && "ring-2 ring-background",
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
                    alt={t(
                      many ? "photoAlt" : "photoAltSingle",
                      { name: title, current: index + 1, total: images.length },
                    )}
                    // The full screen, which is what puts the top of the ladder
                    // on every phone and most desktops. That is the right answer
                    // here: this is the view somebody opened to look closely.
                    sizes="100vw"
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
                {index + 1} / {images.length}
              </Badge>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {t("photoCount", { current: index + 1, total: images.length })}
              </span>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
