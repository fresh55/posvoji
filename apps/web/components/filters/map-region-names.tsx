import { useMemo } from "react";
import { REGION_SHAPES } from "@/lib/map-regions";
import { intersectionArea, type CalloutRect } from "./map-callout-layout";
import { PLATE_MIN_SCALE } from "./map-marker";
import { circleHitsBox, LEADING, outsideFrame } from "./map-names";

// Major regions orient the small country without labelling every narrow shape.
// The others are named on touch/focus by the map's full callout.
const ORIENTATION_REGIONS = new Set([1, 2, 4, 7, 8, 9, 11, 12]);

/** The narrowest country these names can orient, in drawn pixels.
 *
 *  Under it the whole of Slovenia is about as wide as one of these labels is
 *  long: on a landscape phone the plate draws a 268px country, and Obalno-
 *  kraška printed over Jugovzhodna Slovenija while Osrednjeslovenska ran into
 *  Savinjska. The collision test below is measured off an estimate of the type
 *  and cannot be trusted that far down, and dropping the labels it does catch
 *  would leave two or three names on a map of twelve shapes, which orients
 *  nobody. A plate this small has the callout instead: every region names
 *  itself on a tap, and the footer's instruction line says so.
 *
 *  In rendered pixels and not in plate scale, because what the names need is
 *  room for the words, and that is the country's drawn width. */
export const NAMES_MIN_PLATE_WIDTH = 300;

// What one character of these names is worth in width, as a share of the
// size, and a line of them is the plate's own LEADING. Both are estimates:
// nothing here measures the DOM, so the same plate lays its names out the same
// way on every machine.
const ADVANCE = 0.57;

// The air a moved name keeps from the dot it moved for, in rendered pixels.
const DOT_CLEARANCE_PX = 2;

// How far a name may travel off its own point, in its own lines. Two lines
// still reads as the name of the shape it stands in; further than that and it
// starts to name the neighbour, which is worse than no name.
const MAX_SHIFT_LINES = 2;

/** A round mark on the plate a region name is not set across: a picked town's
 *  dot, or the origin. In user units, with r reaching everything the mark
 *  paints, its ring included. */
export type PlateDot = { x: number; y: number; r: number };

/** Where one region's name stands: x is the middle of every line and y the
 *  baseline of the first. */
export type RegionNameSpot = {
  id: number;
  name: string;
  lines: string[];
  x: number;
  y: number;
};

// Every orientation name on its own point, in region order. The same on
// every plate, so worked out once.
const ORIENTATION_NAMES: readonly RegionNameSpot[] = REGION_SHAPES.filter(
  (region) => ORIENTATION_REGIONS.has(region.id),
).map((region) => ({
  id: region.id,
  name: region.name,
  lines: region.name.split(/(?<=-)| /),
  x: region.label[0],
  y: region.label[1],
}));

/** The size the names are set at on a plate drawn at `scale`, in user units.
 *
 *  Rendered pixels, divided back out of the plate's scale so the names are
 *  set at the same size whatever the plate measures.
 *
 *  11.5 on a plate under the threshold everything else here measures itself
 *  against. 10.5 is the size the desktop plate was tuned at; on the phone
 *  picker, a 341 x 224 plate, the same names came out the smallest type on
 *  the site, under the 11px floor its other small print keeps, and by then
 *  they are the only thing left on the plate: the paws and the furniture have
 *  already gone at this scale. The collision test below drops whatever the
 *  larger type no longer has room for. */
export function regionNameSize(scale: number): number {
  return (scale < PLATE_MIN_SCALE ? 11.5 : 10.5) / scale;
}

/** The box a name standing at `spot` is estimated to take when set at `size`,
 *  from its longest line and its line count. */
export function regionNameBox(
  { lines, x, y }: RegionNameSpot,
  size: number,
): CalloutRect {
  const width = Math.max(...lines.map((line) => line.length)) * size * ADVANCE;
  return {
    x: x - width / 2,
    y: y - size,
    width,
    height: size * lines.length * LEADING,
  };
}

/** Where each orientation name goes on a plate drawn at `scale`, keeping off
 *  the annotations and the origin's name in `avoid`, off each other, and off
 *  every dot in `dots`.
 *
 *  A name that shares any area with an annotation or with a name already
 *  placed is dropped, as it always was: two of these read through each other
 *  long before one covers the other, and an annotation over a region's name
 *  is usually that region's own, which already says it.
 *
 *  A dot is different. It is a few pixels across and it lands wherever a
 *  shelter is, which is often on the one point a region's name is set at:
 *  Maribor picked put its dot between the "Po" and the "dravska". Dropping
 *  the name the way an annotation drops it would take the orientation away
 *  for as long as the pick stood, so the name moves up or down instead, by
 *  the smallest step that clears every dot and keeps off every other name
 *  and annotation, and is dropped only when nothing within MAX_SHIFT_LINES
 *  does.
 *
 *  In two passes, so a name standing clear at its own point never gives that
 *  point up to one that had to move: every name that fits at home is placed
 *  first, and the displaced ones look for room among them after. Region order
 *  in both, so the answer is the same on every render. */
