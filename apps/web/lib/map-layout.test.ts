import { describe, expect, it } from "vitest";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, type LatLon } from "./geo";
import {
  layoutTowns,
  markerVisualReach,
  townLabel,
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
    const towns = layoutTowns(REAL_PINS);
    expect(towns).toHaveLength(16);
    const celje = towns.find((t) => t.city === "Celje")!;
    expect(celje.shelters.map((s) => s.value)).toEqual([
      "macja-hisa",
      "sia-in-lu",
    ]);
  });

  it("draws every marker at the same size", () => {
    const towns = layoutTowns(REAL_PINS);
    const sizes = new Set(towns.map((town) => town.r));
    expect(sizes.size).toBe(1);
  });

  it("leaves no two markers overlapping", () => {
    const towns = layoutTowns(REAL_PINS);
    everyPair(towns, (a, b) => {
      expect(gap(a, b)).toBeGreaterThan(0);
    });
  });

  it("separates Dramlje from Celje, which overlapped by 6px before", () => {
    const towns = layoutTowns(REAL_PINS);
    const dramlje = towns.find((t) => t.city === "Dramlje")!;
    const celje = towns.find((t) => t.city === "Celje")!;
    expect(gap(dramlje, celje)).toBeGreaterThan(0);
  });

  // At md and wider, a marker's target may fill the space around it but never
  // reaches inside a neighbour's dot.
  it("never lets a marker's target reach inside another marker's dot", () => {
    const towns = layoutTowns(REAL_PINS);
    everyPair(towns, (a, b) => {
      const centres = Math.hypot(a.x - b.x, a.y - b.y);
      expect(a.hitR + b.r).toBeLessThanOrEqual(centres + 1e-9);
      expect(b.hitR + a.r).toBeLessThanOrEqual(centres + 1e-9);
    });
  });

  it("makes every marker's target larger than the dot it covers", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      expect(town.hitR).toBeGreaterThan(town.r);
    }
  });

  it("keeps every visible marker element inside its protected radius", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      expect(markerVisualReach(town)).toBeLessThanOrEqual(town.r + 1e-9);
    }
  });

  it("uses one label source for single shelters and shared towns", () => {
    const towns = layoutTowns(REAL_PINS);
    expect(townLabel(towns.find((town) => town.city === "Celje")!)).toBe(
      "Celje",
    );
    expect(townLabel(towns.find((town) => town.city === "Brežice")!)).toBe(
      "brezice",
    );
  });

  it("keeps every marker within the drift budget of its real town", () => {
    const towns = layoutTowns(REAL_PINS);
    for (const town of towns) {
      const home = cityAt(town.city)!;
      const x = ((home.lon - 13.35) / 3.3) * MAP_WIDTH;
      const y = ((46.9 - home.lat) / 1.5) * MAP_HEIGHT;
      expect(Math.hypot(town.x - x, town.y - y)).toBeLessThanOrEqual(7 + 1e-6);
    }
  });

  it("keeps every marker inside the map", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      expect(town.x - town.r).toBeGreaterThanOrEqual(0);
      expect(town.y - town.r).toBeGreaterThanOrEqual(0);
      expect(town.x + town.r).toBeLessThanOrEqual(MAP_WIDTH);
      expect(town.y + town.r).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  // Blizu mene reorders the list, and the map used to inherit that order.
  it("places a town identically however the pins are ordered", () => {
    const forward = layoutTowns(REAL_PINS);
    const backward = layoutTowns([...REAL_PINS].reverse());
    expect(backward).toEqual(forward);
  });

  it("keeps a shared town's shelters in the same order either way", () => {
    const celje = (pins: ShelterPin[]) =>
      layoutTowns(pins)
        .find((t) => t.city === "Celje")!
        .shelters.map((s) => s.value);
    expect(celje([...REAL_PINS].reverse())).toEqual(celje(REAL_PINS));
  });

  it("keeps two towns that round to one point as two markers", () => {
    const at = { lat: 46.0569, lon: 14.5058 };
    const towns = layoutTowns([
      pin("a", "Ena", 10, at),
      pin("b", "Dva", 10, { ...at }),
    ]);
    expect(towns).toHaveLength(2);
    expect(gap(towns[0], towns[1])).toBeGreaterThan(0);
  });

  it("merges one town spelled two ways into a single marker", () => {
    const towns = layoutTowns(
      [
        pin("a", "Škofja Loka", 10),
        pin("b", "skofja loka", 10, cityAt("Škofja Loka")!),
      ],
    );
    expect(towns).toHaveLength(1);
    expect(towns[0].shelters).toHaveLength(2);
  });

  it("still places a shelter with nothing available", () => {
    const [town] = layoutTowns([pin("a", "Ljubljana", 0)]);
    expect(town.r).toBeGreaterThan(0);
    expect(town.shelters[0].count).toBe(0);
  });

  it("handles an empty roster", () => {
    expect(layoutTowns([])).toEqual([]);
  });
});
