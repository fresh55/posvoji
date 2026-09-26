"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Species } from "@posvoji/schema";

import { SpeciesGlyphIcon } from "@/components/filters/species-glyph";
import { KM_PER_MAP_UNIT, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "@/lib/geo";
import { SPECIES_ORDER, TAB_OF_SPECIES, type SpeciesTab } from "@/lib/species";
import { cn } from "@/lib/utils";
import {
  avoidCalloutOverlap,
  placeCallout,
  type CalloutRect,
  type CalloutSide,
} from "./map-callout-layout";
import {
  labelBox,
  outsideFrame,
  placeOriginName,
  type NamePlacement,
} from "./map-names";

// The type the plate sets straight on the map (the origin's name, the ring's
// distance, the distance on a line), in screen pixels. calloutType converts
// it to user units.
const PLATE_TEXT_PX = 11;
// Text halo for the labels drawn directly over the map.
const HALO_PX = 1.7;

// The card's own sizes, in the pixels it is read at. The card is laid out in
// them and set on the plate by one SVG transform, so every length inside it, a
// class's included, is a pixel on screen. Laid out in user units, as it was,
// Chrome snapped each icon's box to a whole unit, about three pixels on a
// desktop plate: the species glyphs sat off their numbers with their chins cut,
// and the touch button's mt-2 came out at 29 pixels.
//
// An SVG transform on the object's parent and not a CSS transform inside it:
// WebKit paints nothing at all for a transformed box inside a foreignObject.
const CARD_WIDTH_PX = 224;
// What shadow-md reaches past the chip, which the object has to hold or clip.
const CARD_BLEED_PX = 10;
// How far the shadow reaches under the chip, which the plate's own edge clips
// like any other: the card keeps at least this far in from it. Nine is the
// reach itself, and the plate's column can run a fraction of a pixel short of
// the drawing, so a pixel is kept over.
const SHADOW_REACH_PX = 10;
// The further gaps a card may stand off its mark at when every spot at the
// ordinary one would rest on a neighbour.
const FARTHER_PX = [8, 16] as const;
// The chip's height before it has been measured: a title and one line of
// facts, with the card's padding.
const CARD_FLOOR_PX = 60;
// The smallest line on the card, and the least it may be drawn at.
const CARD_META_PX = 12;
const MIN_TEXT_PX = 11;
// The touch button's height on screen, whatever the plate is drawn at.
const TARGET_PX = 44;

const LABEL_GAP_PX = 12;
const LEADER_GAP_PX = 3;
// How close to the card's top or bottom end the mark may stand once the card
// slides along a side to clear a neighbour: past the corner's curve, so the
// mark is still beside the card's body.
const SLIDE_INSET_PX = 16;

// The least the plate's own labels keep in from its edge, in user units.
const FRAME_MARGIN = 2;

// Limit scaling so labels stay legible without covering the map.
const MIN_UNITS_PER_PX = 0.26;
const MAX_UNITS_PER_PX = 0.6;

const MAX_BLOCK_SHARE = 0.55;

/** Initial pixels per SVG unit, used until ShelterMap measures the map. */
export const DEFAULT_PLATE_SCALE = 2.2;

/** The plate's type and the card's box, for a map rendered at `scale` pixels
 *  per user unit. `unit` is user units per card pixel: what the card is
 *  scaled onto the plate by, and what the plate's own type is multiplied by. */
export function calloutType(scale: number) {
  const px = scale > 0 ? scale : DEFAULT_PLATE_SCALE;
  const clamped = Math.min(
    Math.max(1 / px, MIN_UNITS_PER_PX),
    MAX_UNITS_PER_PX,
  );
  // The smallest line's rendered size takes precedence over the clamp on
  // small maps.
  const unit = Math.max(clamped, MIN_TEXT_PX / (CARD_META_PX * px));
  // The widest the card may be, in its own pixels: its cap, or the share of
  // the country it may cover, whichever is less.
  const columnPx = Math.min(CARD_WIDTH_PX, (MAP_WIDTH * MAX_BLOCK_SHARE) / unit);
  return {
    unit,
    plateText: PLATE_TEXT_PX * unit,
    halo: HALO_PX * unit,
    columnPx,
    /** The column in user units. A card can render narrower. */
    width: columnPx * unit,
    /** The chip's height in user units until it has been measured. */
    floor: CARD_FLOOR_PX * unit,
    bleed: CARD_BLEED_PX * unit,
    /** How far in from the plate's edge the chip keeps, so its shadow is
     *  not cut off there. */
    margin: Math.max(FRAME_MARGIN, SHADOW_REACH_PX * unit),
    labelGap: LABEL_GAP_PX * unit,
    leaderGap: LEADER_GAP_PX * unit,
    slideInset: SLIDE_INSET_PX * unit,
  };
}

// Do not draw a leader for minor adjustments at the map edge.
const LEADER_SLACK = 3;
const LEADER_WIDTH = 0.5;

// The card arrives from its mark's side, whichever side that is.
const SLIDE_FROM: Record<CalloutSide, string> = {
  right: "slide-in-from-left-0.5",
  left: "slide-in-from-right-0.5",
  above: "slide-in-from-bottom-0.5",
  below: "slide-in-from-top-0.5",
};

const TAB_ORDER: readonly SpeciesTab[] = ["dog", "cat", "other"];

const NO_RECTS: readonly CalloutRect[] = [];

/** The boxes of whatever the page marks data-map-overlay and draws over
 *  `plate`, in the plate's user units, read off its screen transform. */
function overlaysOver(plate: SVGSVGElement | null): readonly CalloutRect[] {
  const ctm = plate?.getScreenCTM?.();
  if (!plate || !ctm || !ctm.a || !ctm.d) return NO_RECTS;
  const found: CalloutRect[] = [];
  for (const node of document.querySelectorAll("[data-map-overlay]")) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    found.push({
      x: (box.left - ctm.e) / ctm.a,
      y: (box.top - ctm.f) / ctm.d,
      width: box.width / ctm.a,
      height: box.height / ctm.d,
    });
  }
  return found.length ? found : NO_RECTS;
}