export function placeRegionNames(
  scale: number,
  avoid: readonly CalloutRect[],
  dots: readonly PlateDot[],
): RegionNameSpot[] {
  const size = regionNameSize(scale);
  const names = ORIENTATION_NAMES.map((home) => ({
    home,
    box: regionNameBox(home, size),
  }));

  const taken: CalloutRect[] = [...avoid];
  const shifts = new Map<number, number>();
  const displaced: typeof names = [];
  for (const name of names) {
    // Any shared area at all drops the name. The arithmetic is the
    // annotation's own, and these rectangles are its own type.
    if (taken.some((other) => intersectionArea(name.box, other) > 0)) continue;
    if (dots.some((dot) => circleHitsBox(dot.x, dot.y, dot.r, name.box))) {
      displaced.push(name);
      continue;
    }
    taken.push(name.box);
    shifts.set(name.home.id, 0);
  }
  for (const name of displaced) {
    const dy = clearShift(
      name.box,
      dots,
      taken,
      DOT_CLEARANCE_PX / scale,
      MAX_SHIFT_LINES * size * LEADING,
    );
    if (dy === undefined) continue;
    taken.push({ ...name.box, y: name.box.y + dy });
    shifts.set(name.home.id, dy);
  }

  return names.flatMap(({ home }) => {
    const dy = shifts.get(home.id);
    return dy === undefined ? [] : [{ ...home, y: home.y + dy }];
  });
}

/** The smallest vertical move that takes `box` off every dot and every
 *  rectangle in `taken` and keeps it on the plate, or undefined when no move
 *  of at most `limit` does.
 *
 *  The candidates are the moves that set the box `gap` past one obstacle's
 *  near edge, above it or below it, and the nearest of them that clears
 *  every obstacle wins. A dot off to one side of the box needs less height
 *  to clear than one straight above it, so for that dot the move is measured
 *  to where its circle crosses the line of the box's nearer side, not to the
 *  circle's top or bottom. Ties go up, so two equal moves always settle the
 *  same way. */
function clearShift(
  box: CalloutRect,
  dots: readonly PlateDot[],
  taken: readonly CalloutRect[],
  gap: number,
  limit: number,
): number | undefined {
  const bottom = box.y + box.height;
  const moves: number[] = [];
  for (const dot of dots) {
    const reach = dot.r + gap;
    const dx = Math.max(box.x - dot.x, 0, dot.x - (box.x + box.width));
    if (dx >= reach) continue;
    const rise = Math.sqrt(reach * reach - dx * dx);
    moves.push(dot.y - rise - bottom, dot.y + rise - box.y);
  }
  for (const rect of taken) {
    if (rect.x >= box.x + box.width || rect.x + rect.width <= box.x) continue;
    moves.push(rect.y - gap - bottom, rect.y + rect.height + gap - box.y);
  }
  return moves
    .filter((dy) => Math.abs(dy) <= limit)
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
    .find((dy) => {
      const moved = { ...box, y: box.y + dy };
      return (
        outsideFrame(moved) === 0 &&
        !dots.some((dot) => circleHitsBox(dot.x, dot.y, dot.r, moved)) &&
        !taken.some((other) => intersectionArea(moved, other) > 0)
      );
    });
}

export function MapRegionNames({
  scale,
  calloutRects,
  dots,
}: {
  scale: number;
  calloutRects: CalloutRect[];
  /** The round marks drawn over the names: the picked towns' dots and the
   *  origin. See placeRegionNames for what a name does about one. */
  dots: readonly PlateDot[];
}) {
  const fontSize = regionNameSize(scale);
  // Laid out again only when the plate, its annotations or its dots move. The
  // map renders on every hover and every keystroke in the list beside it, and
  // none of those moves a name.
  const spots = useMemo(
    () => placeRegionNames(scale, calloutRects, dots),
    [scale, calloutRects, dots],
  );
  return (
    <g aria-hidden className="pointer-events-none" data-map-region-names>
      {spots.map((spot) => (
        <text key={spot.id} data-map-region-label={spot.name}
          x={spot.x} y={spot.y} textAnchor="middle"
          fontSize={fontSize} fontWeight={500} strokeWidth={2.5 / scale}
          paintOrder="stroke" strokeLinejoin="round"
          className="fill-foreground/80 stroke-background">
          {spot.lines.map((line, index) => <tspan key={line} x={spot.x}
            dy={index === 0 ? 0 : fontSize * LEADING}>{line}</tspan>)}
        </text>
      ))}
    </g>
  );
}
