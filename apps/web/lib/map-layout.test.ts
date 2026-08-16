import { describe, expect, it } from "vitest";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, type LatLon } from "./geo";
import {
  layoutTowns,
  markerBoxes,
  placeLabels,
  wedgePath,
  type ShelterPin,
} from "./map-layout";

function pin(
  value: string,
  city: string,
  count: number,
  at: LatLon = cityAt(city)!,
): ShelterPin {
  return { value, label: value, city, at, count };
}

function gap(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
}

function everyPair<T>(items: T[], visit: (a: T, b: T) => void): void {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) visit(items[i], items[j]);
  }
}

// The real roster, which is what the layout has to survive.
const ROSTER: [string, string, number][] = [
  ["zonzani", "Dramlje", 40],
  ["obalno", "Koper", 60],
  ["ljubljana", "Ljubljana", 120],
  ["oskar", "Vitovlje", 35],
  ["horjul", "Horjul", 25],
  ["turk", "Novo mesto", 30],
  ["meli", "Trebnje", 20],
  ["mala-hisa", "Moravske Toplice", 15],
  ["maribor", "Maribor", 80],
  ["macji-dol", "Škofja Loka", 18],
  ["sevnica", "Sevnica", 12],
  ["brezice", "Brežice", 10],
  ["macja-hisa", "Celje", 22],
  ["johanca", "Tolmin", 8],
  ["muri", "Vransko", 14],
  ["potepuhi", "Podlog", 16],
  ["sia-in-lu", "Celje", 9],
];

const REAL_PINS = ROSTER.map(([value, city, count]) => pin(value, city, count));

