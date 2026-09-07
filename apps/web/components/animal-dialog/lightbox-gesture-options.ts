// A sideways drag past this many pixels, or one quick enough to look like a
// flick even short of it, changes the photo. The same shape as the card
// gallery's own swipe, since a visitor's thumb should not have to relearn it
// for the full-screen view.
//
// A flat count of pixels rather than the shared SWIPE_DISTANCE_RATIO, and more
// sensitive than that ratio at this width, on purpose: a thumb on a
// full-screen photo is not a cursor. Not a number to unify.
export const SWIPE_DISTANCE_PX = 48;

// Two taps land inside this window and this close together to read as one
// double tap rather than two separate ones.
export const DOUBLE_TAP_MS = 300;

export const DOUBLE_TAP_SLOP_PX = 24;

export const ZOOM_SCALE = 2;

// As far as a pinch may take the photograph. Past four the cached copy has run
// out of pixels and what grows is the upscaler, not the picture.
export const MAX_ZOOM = 4;

// A pinch that ends this close to the normal size was a fumble rather than a
// zoom, and the photo goes back to resting rather than sitting a hair off it.
export const PINCH_SETTLE_SCALE = 1.05;

// A downward drag past this many pixels, or one quick enough to read as a
// flick, throws the lightbox away. Shorter than the animal dialog's own 140:
// nothing scrolls behind this layer, so there is no scroll flick to survive.
export const PULL_CLOSE_PX = 100;

// The travel the photo shrinks and the scrim fades across, so a pull shows how
// far along it is before it commits to anything.
export const PULL_FADE_PX = 200;

export const PULL_SCALE = 0.9;

export const PULL_SCRIM = 0.3;

/** Everywhere a gesture can leave the photo: where it sits, how big it is, and
 *  how much of the ground behind it is left. The four are always written
 *  together, so they are named together. */
export type PhotoPose = { x: number; y: number; scale: number; scrim: number };

// Where the photo sits when no gesture is holding it.
export const PHOTO_REST: PhotoPose = { x: 0, y: 0, scale: 1, scrim: 1 };

// The tail of a gesture: a spring back, a snap out, the step a double tap
// takes. Nothing here starts on its own; every run is something a finger has
// just finished doing.
export const GESTURE_SPRING = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.6,
} as const;

export const SHEET_FROM = 6;
export type LightboxView = "photo" | "sheet";
