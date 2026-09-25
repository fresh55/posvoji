import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import type { Town } from "@/lib/map-layout";
import { coveredArea, type CalloutRect } from "./map-callout-layout";

/** The size a picked town's name is set at, in user units. */
export const PICKED_NAME_SIZE = 3.9;
// A line of type, as a share of its size.
const LEADING = 1.2;
// Clear space between a marker's reach and its name.
const NAME_GAP = 0.8;
// An estimate of a semibold glyph's advance as a share of the size. Only used
// to keep names off each other and off markers, so a little over is the safe
// side: a name drawn narrower than its box leaves air, never an overlap.
const NAME_ADVANCE = 0.6;

export type NamePlacement = {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
};

/** The box a line of plate type set at `size` is estimated to take, in user
 *  units. Every label the plate places for itself is measured with this, so
 *  the ones that keep off each other agree on how big each of them is. */
export function labelBox(
  { text, x, y, anchor }: NamePlacement,
  size: number,
): CalloutRect {
  const width = text.length * size * NAME_ADVANCE;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { x: left, y: y - (size * LEADING) / 2, width, height: size * LEADING };
}

/** The box a placed picked name is estimated to take, in user units. */
export function namePlacementBox(placement: NamePlacement): CalloutRect {
  return labelBox(placement, PICKED_NAME_SIZE);
}

/** How far a box runs past the plate's edge, inset by `margin`, summed over
 *  the four sides. Nought for a box wholly on the plate. */
export function outsideFrame(box: CalloutRect, margin = 0): number {
  return (
    Math.max(0, margin - box.x) +
    Math.max(0, box.x + box.width - (MAP_WIDTH - margin)) +
    Math.max(0, margin - box.y) +
    Math.max(0, box.y + box.height - (MAP_HEIGHT - margin))
  );
}

export function circleHitsBox(x: number, y: number, r: number, box: CalloutRect): boolean {
  const dx = x - Math.min(Math.max(x, box.x), box.x + box.width);
  const dy = y - Math.min(Math.max(y, box.y), box.y + box.height);
  return dx * dx + dy * dy < r * r;
}

/** The four places a label can stand beside a mark of the given reach: under
 *  it, over it, right of it, left of it, in the order they are tried. */
function sidesOf(
  text: string,
  x: number,
  y: number,
  reach: number,
  size: number,
): NamePlacement[] {
  const half = (size * LEADING) / 2;
  return [
    { text, x, y: y + reach + half, anchor: "middle" },
    { text, x, y: y - reach - half, anchor: "middle" },
    { text, x: x + reach, y, anchor: "start" },
    { text, x: x - reach, y, anchor: "end" },
  ];
}

function cheapest<T>(candidates: T[], cost: (candidate: T) => number): T {
  const costs = candidates.map(cost);
  return candidates[costs.indexOf(Math.min(...costs))];
}

/** Where each picked town's name goes: under its marker if that is clear, else
 *  above, right or left, whichever first keeps off every other marker, every
 *  name already placed and the edge of the plate. A town with nowhere clear
 *  takes the side that costs least. West to east, so the answer is the same
 *  on every render. `label` shortens each shelter's name the way the caller
 *  wants it read; several picked shelters in one town share one line. */
export function placePickedNames(
  towns: Town[],
  selected: readonly string[],
  label: (name: string) => string,
): Map<string, NamePlacement> {
  const placed = new Map<string, NamePlacement>();
  const taken: CalloutRect[] = [];
  const named = towns
    .map((town) => ({
      town,
      text: town.shelters
        .filter((shelter) => selected.includes(shelter.value))
        .map((shelter) => label(shelter.label))
        .join(", "),
    }))
    .filter(({ text }) => text !== "")
    .sort((a, b) => a.town.x - b.town.x);

  for (const { town, text } of named) {
    const best = cheapest(
      sidesOf(text, town.x, town.y, town.reach + NAME_GAP, PICKED_NAME_SIZE),
      (candidate) => {
        const box = namePlacementBox(candidate);
        const markers = towns.filter(
          (other) => other !== town && circleHitsBox(other.x, other.y, other.reach, box),
        ).length;
        return markers * 100 + coveredArea(box, taken) * 10 + outsideFrame(box);
      },
    );
    placed.set(town.key, best);
    taken.push(namePlacementBox(best));
  }
  return placed;
}

/** Where the origin's name goes beside its ring, and the box it takes: right
 *  of the ring if that is clear, else left, below or above, whichever first
 *  keeps off `avoid` (the coins and the picked names) and stays on the plate,
 *  `margin` in from its edge. A typed town is usually a town with a shelter in
 *  it, so the first choice is often taken. */
export function placeOriginName(
  text: string,
  x: number,
  y: number,
  reach: number,
  size: number,
  avoid: readonly CalloutRect[],
  margin: number,
): NamePlacement & { box: CalloutRect } {
  const [below, above, right, left] = sidesOf(text, x, y, reach, size);
  const spot = cheapest([right, left, below, above], (candidate) => {
    const box = labelBox(candidate, size);
    return coveredArea(box, avoid) + outsideFrame(box, margin) * 100;
  });
  return { ...spot, box: labelBox(spot, size) };
}
