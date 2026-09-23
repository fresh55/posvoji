import { describe, expect, it } from "vitest";
import { cityAt } from "@/lib/geo";
import { shelterChipLabel } from "@/lib/labels";
import { layoutTowns, type ShelterPin } from "@/lib/map-layout";
import { intersectionArea } from "./map-callout-layout";
import { circleHitsBox, namePlacementBox, placePickedNames } from "./map-names";

// The eleven shelters listing animals today, under their real names and in
// their real towns, which is where the crowded middle of the country is.
const LIVE: [string, string, string, number][] = [
  ["macji-dol", "Mačji dol (Žverca)", "Škofja Loka", 15],
  ["meli", "Meli Center Repče", "Trebnje", 20],
  ["obalno", "Obalno zavetišče (Marjetica Koper)", "Koper", 37],
  ["horjul", "Zavetišče Horjul", "Horjul", 70],
  ["ljubljana", "Zavetišče Ljubljana", "Ljubljana", 49],
  ["macja-hisa", "Zavetišče Mačja hiša", "Celje", 178],
  ["mala-hisa", "Zavetišče Mala hiša", "Moravske Toplice", 12],
  ["maribor", "Zavetišče Maribor (Snaga)", "Maribor", 20],
  ["turk", "Zavetišče Turk", "Novo mesto", 18],
  ["zonzani", "Zavetišče Zonzani", "Dramlje", 23],
  ["muri", "Zavod Muri", "Vransko", 49],
];
const pins: ShelterPin[] = LIVE.map(([value, label, city, count]) => ({
  value,
  label,
  city,
  count,
  at: cityAt(city)!,
}));
const towns = layoutTowns(pins, { counted: true });

describe("placePickedNames", () => {
  it("keeps every name off every other marker and name, with every live shelter picked", () => {
    const placed = placePickedNames(towns, pins.map((pin) => pin.value), shelterChipLabel);
    const boxes = towns.map((town) => namePlacementBox(placed.get(town.key)!));
    towns.forEach((town, index) => {
      for (const other of towns) {
        if (other === town) continue;
        expect(circleHitsBox(other.x, other.y, other.reach, boxes[index])).toBe(false);
      }
      for (const box of boxes.slice(index + 1)) {
        expect(intersectionArea(boxes[index], box)).toBe(0);
      }
    });
  });

  it("names only picked towns, joining a town's picked shelters", () => {
    const [first] = towns;
    const placed = placePickedNames(towns, [first.shelters[0].value], (name) => name);
    expect([...placed.keys()]).toEqual([first.key]);
    expect(placed.get(first.key)!.text).toBe(first.shelters[0].label);
  });

  it("puts a name under its marker when nothing is in the way", () => {
    const [solo] = layoutTowns([pins[4]], { counted: true });
    const placement = placePickedNames([solo], ["ljubljana"], () => "Ljubljana").get(solo.key)!;
    expect(placement.anchor).toBe("middle");
    expect(placement.y).toBeGreaterThan(solo.y);
  });
});
