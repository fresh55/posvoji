import { STAGE_WIDTH } from "@/components/animal-dialog/photo-wash";
import {
  DESKTOP_SHELL_QUERY,
  PHONE_SHELL_QUERY,
} from "@/lib/viewport-queries";
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
  //
  // The width cap is the landscape phone. Every number in this layout is a
  // share of the stage's width, and the stage is the screen: at 844x390 the
  // 1.6 aspect made it 528px tall, a photograph a third taller than the
  // viewport with the animal's name somewhere below it. Capped at 24rem the
  // print is 253px wide, which is what it measures on a 390px phone held
  // upright, and the name row is on screen with it.
  //
  // The second cap is the same complaint from the other side: a small tablet
  // held upright is still this layout, and the stage went on growing with the
  // width. At 639x800 it was 639 wide and 524 tall, a photograph filling two
  // thirds of the screen with the card pushed off the bottom of it. Held at
  // 30rem from 480px up the print is 384px wide, a little larger than a phone
  // draws it, and the stage is 393px tall. Below 480 the fan stays full bleed,
  // because there the outermost prints running off the screen edges are what
  // says there are more photographs.
  //
  // Written against not-short so the two caps cannot argue: a landscape phone
  // is wide enough for this one and it would undo the 24rem above, and which
  // of two max-widths wins is a question about the order Tailwind writes them
  // in rather than about the layout.
  stageClass:
    "w-full overflow-x-clip short:mx-auto short:max-w-sm not-short:min-[30rem]:mx-auto not-short:min-[30rem]:max-w-[30rem]",
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
//
// Height as well as width, and the same pair of numbers Tailwind's short
// variant asks about (max-height: 32rem). A phone held sideways is 844x390:
// wide enough for the desktop fan, and then the fan took 267px of the 390 and
// left the card a 98px slot to scroll 488px of text in. The dialog's own shell
// switches on the same question, so the two cannot disagree about which layout
// is standing.
// The fan stands on the same question the shell does, from the one place both
// halves of it are derived (lib/viewport-queries.ts). Re-exported under the
// fan's own name because that is what this module's callers and its tests ask
// for.
export const DESKTOP_FAN_QUERY = DESKTOP_SHELL_QUERY;

export { PHONE_SHELL_QUERY };

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
