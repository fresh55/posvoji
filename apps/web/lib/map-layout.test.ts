import { describe, expect, it } from "vitest";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, type LatLon } from "./geo";
import {
  layoutTowns,
  placeLabels,
  townLabels,
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
    expect(towns[0].r).toBeGreaterThanOrEqual(8);
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
  const town = (city: string, x: number, y: number, count: number) =>
    layoutTowns([pin(`s-${city}`, city, count, { lat: 46, lon: 14 })], 120).map(
      (t) => ({ ...t, city, x, y }),
    )[0];

  it("places a label that has the map to itself", () => {
    const placed = placeLabels(townLabels([town("Ljubljana", 160, 100, 10)]));
    expect(placed).toHaveLength(1);
    expect(placed[0].text).toBe("Ljubljana 10");
  });

  it("drops a label once both the space below and above are taken", () => {
    // Three markers on one point: the first takes the space below, the second
    // the space above, and the third has nowhere left to go.
    const placed = placeLabels(
      townLabels([
        town("Ljubljana", 160, 100, 30),
        town("Kranj", 160, 100, 20),
        town("Celje", 160, 100, 10),
      ]),
    );
    expect(placed.map((l) => l.text)).toEqual(["Ljubljana 30", "Kranj 20"]);
  });

  it("falls back to the position above when the one below is taken", () => {
    const first = town("Ljubljana", 160, 100, 20);
    const placed = placeLabels(
      townLabels([first, town("Kranj", 160, 100 + first.r * 2 + 14, 10)]),
    );
    expect(placed).toHaveLength(2);
  });

  it("respects the order it is given, so towns outrank regions", () => {
    const placed = placeLabels([
      { key: "town", text: "Celje 9", size: 7, x: 160, ys: [100] },
      { key: "region", text: "Savinjska", size: 5.5, x: 160, ys: [100] },
    ]);
    expect(placed.map((l) => l.key)).toEqual(["town"]);
  });

  it("leaves off a label that would hang past the edge of the map", () => {
    expect(
      placeLabels([
        { key: "edge", text: "Obalno-kraška", size: 7, x: 2, ys: [100] },
      ]),
    ).toHaveLength(0);
  });

  it("places nothing for no candidates", () => {
    expect(placeLabels([])).toEqual([]);
  });
});
