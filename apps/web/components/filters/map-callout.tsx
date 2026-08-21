"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Species } from "@posvoji/schema";

import { SPECIES_ICONS } from "@/lib/animal-icons";
import { MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "@/lib/geo";
import { cn } from "@/lib/utils";

// The label's type, written in the pixels it is meant to be read at rather
// than in the map's own units. The plate is drawn anywhere from a phone-width
// stage to a fourteen-hundred-pixel desktop one, and a size set in user units
// swings with it: the 5.5 units this used to carry came out twelve pixels on a
// tablet and twenty-odd on a wide desktop, which is not one size, it is two.
// ShelterMap measures the plate and the division below turns these back into
// user units.
// A hierarchy and not two sizes a point apart: the title leads on weight and
// on size together, and the muted lines under it are clearly the answer to it
// rather than more of it. shadcn's own card sets a semibold heading over muted
// body copy, which is the same relationship at a larger size.
const TITLE_PX = 13;
const META_PX = 11;
// Relaxed, the way a card is set and a label is not. At 1.15 three stacked
// facts read as one compressed block; this is what makes them three lines.
const LEADING = 1.35;
// Between the title and the muted lines under it. Written here rather than as
// a fraction of the type, because it is the gap the eye reads as "a new line
// of this card", not a property of the letters on either side of it.
const LINE_GAP_PX = 4;
// Above the species row, which is a different kind of fact from the words over
// it and needs to be seen as one: glyphs and counts, not a sentence.
const SPECIES_GAP_PX = 7;
// The knockout radius for the plate's one piece of SVG text, the kilometre
// label on the origin line, which is set straight on the country and has a
// dashed line running through it. The annotation itself carries a surface now
// and needs none of this; see the chip's own geometry below.
const HALO_PX = 1.7;

// The chip the annotation sits on, written in the pixels it is meant to be
// seen at like the type above it, and divided by the plate's scale in
// calloutType. Tooltip register throughout: this is the site's popover, drawn
// small on a map, not a panel.
//
// A halo was tried first and rejected on sight: with no surface at all the
// type has to be read against whatever the region under it happens to be, and
// strengthening the knockout until that worked turned the names into sticker
// lettering. A real surface makes the contrast a matter of tokens instead of
// of luck.
// Card padding, not label padding. A chip carrying a name, a count and a row
// of species is a small hover card and wants a hover card's room; at nine by
// six the three lines sat against the corners and the whole thing read square.
const PAD_X_PX = 12;
const PAD_Y_PX = 9;
// A callout with nothing under its title is not a card at all, it is a
// tooltip, and it keeps a tooltip's tighter vertical padding: nine points of
// air over and under a single word is a plaque. The horizontal padding does
// not change with it, so every chip on the plate keeps one left edge.
const PAD_Y_TIGHT_PX = 6;
// The corner that reads as rounded at that padding. --radius-ui is 0.625rem,
// which is tuned for a dialog and looks barely turned on a box this small, so
// the chip takes the popover end of the family instead.
const RADIUS_PX = 8;
// The hairline around the chip, drawn as the first layer of the box-shadow
// rather than as a border. A border cannot be a hairline here: this type is
// laid out in user units and scaled up by the plate, so the width that comes
// out to one screen pixel is a fraction of a unit, and Chrome floors any
// positive border-width to a used value of 1 unit before the transform. At a
// plate drawn 2.63 pixels to the unit that turned a 0.38-unit specification
// into a 2.6-pixel frame: a widget border where a map wants a hairline.
// Measured in the browser; getComputedStyle reports the flooring outright.
// box-shadow spreads honour the fraction, so the ring is one.
const RING_PX = 1;
// The lift the old card had, in the same register: a hairline shadow, not a
// drop. Dark mode drops it entirely, the way the coins do (COIN_SHADOW in
// map-marker.tsx), because black on a near-black plate is only mud.
const SHADOW_Y_PX = 1;
const SHADOW_BLUR_PX = 2;
const SHADOW_ALPHA = 0.18;
// How far off the mark's own reach a chip sits when nothing displaces it, and
// how far short of the chip the leader stops. In pixels and divided by the
// plate's scale, like the rest of the chip: written in user units this gap was
// five rendered pixels on a phone plate and eighteen on a wide desktop one,
// and the distance between a mark and the thing naming it is a reading
// distance, so it is one distance.
const LABEL_GAP_PX = 12;
const LEADER_GAP_PX = 3;
// A box-shadow is drawn outside the element and a foreignObject clips at its
// own box, so the object carries exactly the shadow's reach as a margin and
// the chip is inset back into place.
const BLEED_PX = SHADOW_Y_PX + SHADOW_BLUR_PX;
// The column the text wraps inside. The card was 108 units wide and the picker
// draws the plate near 2.2 pixels a unit, so this is that same column, held to
// the same rendered width whatever size the plate is drawn at.
const BLOCK_PX = 238;
// One line of title over one of metadata, at this leading and with the gap
// between them. Used until the real content is measured, and as the floor
// after.
const MIN_BLOCK_PX = Math.round(
  TITLE_PX * LEADING + LINE_GAP_PX + META_PX * LEADING,
);

// What one rendered pixel is worth in user units. Clamped at both ends,
// because past them the honest division stops being the right answer: below,
// the name comes out smaller than the town anchors it stands among; above, it
// grows large enough to cover the region it names.
const MIN_UNITS_PER_PX = 0.26;
const MAX_UNITS_PER_PX = 0.6;

/** How many pixels the plate draws one user unit at, before anything has
 *  measured it. Roughly what the picker draws the map at on a tablet, which is
 *  the size this type was tuned against. Server rendering and the first client
 *  paint both take it, and a hover cannot land before the observer has
 *  answered, so nobody sees the guess. */
export const DEFAULT_PLATE_SCALE = 2.2;

/** Every size the annotation sets, in user units, for a plate drawn at `scale`
 *  pixels to the unit. Exported because the map sets one more piece of type in
 *  this register, the kilometre label on the origin line, and it has to come
 *  out the same size as the metadata it stands beside. */
export function calloutType(scale: number) {
  const unit = Math.min(
    Math.max(1 / (scale > 0 ? scale : DEFAULT_PLATE_SCALE), MIN_UNITS_PER_PX),
    MAX_UNITS_PER_PX,
  );
  return {
    unit,
    title: TITLE_PX * unit,
    metadata: META_PX * unit,
    halo: HALO_PX * unit,
    /** The chip's own outer width, and so the width the plate reserves for an
     *  annotation whatever the words turn out to be. The type wraps inside it
     *  less the padding; a chip with less to say draws narrower than this (see
     *  w-fit below) but is still laid out and reported against it. */
    width: BLOCK_PX * unit,
    floor: MIN_BLOCK_PX * unit,
    /** Unitless, so it is the one thing here the plate's scale does not
     *  divide: leading is a ratio of the type it is set on. */
    leading: LEADING,
    padX: PAD_X_PX * unit,
    /** A card's vertical padding, and a tooltip's. Which one a chip wears is
     *  decided by how much it has to say; see `dense` below. */
    padY: PAD_Y_PX * unit,
    padYTight: PAD_Y_TIGHT_PX * unit,
    lineGap: LINE_GAP_PX * unit,
    speciesGap: SPECIES_GAP_PX * unit,
    radius: RADIUS_PX * unit,
    /** The hairline's width. Named for what draws it, because what draws it is
     *  a shadow spread and not a border: see RING_PX. */
    ring: RING_PX * unit,
    shadowY: SHADOW_Y_PX * unit,
    shadowBlur: SHADOW_BLUR_PX * unit,
    bleed: BLEED_PX * unit,
    labelGap: LABEL_GAP_PX * unit,
    leaderGap: LEADER_GAP_PX * unit,
  };
}

// The knockout the type sits in. It was four blurred passes, which is a
// shadow doing an outline's job: a blur puts most of its alpha in the first
// fraction of a pixel and trails off from there, so over the darkest density
// greens the ground thinned to nothing and the letters were read against the
// region instead of against paper.
//
// Eight copies of the glyph around the compass at the halo's own radius are
// effectively a solid stroke instead, which is what a plate wants and what
// SVG text cannot ask for directly (paint-order:stroke is for SVG <text>, and
// this type is HTML in a foreignObject so it can wrap).
//
// --background and never a literal, in every layer: it is the dialog's own
// paper, so on dark the halo is nearly black, which is exactly what a dark
// plate needs.
// Under this much displacement, no leader. An atlas draws one only when the
// label has left the place it belongs to, and a unit or two of clamping at the
// frame is not that.
const LEADER_SLACK = 3;
const LEADER_WIDTH = 0.5;
// The frame margin the block keeps, the same one the plate's furniture keeps.
const FRAME_MARGIN = 2;

/** Where an annotation's block of type has landed, in the map's own user
 *  units. The plate needs it to get its own furniture out of the way: an
 *  annotation with no card under it interleaves with any town anchor it is
 *  drawn across, and the older convention is that the name answering a
 *  question outranks the name that was only ever furniture. See the anchor
 *  suppression in shelter-map.tsx. */
export type CalloutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** One annotation for markers and regions alike: haloed type laid straight on
 *  the country, the way a plate names a place, with a leader only when the
 *  frame has pushed the name off the thing it names.
 *
 *  It was a bordered popover with a caret once, which is the most web-widget
 *  thing that was ever drawn on this plate. A native <title> before that, which
 *  waited half a second and came in the browser's own colours. */
export function MapCallout({
  x,
  y,
  reach,
  title,
  metadata,
  note,
  species,
  scale = DEFAULT_PLATE_SCALE,
  rectKey = "",
  onRect,
}: {
  x: number;
  y: number;
  reach: number;
  title: string;
  metadata: string;
  /** A second metadata line, for an annotation with a second thing to say. An
   *  empty region uses it to name the shelters answering for the municipalities
   *  inside it: the first line says there are none here, and this one says who
   *  to call anyway. Its own line rather than a longer first one, because they
   *  are two statements and a middot between them would read as one, and
   *  because the names are long enough to wrap on their own. */
  note?: string;
  /** Who lives there, when the annotation is about one shelter. A third line
   *  of the site's own species glyphs with their counts. Absent for towns,
   *  clusters and regions, which answer for more than one house and would be
   *  summing up strangers. */
  species?: { species: Species; count: number }[];
  /** Pixels the plate draws one user unit at, measured by ShelterMap. Every
   *  size below is divided by it, so the label renders at the same size on a
   *  tablet and on a wide desktop. */
  scale?: number;
  /** Which annotation this is, among the ones the plate may be showing at
   *  once. More than one can stand at a time: a spotlight card is persistent
   *  while a hover raises a second one over another town, so the map keeps the
   *  rectangles keyed rather than keeping whichever spoke last. The default is
   *  a good enough name for a plate drawing only one. */
  rectKey?: string;
  /** Where this annotation's type has landed, and null once it is gone.
   *  Reported from a layout effect, so the map holds the rectangle before the
   *  browser paints and no anchor is ever drawn for one frame under a name
   *  about to cover it.
   *
   *  Has to keep its identity across renders (a useCallback in the map),
   *  because it is a dependency of the effect that reports: a callback built
   *  fresh every render would report on every render. */
  onRect?: (key: string, rect: CalloutRect | null) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const type = calloutType(scale);
  const [height, setHeight] = useState(type.floor);

  // The block's real height depends on how many lines the title and metadata
  // wrap to, which depends on their text and now on the plate's scale as well,
  // so it can only be known after a layout pass. Grow or shrink to fit once
  // measured, rather than estimating line counts from character widths
  // (fragile with break-words on proportional fonts).
  //
  // contentRef sits on the title/metadata block itself, not on the div that
  // wears h-full: that div's own box is pinned to the current height state, so
  // its scrollHeight could never report less than what is already set and the
  // block could grow but never shrink. The unbound inner block reports its own
  // natural height every time, whichever way it just changed.
  //
  // The species line joins the dependencies as a string of its own contents,
  // not as the array: the map builds a fresh array on every render and the
  // effect would then run on every render for nothing.
  const speciesKey = species
    ?.map((entry) => `${entry.species}:${entry.count}`)
    .join(",");
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const needed = Math.max(node.scrollHeight, type.floor);
    if (needed !== height) setHeight(needed);
  }, [title, metadata, note, speciesKey, type.floor, height]);

  // A chip with a title and nothing under it is a tooltip and is padded like
  // one; anything with a second line is a card. The species row counts, since
  // it is a line of the card whether or not it is made of words.
  const dense = !metadata && !note && !species?.length;
  const padY = dense ? type.padYTight : type.padY;

  // The chip's own box: the reserved column, and the measured type plus the
  // padding around it. Everything below places and reports this box rather
  // than the type inside it, which is what keeps the chip's edge, the leader's
  // end and the rectangle the plate suppresses anchors against all one thing.
  const boxWidth = type.width;
  const boxHeight = height + padY * 2;
  const { labelGap, leaderGap } = type;

  // Which side of the marker the chip belongs on, and where it would sit if
  // nothing were in the way.
  const onRight = x + reach + labelGap + boxWidth <= MAP_WIDTH - FRAME_MARGIN;
  const naturalX = onRight
    ? x + reach + labelGap
    : x - reach - labelGap - boxWidth;
  const naturalY = y - boxHeight / 2;
  const blockX = Math.min(
    Math.max(naturalX, FRAME_MARGIN),
    MAP_WIDTH - boxWidth - FRAME_MARGIN,
  );
  const blockY = Math.min(
    Math.max(naturalY, FRAME_MARGIN),
    MAP_HEIGHT - boxHeight - FRAME_MARGIN,
  );

  // The margin the foreignObject carries beyond the chip, so the shadow drawn
  // outside it is not sheared off along the object's own edge. Derived from
  // the shadow's reach rather than written as a number here.
  const pad = type.bleed;

  // A leader is drawn for a displaced label and for no other. The measure is
  // how far the frame pushed the block off the position it asked for, which is
  // the only thing that can move it: everything else about the placement is
  // decided above.
  const displaced =
    Math.hypot(blockX - naturalX, blockY - naturalY) > LEADER_SLACK;
  // The label's own end of the line: the chip's edge that faces the marker, a
  // hair short of the surface rather than under the type, level with the
  // middle of the chip.
  const leaderX = onRight
    ? blockX - leaderGap
    : blockX + boxWidth + leaderGap;
  const leaderY = blockY + boxHeight / 2;
  const dx = leaderX - x;
  const dy = leaderY - y;
  const span = Math.hypot(dx, dy) || 1;

  // The block's own rectangle, out to whoever asked for it. A second effect
  // and not a line inside the measuring one above, on purpose: the rectangle
  // moves whenever x, y or the plate's scale move, and that effect is keyed on
  // the words, so folding the report into it would miss an annotation that
  // changed place without changing a letter.
  //
  // It cannot loop with the measuring effect either. The dependencies are the
  // four numbers being reported and nothing else, all of them settled during
  // render, and what the map does with them (drops a town anchor that was
  // going to be read through this one) changes none of them. The report fires
  // once per rectangle and stops.
  //
  // The cleanup covers the annotation going away and the annotation moving
  // alike. On a move it runs in the same commit as the report that replaces
  // it, before the browser paints, so the two land together and no anchor
  // flashes back in between.
  useLayoutEffect(() => {
    if (!onRect) return;
    onRect(rectKey, { x: blockX, y: blockY, width: boxWidth, height: boxHeight });
    return () => onRect(rectKey, null);
  }, [onRect, rectKey, blockX, blockY, boxWidth, boxHeight]);

  return (
    <g
      aria-hidden
      data-map-callout
      className={cn(
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      {displaced && (
        <line
          data-map-leader
          // From the marker's own edge, so the mark is never drawn through.
          x1={x + (dx / span) * reach}
          y1={y + (dy / span) * reach}
          x2={leaderX}
          y2={leaderY}
          strokeWidth={LEADER_WIDTH}
          strokeLinecap="round"
          className="stroke-foreground opacity-55"
        />
      )}
      <foreignObject
        x={blockX - pad}
        y={blockY - pad}
        width={boxWidth + pad * 2}
        height={boxHeight + pad * 2}
      >
        {/* The bleed, and nothing else: the chip below is the box, and this
            wrapper only holds the room its shadow needs. A chip to the left of
            its marker is pushed against the edge the leader leaves from, so
            the two always meet. */}
        <div
          className={cn("flex h-full w-full", !onRight && "justify-end")}
          style={{ padding: pad }}
        >
          <div
            data-callout-chip
            className={cn(
              "flex flex-col justify-center",
              // The surface. bg-popover at 95% and not a backdrop-filter:
              // filters inside a foreignObject are unreliable across
              // browsers, and a chip that is only translucent enough to hint
              // at the country under it never has to be read against one.
              "rounded-ui bg-popover/95 text-popover-foreground",
              // Two layers, and two variables, because they answer to
              // different things: the ring is the chip's edge and belongs in
              // both themes, the lift is a light-mode shadow the way the coins
              // have one (COIN_SHADOW in map-marker.tsx), since black on a
              // near-black plate is only mud. Both carry offsets in plate
              // units, which only this render knows, so the numbers arrive as
              // variables and the utilities compose them.
              "shadow-[var(--callout-ring),var(--callout-lift)] dark:shadow-[var(--callout-ring)]",
              // As wide as the words need and never wider than the column the
              // plate reserved: a one-word region name is a chip, not a
              // plaque. The type still wraps at the column, because that is
              // what the height was measured against.
              "w-fit max-w-full",
              // A chip to the left of its marker sets ragged-left, so the
              // type ends where the leader starts instead of trailing off
              // away from the thing it names.
              !onRight && "text-right",
            )}
            style={
              {
                borderRadius: type.radius,
                paddingBlock: padY,
                paddingInline: type.padX,
                // A spread ring and no offset or blur, which is a border in
                // everything but the property it is set on. It paints just
                // outside the box rather than just inside it, so the chip
                // draws one screen pixel larger on each side than a border
                // would have: that is well inside the bleed the object
                // already carries for the shadow, and immaterial against the
                // twelve pixels the chip stands off its mark.
                "--callout-ring": `0 0 0 ${type.ring.toFixed(3)}px var(--border)`,
                "--callout-lift": `0 ${type.shadowY.toFixed(3)}px ${type.shadowBlur.toFixed(3)}px rgb(0 0 0 / ${SHADOW_ALPHA})`,
              } as CSSProperties
            }
          >
            {/* Measured, not the padded chip around it: see the effect's own
                comment for why the ref has to sit here. */}
            <div ref={contentRef} className="w-full">
              <span
                data-callout-title
                // Semibold and not medium: the title has to lead on weight as
                // well as on size, or a two-point difference between two greys
                // reads as one paragraph in two sizes.
                className="block w-full break-words font-semibold"
                style={{ fontSize: type.title, lineHeight: type.leading }}
              >
                {title}
              </span>
              {metadata && (
                <span
                  data-callout-metadata
                  className="block w-full break-words text-muted-foreground"
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    marginTop: type.lineGap,
                  }}
                >
                  {metadata}
                </span>
              )}
              {/* Same size and same ink as the line above it: this is the
                  other half of one answer, not a footnote to it. */}
              {note && (
                <span
                  data-callout-note
                  className="block w-full break-words text-muted-foreground"
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    marginTop: type.lineGap,
                  }}
                >
                  {note}
                </span>
              )}
              {species && species.length > 0 && (
                <span
                  data-callout-species
                  className={cn(
                    "flex w-full flex-wrap items-center text-muted-foreground tabular-nums",
                    !onRight && "justify-end",
                  )}
                  style={{
                    fontSize: type.metadata,
                    lineHeight: type.leading,
                    // More air than between the lines of words above it: this
                    // is a different kind of fact and has to be seen arriving.
                    marginTop: type.speciesGap,
                    // Wide enough that two species read as two facts. At two
                    // thirds of the type they ran together into one number
                    // with pictures in it.
                    columnGap: type.metadata * 0.9,
                    rowGap: type.metadata * 0.35,
                  }}
                >
                  {species.map((entry) => {
                    const Icon = SPECIES_ICONS[entry.species];
                    return (
                      <span
                        key={entry.species}
                        data-callout-species-entry={entry.species}
                        className="inline-flex shrink-0 items-center"
                        style={{ gap: type.metadata * 0.35 }}
                      >
                        <Icon size={type.metadata} aria-hidden />
                        {entry.count}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

// The mark's own geometry, in the map's user units. Named because the legend
// draws the same mark from the same numbers, so the ring on the country and
// the ring in the key cannot drift apart.
const ORIGIN_RING_RADIUS = 5;
const ORIGIN_RING_STROKE = 1;
const ORIGIN_RING_DASH = 2;
const ORIGIN_DOT_RADIUS = 1.75;
const ORIGIN_RING_CLASS = "fill-none stroke-foreground opacity-70";
const ORIGIN_DOT_CLASS = "fill-foreground";

/** The ring's outer edge, which is where anything drawn away from the origin
 *  has to start. Exported so the distance line leaves the mark alone rather
 *  than being drawn across it. */
export const ORIGIN_REACH = ORIGIN_RING_RADIUS + ORIGIN_RING_STROKE / 2;

/** The dashes the origin wears, for the one other line on the plate that is
 *  drawn from it. Shared so the two cannot drift into two dashed languages. */
export const ORIGIN_DASH = `${ORIGIN_RING_DASH} ${ORIGIN_RING_DASH}`;

// Dashed, so it reads as "you" rather than as one more shelter.
export function Origin({ at }: { at: LatLon }) {
  const { x, y } = project(at);
  return (
    <g aria-hidden className="pointer-events-none">
      <circle
        cx={x}
        cy={y}
        r={ORIGIN_RING_RADIUS}
        strokeWidth={ORIGIN_RING_STROKE}
        strokeDasharray={ORIGIN_DASH}
        className={ORIGIN_RING_CLASS}
      />
      <circle cx={x} cy={y} r={ORIGIN_DOT_RADIUS} className={ORIGIN_DOT_CLASS} />
    </g>
  );
}

// The legend's box, and how much larger the mark is drawn inside it than on
// the country. 1.2 is what fills a 16-unit box with the ring while leaving
// room for its own stroke, and it is applied to every radius alike, so the
// dashes, the ring and the dot keep exactly the proportions they have on the
// map.
const ORIGIN_GLYPH_BOX = 16;
const ORIGIN_GLYPH_SCALE = 1.2;

// The same mark at legend size, the way EmptyMarkerGlyph is the same hollow
// disc at legend size: the key repeats the component, not a lookalike drawn
// from hand-converted radii.
export function OriginGlyph({ className }: { className?: string }) {
  const centre = ORIGIN_GLYPH_BOX / 2;
  const dash = ORIGIN_RING_DASH * ORIGIN_GLYPH_SCALE;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ORIGIN_GLYPH_BOX} ${ORIGIN_GLYPH_BOX}`}
      className={className}
    >
      <circle
        cx={centre}
        cy={centre}
        r={ORIGIN_RING_RADIUS * ORIGIN_GLYPH_SCALE}
        strokeWidth={ORIGIN_RING_STROKE * ORIGIN_GLYPH_SCALE}
        strokeDasharray={`${dash} ${dash}`}
        className={ORIGIN_RING_CLASS}
      />
      <circle
        cx={centre}
        cy={centre}
        r={ORIGIN_DOT_RADIUS * ORIGIN_GLYPH_SCALE}
        className={ORIGIN_DOT_CLASS}
      />
    </svg>
  );
}
