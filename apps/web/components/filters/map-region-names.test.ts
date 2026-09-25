import { describe, expect, it } from "vitest";
import { cityAt, project } from "@/lib/geo";
import { REGION_SHAPES } from "@/lib/map-regions";
import { intersectionArea, type CalloutRect } from "./map-callout-layout";
import { circleHitsBox, LEADING, outsideFrame } from "./map-names";
import {
  placeRegionNames,
  regionNameBox,
  regionNameSize,
  type PlateDot,
  type RegionNameSpot,
} from "./map-region-names";

// The phone picker's plate, drawn at a little over one pixel to the unit: the
// scale at which the coins have gone and these names are the plate's type.
const SCALE = 1.05;
const SIZE = regionNameSize(SCALE);
const LINE = SIZE * LEADING;
// A picked dot as the plate draws it, 3.5px with a 1.5px ring, in user units.
const DOT_R = (3.5 + 1.5 / 2) / SCALE;
// The air a name keeps from the dot it moved for: two rendered pixels.
const CLEARANCE = 2 / SCALE;

const home = (name: string) =>
  REGION_SHAPES.find((region) => region.name === name)!.label;
const named = (spots: RegionNameSpot[], name: string) =>
  spots.find((spot) => spot.name === name);
const boxOf = (spot: RegionNameSpot) => regionNameBox(spot, SIZE);
const dotAt = (x: number, y: number, r = DOT_R): PlateDot => ({ x, y, r });
const dotOn = (city: string, r = DOT_R): PlateDot => {
  const { x, y } = project(cityAt(city)!);
  return dotAt(x, y, r);
};

/** How far a dot's centre stands from the nearest point of a box. */
function gapTo(dot: PlateDot, box: CalloutRect): number {
  const dx = dot.x - Math.min(Math.max(dot.x, box.x), box.x + box.width);
  const dy = dot.y - Math.min(Math.max(dot.y, box.y), box.y + box.height);
  return Math.hypot(dx, dy);
}

/** Every name clear of every dot, of the rest and of the plate's edge. */
function expectClear(
  spots: RegionNameSpot[],
  dots: PlateDot[],
  avoid: CalloutRect[] = [],
) {
  const boxes = spots.map(boxOf);
  boxes.forEach((box, index) => {
    for (const dot of dots) {
      expect(circleHitsBox(dot.x, dot.y, dot.r, box)).toBe(false);
    }
    for (const other of [...boxes.slice(index + 1), ...avoid]) {
      expect(intersectionArea(box, other)).toBe(0);
    }
    expect(outsideFrame(box)).toBe(0);
  });
}