describe("layoutTowns", () => {
  it("gives one marker per town, not per shelter", () => {
    const towns = layoutTowns(REAL_PINS, 120);
    expect(towns).toHaveLength(16);
    const celje = towns.find((t) => t.city === "Celje")!;
    expect(celje.shelters.map((s) => s.value)).toEqual([
      "macja-hisa",
      "sia-in-lu",
    ]);
  });

  it("leaves no two markers overlapping", () => {
    const towns = layoutTowns(REAL_PINS, 120);
    everyPair(towns, (a, b) => {
      expect(gap(a, b)).toBeGreaterThan(0);
    });
  });

  it("separates Dramlje from Celje, which overlapped by 6px before", () => {
    const towns = layoutTowns(REAL_PINS, 120);
    const dramlje = towns.find((t) => t.city === "Dramlje")!;
    const celje = towns.find((t) => t.city === "Celje")!;
    expect(gap(dramlje, celje)).toBeGreaterThan(0);
  });

  // Markers carry their own clicks again now that the map only draws at dialog
  // width. The guarantee that keeps that honest: a marker's target may fill the
  // space around it but never reaches inside a neighbour's dot.
  it("never lets a marker's target reach inside another marker's dot", () => {
    const towns = layoutTowns(REAL_PINS, 120);
    everyPair(towns, (a, b) => {
      const centres = Math.hypot(a.x - b.x, a.y - b.y);
      expect(a.hitR + b.r).toBeLessThanOrEqual(centres + 1e-9);
      expect(b.hitR + a.r).toBeLessThanOrEqual(centres + 1e-9);
    });
  });

  it("makes every marker's target larger than the dot it covers", () => {
    for (const town of layoutTowns(REAL_PINS, 120)) {
      expect(town.hitR).toBeGreaterThan(town.r);
    }
  });

  // 10 units is about 42px at the width the dialog draws the map, and the
  // tightest marker on the real roster still has to clear the 24px floor.
  it("leaves the tightest marker a target worth aiming at", () => {
    const DIALOG_SCALE = 680 / 320;
    const smallest = Math.min(
      ...layoutTowns(REAL_PINS, 120).map((town) => 2 * town.hitR * DIALOG_SCALE),
    );
    expect(smallest).toBeGreaterThan(24);
  });

  it("keeps every marker within the drift budget of its real town", () => {
    const towns = layoutTowns(REAL_PINS, 120);
    for (const town of towns) {
      const home = cityAt(town.city)!;
      const x = ((home.lon - 13.35) / 3.3) * MAP_WIDTH;
      const y = ((46.9 - home.lat) / 1.5) * MAP_HEIGHT;
      expect(Math.hypot(town.x - x, town.y - y)).toBeLessThanOrEqual(7 + 1e-6);
    }
  });

  it("keeps every marker inside the map", () => {
    for (const town of layoutTowns(REAL_PINS, 120)) {
      expect(town.x - town.r).toBeGreaterThanOrEqual(0);
      expect(town.y - town.r).toBeGreaterThanOrEqual(0);
      expect(town.x + town.r).toBeLessThanOrEqual(MAP_WIDTH);
      expect(town.y + town.r).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  // Blizu mene reorders the list, and the map used to inherit that order.
  it("places a town identically however the pins are ordered", () => {
    const forward = layoutTowns(REAL_PINS, 120);
    const backward = layoutTowns([...REAL_PINS].reverse(), 120);
    expect(backward).toEqual(forward);
  });

  it("keeps a shared town's wedges in the same order either way", () => {
    const celje = (pins: ShelterPin[]) =>
      layoutTowns(pins, 120)
        .find((t) => t.city === "Celje")!
        .shelters.map((s) => s.value);
    expect(celje([...REAL_PINS].reverse())).toEqual(celje(REAL_PINS));
  });

  // The scale is the species tab's own maximum, so a marker means the same
  // thing whatever else the panel is filtering on. Before, the denominator was
  // whichever shelter happened to be biggest under the current filters, so the
  // busiest one was always drawn at full size however few animals were left.
  it("sizes a marker from the fixed scale, not from the filtered maximum", () => {
    const busiest = 120;
    const wide = layoutTowns([pin("a", "Ljubljana", 120)], busiest);
    const narrowed = layoutTowns([pin("a", "Ljubljana", 30)], busiest);
    expect(narrowed[0].r).toBeLessThan(wide[0].r);
    // Same count, same radius, whatever else is in the roster alongside it.
    const alone = layoutTowns([pin("a", "Ljubljana", 30)], busiest);
    const crowded = layoutTowns(
      [pin("a", "Ljubljana", 30), pin("b", "Maribor", 120)],
      busiest,
    );
    expect(crowded.find((t) => t.city === "Ljubljana")!.r).toBeCloseTo(
      alone[0].r,
    );
  });

  it("gives a shared town room to be divided", () => {
    const towns = layoutTowns(
      [pin("a", "Ljubljana", 1), pin("b", "Ljubljana", 1)],
      120,
    );
    expect(towns[0].shelters).toHaveLength(2);
    const alone = layoutTowns([pin("a", "Ljubljana", 2)], 120);
    expect(towns[0].r).toBeGreaterThan(alone[0].r);
  });

  // Each extra wedge takes a share of the same disc, so the disc has to grow or
  // the slices become untappable.
  it("grows the marker as a town is divided more ways", () => {
    const radii = [2, 3, 4, 5].map((n) => {
      const pins = Array.from({ length: n }, (_, i) =>
        pin(`s${i}`, "Ljubljana", 1),
      );
      return layoutTowns(pins, 120)[0].r;
    });
    radii.slice(1).forEach((r, i) => expect(r).toBeGreaterThan(radii[i]));
  });

  it("splits a town into equal wedges covering the whole circle", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const pins = Array.from({ length: n }, (_, i) =>
        pin(`s${i}`, "Ljubljana", 10),
      );
      const [town] = layoutTowns(pins, 120);
      expect(town.shelters).toHaveLength(n);
      const spans = town.shelters.map((s) => s.to - s.from);
      for (const span of spans) expect(span).toBeCloseTo((Math.PI * 2) / n);
      // Contiguous: each wedge starts where the previous one ended.
      town.shelters.slice(1).forEach((s, i) => {
        expect(s.from).toBeCloseTo(town.shelters[i].to);
      });
    }
  });

  it("keeps two towns that round to one point as two markers", () => {
    const at = { lat: 46.0569, lon: 14.5058 };
    const towns = layoutTowns(
      [pin("a", "Ena", 10, at), pin("b", "Dva", 10, { ...at })],
      120,
    );
    expect(towns).toHaveLength(2);
    expect(gap(towns[0], towns[1])).toBeGreaterThan(0);
  });

  it("merges one town spelled two ways into a single marker", () => {
    const towns = layoutTowns(
      [
        pin("a", "Škofja Loka", 10),
        pin("b", "skofja loka", 10, cityAt("Škofja Loka")!),
      ],
      120,
    );
    expect(towns).toHaveLength(1);
    expect(towns[0].shelters).toHaveLength(2);
  });

  it("still places a shelter with nothing available", () => {
    const [town] = layoutTowns([pin("a", "Ljubljana", 0)], 120);
    expect(town.r).toBeGreaterThan(0);
    expect(town.shelters[0].count).toBe(0);
  });

  it("handles an empty roster", () => {
    expect(layoutTowns([], 0)).toEqual([]);
  });
});

describe("wedgePath", () => {
  it("draws a closed slice from the centre", () => {
    const path = wedgePath(10, 10, 5, 0, Math.PI / 2);
    expect(path.startsWith("M10 10")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("sets the large-arc flag only past a half turn", () => {
    expect(wedgePath(0, 0, 5, 0, Math.PI / 2)).toContain("A5 5 0 0 1");
    expect(wedgePath(0, 0, 5, 0, Math.PI * 1.5)).toContain("A5 5 0 1 1");
  });
});

describe("placeLabels", () => {
  const name = (key: string, x: number, ys: number[]) => ({
    key,
    text: "Savinjska",
    size: 5.5,
    x,
    ys,
  });

  it("places a label that has the map to itself", () => {
    const placed = placeLabels([name("a", 160, [100])]);
    expect(placed).toEqual([{ key: "a", x: 160, y: 100, text: "Savinjska" }]);
  });

  it("falls back to its next position when the first is taken", () => {
    const placed = placeLabels([
      name("a", 160, [100]),
      name("b", 160, [100, 120]),
    ]);
    expect(placed.map((l) => l.y)).toEqual([100, 120]);
  });

  it("drops a label with nowhere left to go", () => {
    const placed = placeLabels([
      name("a", 160, [100]),
      name("b", 160, [100]),
    ]);
    expect(placed.map((l) => l.key)).toEqual(["a"]);
  });

  it("respects the order it is given", () => {
    const placed = placeLabels([name("first", 160, [100]), name("second", 160, [100])]);
    expect(placed.map((l) => l.key)).toEqual(["first"]);
  });

  it("leaves off a label that would hang past the edge of the map", () => {
    expect(placeLabels([name("edge", 2, [100])])).toHaveLength(0);
  });

  // The fault the map showed: names were laid straight across the dots,
  // because the placer only knew about other names.
  it("steps a label aside rather than laying it over a marker", () => {
    const towns = layoutTowns([pin("a", "Ljubljana", 40)], 120);
    const [marker] = towns;
    const blocked = placeLabels(
      [name("r", marker.x, [marker.y])],
      markerBoxes(towns),
    );
    expect(blocked).toHaveLength(0);

    const stepped = placeLabels(
      [name("r", marker.x, [marker.y, marker.y + marker.r + 12])],
      markerBoxes(towns),
    );
    expect(stepped).toHaveLength(1);
    expect(stepped[0].y).toBeGreaterThan(marker.y + marker.r);
  });

  it("places nothing for no candidates", () => {
    expect(placeLabels([])).toEqual([]);
  });
});