function sameRects(a: readonly CalloutRect[], b: readonly CalloutRect[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (rect, index) =>
        Math.abs(rect.x - b[index].x) < 0.01 &&
        Math.abs(rect.y - b[index].y) < 0.01 &&
        Math.abs(rect.width - b[index].width) < 0.01 &&
        Math.abs(rect.height - b[index].height) < 0.01,
    )
  );
}

/** A shelter's species counted by the tabs the site filters by, in the tabs'
 *  order: a rabbit counts under "other", which wears the rabbit. The card
 *  drew a glyph per species once, and a rabbit beside a paw print at twelve
 *  pixels read as two marks nobody could tell apart, for a split the tabs
 *  above the grid do not make. */
export function speciesByTab(
  species: readonly { species: Species; count: number }[],
): { tab: SpeciesTab; count: number }[] {
  const counts = new Map<SpeciesTab, number>();
  for (const kind of SPECIES_ORDER) {
    const count = species.find((entry) => entry.species === kind)?.count ?? 0;
    if (count > 0) {
      const tab = TAB_OF_SPECIES[kind];
      counts.set(tab, (counts.get(tab) ?? 0) + count);
    }
  }
  return TAB_ORDER.flatMap((tab) => {
    const count = counts.get(tab);
    return count ? [{ tab, count }] : [];
  });
}

/** A card naming a marker or a region, standing beside it, with a leader
 *  when it had to stand away from it. */
