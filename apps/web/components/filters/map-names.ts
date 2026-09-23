import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/geo";
import type { Town } from "@/lib/map-layout";
import { coveredArea, type CalloutRect } from "./map-callout-layout";

/** The size a picked town's name is set at, in user units. */
export const PICKED_NAME_SIZE = 3.9;
const NAME_HEIGHT = PICKED_NAME_SIZE * 1.2;
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

/** The box a placed name is estimated to take, in user units. */
export function namePlacementBox({ text, x, y, anchor }: NamePlacement): CalloutRect {
  const width = text.length * PICKED_NAME_SIZE * NAME_ADVANCE;
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { x: left, y: y - NAME_HEIGHT / 2, width, height: NAME_HEIGHT };
}

export function circleHitsBox(x: number, y: number, r: number, box: CalloutRect): boolean {
  const dx = x - Math.min(Math.max(x, box.x), box.x + box.width);
  const dy = y - Math.min(Math.max(y, box.y), box.y + box.height);
  return dx * dx + dy * dy < r * r;
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
    const reach = town.reach + NAME_GAP;
    const candidates: NamePlacement[] = [
      { text, x: town.x, y: town.y + reach + NAME_HEIGHT / 2, anchor: "middle" },
      { text, x: town.x, y: town.y - reach - NAME_HEIGHT / 2, anchor: "middle" },
      { text, x: town.x + reach, y: town.y, anchor: "start" },
      { text, x: town.x - reach, y: town.y, anchor: "end" },
    ];
    const cost = (candidate: NamePlacement): number => {
      const box = namePlacementBox(candidate);
      const markers = towns.filter(
        (other) => other !== town && circleHitsBox(other.x, other.y, other.reach, box),
      ).length;
      const outside =
        Math.max(0, -box.x) + Math.max(0, box.x + box.width - MAP_WIDTH) +
        Math.max(0, -box.y) + Math.max(0, box.y + box.height - MAP_HEIGHT);
      return markers * 100 + coveredArea(box, taken) * 10 + outside;
    };
    const costs = candidates.map(cost);
    const best = candidates[costs.indexOf(Math.min(...costs))];
    placed.set(town.key, best);
    taken.push(namePlacementBox(best));
  }
  return placed;
}
