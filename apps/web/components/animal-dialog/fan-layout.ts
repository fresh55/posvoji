import { STAGE_WIDTH } from "@/components/animal-dialog/photo-wash";
import { useSyncExternalStore } from "react";
import { DESKTOP_DEPTHS, FanDepths, PHONE_DEPTHS } from "./fan-geometry";

// The desktop boxes: every photo box is the same height and is pulled into
// place by transforms, so the fan scales with the dialog instead of with a
// pixel guess.
//
// What the class states is --print-w, the width of a 4:3 print at this
// breakpoint. The print itself is sized inline off that, because a photo that
// is not 4:3 is drawn narrower (see printBox) and a media query cannot be
// written into an inline style.
export const DESKTOP_PHOTO_BOX = "absolute bottom-0 left-1/2 [--print-w:58%]";

// A lone photo has no fan to sit in the middle of, so it takes more of the
// stage rather than floating there at fan size.
export const DESKTOP_SOLO_BOX = "absolute bottom-0 left-1/2 [--print-w:72%]";

export const DESKTOP_STAGE_ASPECT = "aspect-[2.3/1]";

export const DESKTOP_SOLO_STAGE_ASPECT = "aspect-[1.85/1]";

// The phone's boxes come in two sizes: the compact tier for short phones,
// where every stage pixel is a card pixel not shown, and a taller tier from
// 760px of viewport up, where the card fits on screen either way and the
// photo may as well take the room. 760 splits the small phones from the rest:
// an SE-class 667 stays compact, anything iPhone X-shaped and up gets the
// large fan.
// Written out in full rather than composed from a shared prefix: Tailwind
// reads classes out of the raw source, and a name built through interpolation
// is one it never generates.
export const PHONE_PHOTO_BOX =
  "absolute bottom-2 left-1/2 [--print-w:66%] [@media(min-height:47.5rem)]:[--print-w:80%]";

export const PHONE_SOLO_BOX =
  "absolute bottom-2 left-1/2 [--print-w:76%] [@media(min-height:47.5rem)]:[--print-w:88%]";

export const PHONE_STAGE_ASPECT =
  "aspect-[1.6/1] [@media(min-height:47.5rem)]:aspect-[1.22/1]";

export const PHONE_SOLO_STAGE_ASPECT =
  "aspect-[1.5/1] [@media(min-height:47.5rem)]:aspect-[1.35/1]";

/** What one layout of the fan is, beyond the recipe both layouts share. */
export type FanGeometry = {
  /** Names the layout for the tests and for anything reading the DOM. */
  slot: string;
  depths: FanDepths;
  photoBox: string;
  soloBox: string;
  stageAspect: string;
  soloStageAspect: string;
  /** What the layout adds around the stage. Neither side of the breakpoint is
   *  stated in CSS: only one geometry is ever mounted. */
  stageClass: string;
  /** Chevrons are a pointer affordance, and the phone has no pointer. */
  chevrons: boolean;
};

export const PHONE_FAN: FanGeometry = {
  slot: "photo-fan",
  depths: PHONE_DEPTHS,
  photoBox: PHONE_PHOTO_BOX,
  soloBox: PHONE_SOLO_BOX,
  stageAspect: PHONE_STAGE_ASPECT,
  soloStageAspect: PHONE_SOLO_STAGE_ASPECT,
  // overflow-x-clip and not hidden: the neighbours have to clip at the screen
  // edge or they would hand the dialog's scroller a horizontal scrollbar, but
  // the drop still hangs the side photos a few pixels past the stage's bottom
  // and clip on one axis is the one combination that leaves the other visible.
  stageClass: "w-full overflow-x-clip",
  chevrons: false,
};

export const DESKTOP_FAN: FanGeometry = {
  slot: "photo-spread",
  depths: DESKTOP_DEPTHS,
  photoBox: DESKTOP_PHOTO_BOX,
  soloBox: DESKTOP_SOLO_BOX,
  stageAspect: DESKTOP_STAGE_ASPECT,
  soloStageAspect: DESKTOP_SOLO_STAGE_ASPECT,
  stageClass: `mx-auto ${STAGE_WIDTH}`,
  chevrons: true,
};

// Tailwind's sm, the line the two geometries were drawn either side of. Read
// rather than left to CSS because the fan used to mount both layouts and hide
// one of them: 38 nodes, five eager images and fifty MotionValues idling for a
// fan nobody could see.
export const DESKTOP_FAN_QUERY = "(min-width: 640px)";

export function subscribeToFanQuery(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_FAN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function readFanQuery() {
  return window.matchMedia(DESKTOP_FAN_QUERY).matches;
}

// Never drawn: the dialog only exists once an animal is open, and the animal
// comes from a location store whose own server snapshot is empty. The answer
// still has to be a constant, because React reads it while hydrating.
export function fanQueryOnServer() {
  return false;
}

/** Which geometry the fan stands in, live: a resize across the breakpoint
 *  swaps it. */
export function useDesktopFan() {
  return useSyncExternalStore(
    subscribeToFanQuery,
    readFanQuery,
    fanQueryOnServer,
  );
}