export function MapCallout({
  x,
  y,
  reach,
  title,
  place,
  metadata,
  note,
  species,
  action,
  scale = DEFAULT_PLATE_SCALE,
  avoid,
  rectKey = "",
  onRect,
  earlierCallouts,
}: {
  x: number;
  y: number;
  reach: number;
  title: string;
  /** Where it is, under the name: its town, the distance, or both. */
  place?: string;
  /** Omit place, metadata, note, species and action for a compact
   *  title-only label. */
  metadata?: string;
  /** Optional second metadata line, such as the shelters covering an empty region. */
  note?: string;
  /** Species counts for an individual shelter, drawn by species tab. */
  species?: readonly { species: Species; count: number }[];
  /** An explicit touch choice; passive hover annotations omit it. */
  action?: {
    label: string;
    onClick: () => void;
    onFocusChange?: (focused: boolean) => void;
  };
  /** Pixels per SVG unit, measured by ShelterMap. */
  scale?: number;
  /** Marks to keep off. The card takes the spot beside its own mark that
   *  covers the least of them; staying inside the map takes priority. */
  avoid?: readonly CalloutRect[];
  /** Stable identifier for the map to track simultaneous callouts. */
  rectKey?: string;
  /** Reports bounds before paint, or null on removal. Keep the callback identity stable. */
  onRect?: (key: string, rect: CalloutRect | null) => void;
  /** Earlier persistent spotlight labels. The one-way ordering keeps layout
   * stable while each label measures and reports its actual height. */
  earlierCallouts?: readonly CalloutRect[];
}) {
  const chipRef = useRef<HTMLDivElement>(null);
  const type = calloutType(scale);
  const { unit, columnPx } = type;
  // The chip's drawn size in its own pixels, once it has been laid out. Until
  // then, and where nothing is laid out at all (tests), the column's width and
  // the floor stand in for it.
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  // What the page paints over the plate, in user units: the map credit in
  // the plate's corner, whose links would otherwise be drawn across the
  // card's last lines. Marked data-map-overlay where they are drawn.
  const [overlays, setOverlays] = useState<readonly CalloutRect[]>(NO_RECTS);

  const tabs = species ? speciesByTab(species) : [];
  // A content key, because callers may recreate the array.
  const speciesKey = tabs.map((entry) => `${entry.tab}:${entry.count}`).join(",");

  // Read the chip before paint whenever what it says or how wide it may be
  // changes, so it is placed by the size it is drawn at. The chip is w-fit in
  // a column that is always columnPx wide, so its size depends on its words
  // and never on where it stands: placing it cannot feed back into measuring
  // it. The observer catches what changes the words' size behind React's
  // back, such as a web font arriving after the card.
  useLayoutEffect(() => {
    const chip = chipRef.current;
    if (!chip) return;
    const read = () => {
      const width = chip.offsetWidth;
      const height = chip.offsetHeight;
      setSize((current) =>
        !width || !height
          ? null
          : current?.width === width && current.height === height
            ? current
            : { width, height },
      );
    };
    read();
    const found = overlaysOver(chip.closest("svg"));
    setOverlays((current) => (sameRects(current, found) ? current : found));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(chip);
    return () => observer.disconnect();
  }, [title, place, metadata, note, speciesKey, action?.label, columnPx]);

  const dense = !place && !metadata && !note && tabs.length === 0 && !action;
  const heightPx = size?.height ?? CARD_FLOOR_PX;

  // One box, in user units, for placement, the leader and the report.
  const boxWidth = (size?.width ?? columnPx) * unit;
  const boxHeight = heightPx * unit;
  const { labelGap, leaderGap, bleed } = type;

  // Beside the mark where that is clear, else slid along a side, over it or
  // under it: whichever spot keeps off the other marks and stays in the
  // frame. See placeCallout for the order.
  const placement = placeCallout(
    { x, y, reach },
    { width: boxWidth, height: boxHeight },
    {
      gap: labelGap,
      inset: type.slideInset,
      frame: { width: MAP_WIDTH, height: MAP_HEIGHT, margin: type.margin },
      avoid: overlays.length ? [...(avoid ?? []), ...overlays] : avoid ?? NO_RECTS,
      farther: FARTHER_PX.map((px) => px * unit),
    },
  );
  const blockX = placement.x;
  // Separate persistent labels vertically. Only earlier labels reserve space,
  // so reports cannot move one another back and forth as their rendered
  // heights settle.
  const blockY = earlierCallouts?.length
    ? avoidCalloutOverlap(placement, earlierCallouts, {
        height: MAP_HEIGHT,
        margin: type.margin,
        gap: unit * 8,
      }).y
    : placement.y;

  // The point of the chip nearest the mark. A leader is drawn only when that
  // point is further off the mark than the gap a card beside it keeps: a card
  // the frame or an earlier card has pushed away from the thing it names.
  const nearX = Math.min(Math.max(x, blockX), blockX + boxWidth);
  const nearY = Math.min(Math.max(y, blockY), blockY + boxHeight);
  const dx = nearX - x;
  const dy = nearY - y;
  const span = Math.hypot(dx, dy) || 1;
  const displaced = span - reach > labelGap + LEADER_SLACK;

  // Report position separately from content measurement: a label can move
  // without changing its text. Layout effects update the reserved area before paint.
  useLayoutEffect(() => {
    if (!onRect) return;
    onRect(rectKey, { x: blockX, y: blockY, width: boxWidth, height: boxHeight });
    return () => onRect(rectKey, null);
  }, [onRect, rectKey, blockX, blockY, boxWidth, boxHeight]);

  return (
    // Only callouts with an action contain a focusable control.
    <g
      aria-hidden={action ? undefined : true}
      data-map-callout
      data-callout-side={placement.side}
      className={cn(
        // Use duration-0 for reduced motion; see ui/dialog.tsx for the animation override.
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:duration-0",
        SLIDE_FROM[placement.side],
      )}
    >
      {displaced && (
        <line
          data-map-leader
          // From the marker's own edge, so the mark is never drawn through,
          // to just short of the chip's.
          x1={x + (dx / span) * reach}
          y1={y + (dy / span) * reach}
          x2={nearX - (dx / span) * leaderGap}
          y2={nearY - (dy / span) * leaderGap}
          strokeWidth={LEADER_WIDTH}
          strokeLinecap="round"
          className="stroke-foreground opacity-55"
        />
      )}
      {/* The card in its own pixels. The object is the whole column wide
          wherever the chip stands, so the chip is laid out at one width and
          measured at it; what lies past the chip is empty. The margin all
          round holds the shadow. */}
      <g transform={`translate(${blockX - bleed} ${blockY - bleed}) scale(${unit})`}>
        <foreignObject
          width={columnPx + CARD_BLEED_PX * 2}
          height={heightPx + CARD_BLEED_PX * 2}
        >
          <div
            className="flex h-full w-full items-start"
            style={{ padding: CARD_BLEED_PX }}
          >
            <div
              ref={chipRef}
              data-callout-chip
              className={cn(
                "flex w-fit max-w-full flex-col px-3",
                // A name alone is a tooltip, and a card's air over one word
                // is a plaque.
                dense ? "py-1.5" : "py-2.5",
                // An opaque surface keeps contrast independent of the terrain
                // underneath. The site's popover, as Select and the menus draw
                // it: a ring for its edge in both themes, and a lift in light.
                "rounded-ui bg-popover text-popover-foreground",
                "shadow-md ring-1 ring-foreground/10 dark:shadow-none",
                // An armed card is the one thing the finger meant, so its body
                // takes a tap and does nothing with it. Passed through, a tap
                // on the card landed on whatever coin it covered and armed
                // that instead.
                action && "pointer-events-auto",
              )}
            >
              <span
                data-callout-title
                className="block text-sm leading-snug font-semibold break-words text-balance"
              >
                {title}
              </span>
              {place && (
                <span
                  data-callout-place
                  className="mt-0.5 block text-xs leading-4 break-words text-muted-foreground"
                >
                  {place}
                </span>
              )}
              {metadata && (
                <span
                  data-callout-metadata
                  className="mt-1.5 block text-xs leading-4 break-words text-muted-foreground"
                >
                  {metadata}
                </span>
              )}
              {note && (
                <span
                  data-callout-note
                  className="mt-0.5 block text-xs leading-4 break-words text-muted-foreground"
                >
                  {note}
                </span>
              )}
              {/* Who lives there, which adds up to the number on the coin, so
                  it is the count and no line of words says it again. The
                  glyphs are the species tabs' own. */}
              {tabs.length > 0 && (
                <span
                  data-callout-species
                  className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 tabular-nums"
                >
                  {tabs.map(({ tab, count }) => (
                    <span
                      key={tab}
                      data-callout-species-entry={tab}
                      className="inline-flex shrink-0 items-center gap-1"
                    >
                      <SpeciesGlyphIcon
                        tab={tab}
                        className="size-3.5 text-muted-foreground"
                      />
                      <span className="font-medium text-foreground">{count}</span>
                    </span>
                  ))}
                </span>
              )}
              {/* Last, under every fact the card carries. It stood between the
                  count and the species line once, which split one shelter's
                  facts in two around a control. The facts are what the press
                  is decided on, so they are read first and the press comes
                  after them. */}
              {action && (
                <button
                  type="button"
                  data-map-action
                  aria-label={`${action.label}: ${title}`}
                  onClick={action.onClick}
                  onFocus={() => action.onFocusChange?.(true)}
                  onBlur={() => action.onFocusChange?.(false)}
                  className="pointer-events-auto mt-2.5 flex w-full items-center justify-center rounded-ui bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                  // 44 pixels on screen, which is 44 of the card's own
                  // wherever the plate lets the card be drawn at its size.
                  style={{ minHeight: Math.max(TARGET_PX, TARGET_PX / (unit * scale)) }}
                >
                  {action.label}
                </button>
              )}
            </div>
          </div>
        </foreignObject>
      </g>
    </g>
  );
}

