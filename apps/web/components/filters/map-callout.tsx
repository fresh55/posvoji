"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
const TITLE_PX = 12;
const META_PX = 10.5;
// The paper showing through around the letters. A hairline and not a glow:
// this is a knockout, and a wide soft one is only a card by another name.
const HALO_PX = 1.7;
// The column the text wraps inside. The card was 108 units wide and the picker
// draws the plate near 2.2 pixels a unit, so this is that same column, held to
// the same rendered width whatever size the plate is drawn at.
const BLOCK_PX = 238;
// One line of title over one of metadata at 1.15 leading. Used until the real
// content is measured, and as the floor after.
const MIN_BLOCK_PX = 26;

// What one rendered pixel is worth in user units. Clamped at both ends,
// because past them the honest division stops being the right answer: below,
// the name comes out smaller than the town anchors it stands among; above, it
// grows large enough to cover the region it names.
const MIN_UNITS_PER_PX = 0.26;
const MAX_UNITS_PER_PX = 0.6;

// The size the title is never set under, in rendered pixels. The upper clamp
// above is written in user units, so on a small plate it did the one thing
// this file exists to prevent: a phone draws about 1.12 pixels to the unit,
// where 0.6 units per pixel put the name out at eight pixels. The clamp is
// still the right shape, it just cannot be the last word, so the rendered size
// is checked in the units it is read in and the clamp gives way to it.
const MIN_TITLE_PX = 11;

// How much of the country's width one block of type may take, whatever the
// clamp above did to the unit. On a phone plate the honest column comes out
// near two thirds of the map, which is a label that has stopped naming a place
// and started covering one.
const MAX_BLOCK_SHARE = 0.55;

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
  const px = scale > 0 ? scale : DEFAULT_PLATE_SCALE;
  const clamped = Math.min(
    Math.max(1 / px, MIN_UNITS_PER_PX),
    MAX_UNITS_PER_PX,
  );
  // The upper clamp cuts the unit down, and cutting the unit down is cutting
  // the rendered type down with it. Whatever it just did, the title comes back
  // up to a size that can be read.
  const unit = Math.max(clamped, MIN_TITLE_PX / (TITLE_PX * px));
  return {
    unit,
    title: TITLE_PX * unit,
    metadata: META_PX * unit,
    halo: HALO_PX * unit,
    width: Math.min(BLOCK_PX * unit, MAP_WIDTH * MAX_BLOCK_SHARE),
    floor: MIN_BLOCK_PX * unit,
  };
}

// Four passes of the same small blur: three build a core the ground cannot
// come through, and one carried twice as far softens the edge. A single pass
// reads as a drop shadow, which is a card's language and not a plate's.
//
// --background and never a literal. It is the dialog's own paper, so on dark
// the halo is nearly black, which is exactly what a dark plate needs.
function haloShadow(r: number): string {
  return [r, r, r, r * 2]
    .map((blur) => `0 0 ${blur.toFixed(3)}px var(--background)`)
    .join(", ");
}

// An icon has no text for a shadow to follow, so the same halo arrives as a
// filter. Three passes and not four: drop-shadow spreads from the whole glyph
// silhouette rather than from the letterform edges text-shadow follows, so it
// reaches further for the same radius.
function haloFilter(r: number): string {
  return [r, r, r]
    .map((blur) => `drop-shadow(0 0 ${blur.toFixed(3)}px var(--background))`)
    .join(" ");
}

// How far off the marker's edge a label sits when nothing displaces it, and
// how far short of the label the leader stops. Both in user units, like the
// connector's own gaps: this is plate geometry and does not move with the type.
const LABEL_GAP = 4;
const LEADER_GAP = 1.2;
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

  // Which side of the marker the name belongs on, and where it would sit if
  // nothing were in the way.
  const onRight =
    x + reach + LABEL_GAP + type.width <= MAP_WIDTH - FRAME_MARGIN;
  const naturalX = onRight
    ? x + reach + LABEL_GAP
    : x - reach - LABEL_GAP - type.width;
  const naturalY = y - height / 2;
  const blockX = Math.min(
    Math.max(naturalX, FRAME_MARGIN),
    MAP_WIDTH - type.width - FRAME_MARGIN,
  );
  const blockY = Math.min(
    Math.max(naturalY, FRAME_MARGIN),
    MAP_HEIGHT - height - FRAME_MARGIN,
  );

  // The halo blurs outward from the letters and a foreignObject clips at its
  // own box, so the box carries a margin of exactly the halo's reach and the
  // text is inset back into place. Without it the knockout is sheared off flat
  // along the left edge of every label.
  const pad = type.halo * 2;

  // A leader is drawn for a displaced label and for no other. The measure is
  // how far the frame pushed the block off the position it asked for, which is
  // the only thing that can move it: everything else about the placement is
  // decided above.
  const displaced =
    Math.hypot(blockX - naturalX, blockY - naturalY) > LEADER_SLACK;
  // The label's own end of the line: the edge that faces the marker, a hair
  // short of the type, level with the middle of the block.
  const leaderX = onRight
    ? blockX - LEADER_GAP
    : blockX + type.width + LEADER_GAP;
  const leaderY = blockY + height / 2;
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
    onRect(rectKey, { x: blockX, y: blockY, width: type.width, height });
    return () => onRect(rectKey, null);
  }, [onRect, rectKey, blockX, blockY, type.width, height]);

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
        width={type.width + pad * 2}
        height={height + pad * 2}
      >
        <div
          className={cn(
            "flex h-full flex-col justify-center text-foreground",
            // A label to the left of its marker sets ragged-left, so the type
            // ends where the leader starts instead of trailing off away from
            // the thing it names.
            !onRight && "text-right",
          )}
          style={{ padding: pad }}
        >
          {/* Measured, not the padded block above: see the effect's own
              comment for why the ref has to sit here. */}
          <div ref={contentRef} className="w-full">
            <span
              data-callout-title
              className="block w-full break-words font-medium"
              style={{
                fontSize: type.title,
                lineHeight: 1.15,
                textShadow: haloShadow(type.halo),
              }}
            >
              {title}
            </span>
            {metadata && (
              <span
                data-callout-metadata
                className="block w-full break-words text-muted-foreground"
                style={{
                  fontSize: type.metadata,
                  lineHeight: 1.15,
                  marginTop: type.metadata * 0.3,
                  textShadow: haloShadow(type.halo),
                }}
              >
                {metadata}
              </span>
            )}
            {/* Same size and same halo as the line above it: this is the other
                half of one answer, not a footnote to it. */}
            {note && (
              <span
                data-callout-note
                className="block w-full break-words text-muted-foreground"
                style={{
                  fontSize: type.metadata,
                  lineHeight: 1.15,
                  marginTop: type.metadata * 0.3,
                  textShadow: haloShadow(type.halo),
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
                  lineHeight: 1.15,
                  marginTop: type.metadata * 0.3,
                  columnGap: type.metadata * 0.65,
                  rowGap: type.metadata * 0.2,
                  // One halo for the whole row, glyphs and digits together:
                  // text-shadow would leave the icons bare.
                  filter: haloFilter(type.halo),
                }}
              >
                {species.map((entry) => {
                  const Icon = SPECIES_ICONS[entry.species];
                  return (
                    <span
                      key={entry.species}
                      data-callout-species-entry={entry.species}
                      className="inline-flex shrink-0 items-center"
                      style={{ gap: type.metadata * 0.22 }}
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
