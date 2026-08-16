import { describe, expect, it } from "vitest";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "./geo";
import {
  REGION_SHAPES,
  regionAt,
  regionContains,
  regionPath,
} from "./map-regions";

const at = (city: string) => project(cityAt(city) as LatLon);

describe("REGION_SHAPES", () => {
  it("holds Slovenia's twelve statistical regions", () => {
    expect(REGION_SHAPES).toHaveLength(12);
    expect(REGION_SHAPES.map((r) => r.name)).toEqual([
      "Pomurska",
      "Podravska",
      "Koroška",
      "Savinjska",
      "Zasavska",
      "Posavska",
      "Jugovzhodna Slovenija",
      "Osrednjeslovenska",
      "Gorenjska",
      "Primorsko-notranjska",
      "Goriška",
      "Obalno-kraška",
    ]);
  });

  it("stays inside the map the markers are projected into", () => {
    for (const region of REGION_SHAPES) {
      for (const ring of region.rings) {
        for (const [x, y] of ring) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(MAP_WIDTH);
          expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
        }
      }
    }
  });

  it("puts every region's own label inside it", () => {
    for (const region of REGION_SHAPES) {
      const [x, y] = region.label;
      expect(regionContains(region, { x, y })).toBe(true);
    }
  });

  it("keeps every ring drawable", () => {
    for (const region of REGION_SHAPES) {
      expect(region.rings.length).toBeGreaterThan(0);
      for (const ring of region.rings) expect(ring.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("regionAt", () => {
  // The check that the boundaries and the projection actually agree: these are
  // real towns, and each one has to land in the region it is really in.
  it.each([
    ["Ljubljana", "Osrednjeslovenska"],
    ["Maribor", "Podravska"],
    ["Celje", "Savinjska"],
    ["Koper", "Obalno-kraška"],
    ["Kranj", "Gorenjska"],
    ["Murska Sobota", "Pomurska"],
    ["Novo mesto", "Jugovzhodna Slovenija"],
    ["Nova Gorica", "Goriška"],
    ["Slovenj Gradec", "Koroška"],
    ["Postojna", "Primorsko-notranjska"],
    ["Trbovlje", "Zasavska"],
    ["Krško", "Posavska"],
  ])("puts %s in %s", (city, region) => {
    expect(regionAt(at(city))?.name).toBe(region);
  });

  it("places every shelter town in a region", () => {
    const towns = [
      "Dramlje", "Koper", "Ljubljana", "Vitovlje", "Horjul", "Novo mesto",
      "Trebnje", "Moravske Toplice", "Maribor", "Škofja Loka", "Sevnica",
      "Brežice", "Celje", "Tolmin", "Vransko", "Podlog",
    ];
    for (const town of towns) {
      expect(regionAt(at(town))).toBeDefined();
    }
  });

  it("falls back to the nearest region for a point out at sea", () => {
    expect(regionAt({ x: 0, y: 209 })?.name).toBeDefined();
  });

  it("puts a town in exactly one region", () => {
    const holding = REGION_SHAPES.filter((region) =>
      regionContains(region, at("Maribor")),
    );
    expect(holding).toHaveLength(1);
  });
});

describe("regionPath", () => {
  it("closes every ring of a region", () => {
    for (const region of REGION_SHAPES) {
      const path = regionPath(region);
      expect(path.startsWith("M")).toBe(true);
      expect((path.match(/Z/g) ?? []).length).toBe(region.rings.length);
    }
  });
});
