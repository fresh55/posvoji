// The dialog counts photos where the grid card shows dots: the card is a
// thumbnail whose gallery is incidental, and this is the surface someone came
// to to look through them, where "4 / 12" is the useful answer.
//
// A fixed inset: the badge only ever sits on the front print, whose paper
// margin is zero, so reading that margin would leave it flush in the corner.
//
// A solid ground rather than a backdrop filter. What it stands on is a
// photograph the fan moves every frame, and a backdrop filter is re-sampled on
// every one of them by a real GPU. At 90% the count reads over any photo,
// which is all the blur was ever there for.
export const PHOTO_BADGE_CLASS =
  "absolute right-1.5 bottom-1.5 h-5 bg-background/90 px-1.5 text-3xs tabular-nums shadow-xs";

// A photo edge has to read against the photo, not against the surface behind
// it, so the border is drawn from the foreground: dark on light, light on
// dark.
//
// This is the paper alone: three layers down from the button, because each of
// them owns something the others must not touch. The seat holds MotionValues a
// drag writes every frame; the hover layer scales and straightens the photo
// without writing to them; and the paper clips the print, which is why the
// shadow that deepens as a photo comes forward is drawn beside it rather than
// on it.
export const PHOTO_FRAME_CLASS =
  "origin-bottom overflow-hidden rounded-ui border border-foreground/10 bg-background";

// The picture's own well. Its ground is the one the blur placeholder paints
// over, so it is this and not the paper that fills while a photo is on its
// way, and it is a tint of the foreground rather than bg-muted: muted is near
// white on the light theme, so a print whose photo had not arrived read as a
// blank card. A ground clearly darker than the paper reads as a photograph
// coming.
//
// The margin is a clip, not an inset. The well fills the paper and the clip
// hides the outer band of the picture; inset by the margin instead, the well
// was re-laid-out as the margin was written, which measured 1.7 layouts per
// pointer move. At six pixels on a print this size it is the same picture,
// a hair larger under object-cover. The corner the clip rounds to follows the
// paper's, less the margin, which is what keeps the two curves concentric
// instead of leaving a fat wedge at each corner.
export const PHOTO_WELL_CLASS =
  "absolute inset-0 bg-foreground/8 [clip-path:inset(var(--print-margin)_round_calc(var(--radius-ui)_-_var(--print-margin)))]";

// The seat: where the fan puts this photo, and where the focus ring is drawn.
//
// Pinned as a composited layer of its own, and told that nothing inside it can
// affect the layout outside. Measured on a drag at 4x CPU throttle: the pin
// took the long tasks from three to one and a third off the paint events, and
// halved the raster time. It costs a few hundred KB of GPU memory per print,
// which for the five the fan draws is a fair price.
export const PHOTO_SEAT_CLASS =
  "origin-bottom rounded-ui outline-none will-change-transform contain-layout focus-visible:ring-2 focus-visible:ring-ring";