const ORIGIN_RING_RADIUS = 5;
const ORIGIN_RING_STROKE = 1;
const ORIGIN_RING_DASH = 2;
const ORIGIN_DOT_RADIUS = 1.75;

/** Outer edge of the origin ring, where the distance line starts. */
export const ORIGIN_REACH = ORIGIN_RING_RADIUS + ORIGIN_RING_STROKE / 2;

/** Shared dash pattern for the origin ring and distance line. */
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
        className="fill-none stroke-foreground opacity-70"
      />
      <circle cx={x} cy={y} r={ORIGIN_DOT_RADIUS} className="fill-foreground" />
    </g>
  );
}

// Clear space between the origin ring and its name, in screen pixels.
const ORIGIN_NAME_GAP_PX = 3;

/** Text set straight on the plate with the page drawn under the letters, so
 *  it reads over a region fill, a border or the relief alike: the origin's
 *  name, the ring's distance and the distance on the dashed line to a town
 *  (shelter-map-links.tsx). A stroke under the fill, not the blurred halo the
 *  annotation carries: a line runs straight through the last of those, and a
 *  stroke knocks the dashes out from behind the letterforms where a shadow
 *  would only veil them. */
export function PlateLabel({
  x,
  y,
  anchor,
  size,
  halo,
  className,
  children,
  ...data
}: {
  x: number;
  y: number;
  anchor: NamePlacement["anchor"];
  size: number;
  halo: number;
  className?: string;
  children: string;
} & { [key: `data-${string}`]: string | number }) {
  return (
    <text
      {...data}
      aria-hidden
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="central"
      fontSize={size}
      stroke="var(--background)"
      strokeWidth={halo * 2}
      strokeLinejoin="round"
      className={cn("pointer-events-none [paint-order:stroke]", className)}
    >
      {children}
    </text>
  );
}