describe("placeRegionNames", () => {
  it("leaves every name on its own point when nothing is drawn over it", () => {
    const spots = placeRegionNames(SCALE, [], []);

    for (const spot of spots) {
      expect([spot.x, spot.y]).toEqual(home(spot.name));
    }
    // Two names sharing any area still drop the later one, as they always
    // did: Goriška runs into Osrednjeslovenska at this size.
    expect(named(spots, "Osrednjeslovenska")).toBeDefined();
    expect(named(spots, "Goriška")).toBeUndefined();
    expectClear(spots, []);
  });

  it("moves a name off a picked dot, by the least that clears it", () => {
    // Maribor's dot stands in the top of Podravska's name: "Po•dravska".
    const maribor = dotOn("Maribor");
    const before = named(placeRegionNames(SCALE, [], []), "Podravska")!;
    expect(circleHitsBox(maribor.x, maribor.y, maribor.r, boxOf(before))).toBe(true);

    const spots = placeRegionNames(SCALE, [], [maribor]);
    const podravska = named(spots, "Podravska")!;

    // Down, which is the nearer way off a dot in the name's top, and only up
    // or down: the name stays over its own region.
    expect(podravska.x).toBe(home("Podravska")[0]);
    expect(podravska.y).toBeGreaterThan(home("Podravska")[1]);
    // Clear of the dot by the clearance and not a unit further.
    expect(gapTo(maribor, boxOf(podravska))).toBeCloseTo(DOT_R + CLEARANCE, 6);
    // Nothing the dot does not touch has moved.
    for (const spot of spots) {
      if (spot.name !== "Podravska") expect([spot.x, spot.y]).toEqual(home(spot.name));
    }
    expectClear(spots, [maribor]);
  });

  it("moves up when up is the nearer way off", () => {
    // A dot on Gorenjska's baseline, low in its name.
    const [x, y] = home("Gorenjska");
    const dot = dotAt(x, y);

    const gorenjska = named(placeRegionNames(SCALE, [], [dot]), "Gorenjska")!;

    expect(gorenjska.y).toBeLessThan(y);
    expect(gapTo(dot, boxOf(gorenjska))).toBeCloseTo(DOT_R + CLEARANCE, 6);
  });

  // Gorenjska with a dot low in its name, which on its own sends it up (see
  // above), and annotations standing just clear of it.
  const [gorenjskaX, gorenjskaY] = home("Gorenjska");
  const gorenjskaDot = dotAt(gorenjskaX, gorenjskaY);
  const gorenjskaBox = boxOf({
    id: 9,
    name: "Gorenjska",
    lines: ["Gorenjska"],
    x: gorenjskaX,
    y: gorenjskaY,
  });
  const above: CalloutRect = {
    x: gorenjskaBox.x,
    y: gorenjskaBox.y - 18,
    width: gorenjskaBox.width,
    height: 16,
  };
  const below: CalloutRect = {
    x: gorenjskaBox.x,
    y: gorenjskaBox.y + gorenjskaBox.height + 6,
    width: gorenjskaBox.width,
    height: 14,
  };

  it("takes the far side when an annotation holds the near one", () => {
    const moved = named(
      placeRegionNames(SCALE, [above], [gorenjskaDot]),
      "Gorenjska",
    )!;

    expect(moved.y).toBeGreaterThan(gorenjskaY);
    expectClear([moved], [gorenjskaDot], [above]);
  });

  it("drops a name rather than carry it more than two lines off its point", () => {
    // There is open plate past both annotations, but further off than two
    // lines, where a name starts to read as its neighbour's.
    expect(gorenjskaBox.y + gorenjskaBox.height - above.y).toBeGreaterThan(2 * LINE);
    expect(below.y + below.height - gorenjskaBox.y).toBeGreaterThan(2 * LINE);

    const spots = placeRegionNames(SCALE, [above, below], [gorenjskaDot]);

    expect(named(spots, "Gorenjska")).toBeUndefined();
    // The rest of the plate is untouched by it.
    expect(named(spots, "Podravska")).toBeDefined();
  });

  it("clears every mark a pick by distance puts round one name, the same way every time", () => {
    // Picked from Kranj: Škofja Loka, Horjul and Ljubljana, with the origin's
    // ring on Kranj itself. Osrednjeslovenska is set right across the middle
    // two, and Gorenjska sits on the ring.
    const dots = [
      dotOn("Škofja Loka"),
      dotOn("Horjul"),
      dotOn("Ljubljana"),
      dotOn("Kranj", 5.5),
    ];

    const spots = placeRegionNames(SCALE, [], dots);

    expect(named(spots, "Osrednjeslovenska")).toBeDefined();
    expect(named(spots, "Gorenjska")).toBeDefined();
    expectClear(spots, dots);
    for (const spot of spots) {
      expect(Math.abs(spot.y - home(spot.name)[1])).toBeLessThanOrEqual(2 * LINE);
    }
    // A name no dot touches keeps its own point: the names that had to move
    // looked for room among the ones standing still, never the other way.
    const untouched = placeRegionNames(SCALE, [], []).filter(
      (spot) => !dots.some((dot) => circleHitsBox(dot.x, dot.y, dot.r, boxOf(spot))),
    );
    for (const spot of untouched) {
      expect(named(spots, spot.name)).toEqual(spot);
    }
    // No measuring, so no drift: the same marks put every name in the same
    // place on every render.
    expect(placeRegionNames(SCALE, [], dots)).toEqual(spots);
  });
});
