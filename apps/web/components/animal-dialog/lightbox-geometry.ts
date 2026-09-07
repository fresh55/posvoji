// The frame fills the content box inside its own padding, and these mirror the
// padding set on that box. Working the landing rect out rather than measuring
// it means the first frame the browser paints is already the small one sitting
// on the fan, so the full-size photo is never shown and then yanked away.
export const FRAME_PHONE_PAD = 16;

export const FRAME_WIDE_PAD = 40;

export const WIDE_FROM = 640;

/**
 * Where the frame has to start for the photo to look like it grew out of the
 * one in the fan. The scale is uniform: the two boxes are cropped differently,
 * and stretching one into the other reads as a squash rather than a zoom.
 */
export function framePose(origin: DOMRect | undefined) {
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
export type PhotoBox = {
  width: number;
  height: number;
  left: number;
  top: number;
  drawnWidth: number;
  drawnHeight: number;
};

export function measure(container: HTMLElement): PhotoBox {
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
export function panLimit(box: PhotoBox, scale: number) {
  return {
    x: Math.max(0, (box.drawnWidth * scale - box.width) / 2),
    y: Math.max(0, (box.drawnHeight * scale - box.height) / 2),
  };
}

export function clamp(value: number, limit: number) {
  return Math.min(limit, Math.max(-limit, value));
}
