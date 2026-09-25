import { describe, expect, it } from "vitest";
import { cityAt } from "@/lib/geo";
import { shelterChipLabel } from "@/lib/labels";
import { layoutTowns, type ShelterPin } from "@/lib/map-layout";
import { intersectionArea } from "./map-callout-layout";
import {
  circleHitsBox,
  labelBox,
  namePlacementBox,
  outsideFrame,
  placeOriginName,
  placePickedNames,
} from "./map-names";

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

describe("the plate's own labels", () => {
  it("measures a picked name the way it measures any other label its size", () => {
    const name = { text: "Turk", x: 100, y: 50, anchor: "middle" as const };

    expect(namePlacementBox(name)).toEqual(labelBox(name, 3.9));
  });

  it("counts how far a box runs off the plate, inside a margin", () => {
    expect(outsideFrame({ x: 10, y: 10, width: 20, height: 5 })).toBe(0);
    expect(outsideFrame({ x: -3, y: 10, width: 20, height: 5 })).toBe(3);
    expect(outsideFrame({ x: 1, y: 10, width: 20, height: 5 }, 2)).toBe(1);
  });

  it("names the origin to the right of its ring when that side is clear", () => {
    const spot = placeOriginName("Celje", 100, 100, 6, 4, [], 2);

    expect(spot.anchor).toBe("start");
    expect(spot.x).toBe(106);
    expect(spot.box).toEqual(labelBox(spot, 4));
  });

  it("moves the origin's name off a mark standing to its right", () => {
    const mark = { x: 106, y: 96, width: 20, height: 8 };
    const spot = placeOriginName("Celje", 100, 100, 6, 4, [mark], 2);

    expect(spot.anchor).toBe("end");
    expect(intersectionArea(spot.box, mark)).toBe(0);
  });

  it("keeps the origin's name on the plate at its right edge", () => {
    const spot = placeOriginName("Moravske Toplice", 318, 100, 6, 4, [], 2);

    expect(outsideFrame(spot.box, 2)).toBe(0);
  });
});