/** Where the origin's name stands on a plate drawn at `scale`, and the box it
 *  takes (placeOriginName in map-names.ts). A pure answer, so the map can
 *  memoize it and hand the box to the plate's own type without a render to
 *  report it in. */
export function originNameAt(
  at: LatLon,
  text: string,
  scale: number,
  avoid: readonly CalloutRect[],
) {
  const { x, y } = project(at);
  const type = calloutType(scale);
  return placeOriginName(
    text,
    x,
    y,
    ORIGIN_REACH + ORIGIN_NAME_GAP_PX * type.unit,
    type.plateText,
    avoid,
    FRAME_MARGIN,
  );
}

/** The origin's name beside its ring: the town the visitor typed, or their
 *  own location. The plate carries no key, so the mark says what it is where
 *  it stands. */
export function OriginName({
  spot: { text, x, y, anchor },
  scale,
}: {
  spot: NamePlacement;
  scale: number;
}) {
  const type = calloutType(scale);
  return (
    <PlateLabel
      data-map-origin-name=""
      x={x}
      y={y}
      anchor={anchor}
      size={type.plateText}
      halo={type.halo}
      className="fill-foreground font-semibold"
    >
      {text}
    </PlateLabel>
  );
}

// Where on the ring its distance is written: the top of the circle if that is
// on the plate, else the first of the other compass points that is.
const RING_LABEL_ANGLES = [-90, 90, 0, 180, -45, -135, 45, 135];

/** How far "do N km" reaches from the origin, drawn under the markers while a
 *  distance pick is asked about or standing. The same straight-line distance
 *  the list sorts by, so a shelter inside the ring is one the pick takes. The
 *  plate's x axis is squeezed to match its y (lib/geo.ts), so a distance is a
 *  circle on it.
 *
 *  The ring writes its own distance on its line, in its own green, so a
 *  dashed circle on the map says what it is without a key under the plate.
 *  A ring wider than the whole plate has no point on the plate to write it
 *  on, and then the pressed chip beside the search field is what says it. */
export function DistanceRing({
  at,
  km,
  scale,
}: {
  at: LatLon;
  km: number;
  scale: number;
}) {
  const { x, y } = project(at);
  const r = km / KM_PER_MAP_UNIT;
  const type = calloutType(scale);
  const text = `${km} km`;
  const spot = RING_LABEL_ANGLES.map((degrees): NamePlacement => {
    const radians = (degrees * Math.PI) / 180;
    return {
      text,
      x: x + r * Math.cos(radians),
      y: y + r * Math.sin(radians),
      anchor: "middle",
    };
  }).find((candidate) => outsideFrame(labelBox(candidate, type.plateText), FRAME_MARGIN) === 0);
  return (
    <>
      <circle
        data-distance-ring={km}
        aria-hidden
        cx={x}
        cy={y}
        r={r}
        strokeWidth={0.9}
        strokeDasharray={ORIGIN_DASH}
        className="pointer-events-none fill-brand-strong/6 stroke-brand-strong"
      />
      {spot && (
        <PlateLabel
          data-distance-ring-label={km}
          x={spot.x}
          y={spot.y}
          anchor="middle"
          size={type.plateText}
          halo={type.halo}
          className="fill-brand-strong font-semibold"
        >
          {text}
        </PlateLabel>
      )}
    </>
  );
}
