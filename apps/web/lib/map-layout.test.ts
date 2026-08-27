import { describe, expect, it } from "vitest";
import { cityAt, MAP_HEIGHT, MAP_WIDTH, type LatLon } from "./geo";
import {
  clusterDiscs,
  clusterHitWedges,
  DENSITY_STEPS,
  densityScale,
  discFitsGlyph,
  dominantShelterIndex,
  driftBudget,
  layoutTowns,
  markerGeometry,
  markerRadius,
  markerVisualReach,
  MARKER_STROKE_WIDTH,
  mergeTownDots,
  satelliteDiscs,
  satelliteHitCircles,
  townLabel,
  type ClusterDisc,
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

// The real roster, which is what the layout has to survive. Counts measured
// off data/dist on 2026-08: Celje is the one town holding two shelters, the
// larger of them the busiest in the country and the other with nothing listed,
// which is the case the satellite layout exists for.
const ROSTER: [string, string, number][] = [
  ["zonzani", "Dramlje", 19],
  ["obalno", "Koper", 38],
  ["ljubljana", "Ljubljana", 50],
  ["oskar", "Vitovlje", 35],
  ["horjul", "Horjul", 72],
  ["turk", "Novo mesto", 23],
  ["meli", "Trebnje", 18],
  ["mala-hisa", "Moravske Toplice", 13],
  ["maribor", "Maribor", 23],
  ["macji-dol", "Škofja Loka", 15],
  ["sevnica", "Sevnica", 12],
  ["brezice", "Brežice", 10],
  ["macja-hisa", "Celje", 186],
  ["johanca", "Tolmin", 8],
  ["muri", "Vransko", 46],
  ["potepuhi", "Podlog", 16],
  ["sia-in-lu", "Celje", 0],
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

  it("sizes a marker by the animals its town holds, in three steps", () => {
    const towns = layoutTowns(REAL_PINS);
    const at = (city: string) => towns.find((town) => town.city === city)!.r;
    // Tolmin 8, Novo mesto 23, Ljubljana 50: one town per step.
    expect(at("Ljubljana")).toBeGreaterThan(at("Novo mesto"));
    expect(at("Novo mesto")).toBeGreaterThan(at("Tolmin"));
    // Steps, not a curve: Koper holds 38 to Novo mesto's 23 and both are
    // middling, so the two markers are the same size.
    expect(at("Koper")).toBe(at("Novo mesto"));
    expect(new Set(towns.map((town) => town.r)).size).toBe(3);
    for (const town of towns) {
      expect(town.r).toBeGreaterThanOrEqual(4.7);
      expect(town.r).toBeLessThanOrEqual(8);
    }
  });

  it("puts each town on the step its count earns", () => {
    expect(markerRadius(0)).toBe(4.7);
    expect(markerRadius(19)).toBe(4.7);
    expect(markerRadius(20)).toBe(5.8);
    expect(markerRadius(49)).toBe(5.8);
    expect(markerRadius(50)).toBe(7.2);
    expect(markerRadius(500)).toBe(7.2);
  });

  // The eye compares discs by area, not by radius, and the two markers being
  // compared are never adjacent on the map. The steps this replaced held 1.32x
  // and 1.28x and did not read as three sizes at all.
  it("keeps each size step at least half again the area of the one below", () => {
    const steps = [markerRadius(0), markerRadius(20), markerRadius(50)];
    for (let index = 1; index < steps.length; index += 1) {
      const ratio = (steps[index] / steps[index - 1]) ** 2;
      expect(ratio).toBeGreaterThanOrEqual(1.5);
    }
  });

  // The smallest bin has to stay large enough that a two-shelter town in it
  // still fits a paw in each of its discs. Pulling the floor lower drops the
  // glyph without any test noticing otherwise.
  it("keeps the paw in a two-shelter town at the smallest size", () => {
    const [town] = layoutTowns([
      pin("a", "Ljubljana", 0),
      pin("b", "Ljubljana", 0),
    ]);
    expect(town.r).toBe(markerRadius(0));
    for (const disc of clusterDiscs(town)) {
      expect(discFitsGlyph(disc.r)).toBe(true);
    }
  });

  it("gives a town with nothing available the smallest marker", () => {
    const towns = layoutTowns([
      pin("a", "Ljubljana", 0),
      pin("b", "Koper", 60),
    ]);
    expect(towns.find((town) => town.city === "Ljubljana")!.r).toBe(4.7);
    expect(towns.find((town) => town.city === "Koper")!.r).toBe(7.2);
  });

  it("leaves no two markers overlapping", () => {
    const towns = layoutTowns(REAL_PINS);
    everyPair(towns, (a, b) => {
      expect(gap(a, b)).toBeGreaterThan(0);
    });
  });

  // A dominated town draws outside its coin, so the coins clearing each other
  // is no longer enough: the composite footprints have to clear each other
  // too, or Celje's satellite lands on Dramlje.
  it("leaves no two markers' whole footprints overlapping", () => {
    const towns = layoutTowns(REAL_PINS);
    everyPair(towns, (a, b) => {
      expect(
        Math.hypot(a.x - b.x, a.y - b.y) - a.reach - b.reach,
      ).toBeGreaterThan(0);
    });
  });

  // Nothing a marker paints may cross into another marker's footprint, which
  // is the invariant the reach exists to carry. Checked on the marks
  // themselves rather than on the radius they were promised.
  it("keeps every mark of every marker out of every other marker's reach", () => {
    const towns = layoutTowns(REAL_PINS);
    const marks = towns.flatMap((town) => [
      { town, x: town.x, y: town.y, r: town.r },
      ...clusterDiscs(town).map((disc) => ({ town, ...disc })),
      ...satelliteDiscs(town).map((disc) => ({ town, ...disc })),
    ]);
    for (const mark of marks) {
      for (const other of towns) {
        if (other.key === mark.town.key) continue;
        expect(
          Math.hypot(mark.x - other.x, mark.y - other.y) -
            mark.r -
            MARKER_STROKE_WIDTH / 2,
        ).toBeGreaterThan(other.reach);
      }
    }
  });

  it("separates Dramlje from Celje, which overlapped by 6px before", () => {
    const towns = layoutTowns(REAL_PINS);
    const dramlje = towns.find((t) => t.city === "Dramlje")!;
    const celje = towns.find((t) => t.city === "Celje")!;
    expect(gap(dramlje, celje)).toBeGreaterThan(0);
  });

  // At md and wider, a marker's target may fill the space around it but never
  // reaches inside a neighbour's dot.
  it("never lets a marker's target reach inside another marker's ink", () => {
    const towns = layoutTowns(REAL_PINS);
    everyPair(towns, (a, b) => {
      const centres = Math.hypot(a.x - b.x, a.y - b.y);
      expect(a.hitR + b.reach).toBeLessThanOrEqual(centres + 1e-9);
      expect(b.hitR + a.reach).toBeLessThanOrEqual(centres + 1e-9);
    });
  });

  it("makes every marker's target larger than the marks it covers", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      expect(town.hitR).toBeGreaterThan(town.r);
      expect(town.hitR).toBeGreaterThanOrEqual(town.reach);
    }
  });

  it("keeps every visible marker element inside its protected reach", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      expect(markerVisualReach(town)).toBeLessThanOrEqual(town.reach + 1e-9);
    }
  });

  // A marker that draws nothing outside its coin has to protect exactly the
  // radius it always protected, or the whole country relaxes differently for
  // the sake of one town in Celje.
  it("gives an undominated town a reach no larger than its coin", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      if (satelliteDiscs(town).length > 0) continue;
      expect(town.reach).toBe(town.r);
    }
  });

  // Clusters grow a disc per shelter, so the invariant has to hold at every
  // cluster size the marker draws, not only at the two the roster happens to
  // contain.
  it("keeps clusters of every drawn size inside the protected radius", () => {
    for (const size of [1, 2, 3, 4, 5]) {
      const towns = layoutTowns(
        Array.from({ length: size }, (_, index) =>
          pin(`s${index}`, "Ljubljana", 20),
        ),
      );
      expect(towns).toHaveLength(1);
      expect(markerVisualReach(towns[0])).toBeLessThanOrEqual(
        towns[0].reach + 1e-9,
      );
      for (const disc of clusterDiscs(towns[0])) {
        const reach =
          Math.hypot(disc.x - towns[0].x, disc.y - towns[0].y) + disc.r;
        expect(reach).toBeLessThanOrEqual(markerGeometry(towns[0]).discRadius);
      }
    }
  });

  it("draws one disc per shelter up to three, and none past it", () => {
    const cluster = (size: number) =>
      clusterDiscs(
        layoutTowns(
          Array.from({ length: size }, (_, index) =>
            pin(`s${index}`, "Ljubljana", 20),
          ),
        )[0],
      ).length;
    expect(cluster(1)).toBe(0);
    expect(cluster(2)).toBe(2);
    expect(cluster(3)).toBe(3);
    // Four shelters get the counted disc instead, so there are no discs to lie.
    expect(cluster(4)).toBe(0);
  });

  it("drops the paw from discs too small to show one", () => {
    const [tight] = layoutTowns([
      pin("a", "Ljubljana", 0),
      pin("b", "Ljubljana", 0),
      pin("c", "Ljubljana", 0),
    ]);
    for (const disc of clusterDiscs(tight)) {
      expect(discFitsGlyph(disc.r)).toBe(false);
    }
    expect(discFitsGlyph(markerGeometry(tight).discRadius)).toBe(true);
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
      expect(Math.hypot(town.x - x, town.y - y)).toBeLessThanOrEqual(
        driftBudget(town.reach) + 1e-6,
      );
    }
  });

  it("keeps every marker inside the map", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      // The whole composite, satellites included: a mark clipped by the frame
      // is a shelter the map lost.
      expect(town.x - town.reach).toBeGreaterThanOrEqual(0);
      expect(town.y - town.reach).toBeGreaterThanOrEqual(0);
      expect(town.x + town.reach).toBeLessThanOrEqual(MAP_WIDTH);
      expect(town.y + town.reach).toBeLessThanOrEqual(MAP_HEIGHT);
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
    const towns = layoutTowns([
      pin("a", "Škofja Loka", 10),
      pin("b", "skofja loka", 10, cityAt("Škofja Loka")!),
    ]);
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

// One town holding the given counts, which is what a cluster is made of.
function cluster(counts: number[], city = "Ljubljana") {
  return layoutTowns(
    counts.map((count, index) => pin(`s${index}`, city, count)),
  )[0];
}

// How deep each pair of discs sits in the other. Negative is clear water.
function overlaps(discs: ClusterDisc[]): number[] {
  const found: number[] = [];
  everyPair(discs, (a, b) =>
    found.push(a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)),
  );
  return found;
}

// The overlap an equal-count town of the same size and the same bin draws,
// which is the line an unequal one is not allowed to cross.
function uniformOverlap(counts: number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const even = cluster(counts.map(() => total / counts.length));
  return Math.max(...overlaps(clusterDiscs(even)));
}

// Every split a coin is still divided over: no shelter holding four times
// another, which is where the town changes layout instead. Both cluster sizes
// and all three marker bins, and the near misses on both sides of the line.
const SPLITS: number[][] = [
  [10, 10],
  [30, 10],
  [79, 20],
  [0, 0],
  [10, 10, 10],
  [60, 20, 5],
  [50, 20, 15],
  [3, 2, 2],
  [40, 30, 0],
  [0, 0, 0],
];

// The splits that no longer divide a coin at all: one shelter holds at least
// four times every other, so the town draws a coin and satellites.
const DOMINATED: number[][] = [
  [186, 11],
  [186, 0],
  [80, 20],
  [1, 1000],
  [18, 1],
  [0, 12],
  [186, 11, 11],
  [1000, 1, 1],
  [1, 1, 1000],
  [180, 20, 6],
  [40, 0, 4],
  [0, 0, 30],
];

describe("clusterDiscs", () => {
  it("draws an evenly split town exactly as the uniform layout did", () => {
    for (const [size, radius, offset] of [
      [2, 0.53, 0.46],
      [3, 0.47, 0.52],
    ]) {
      const town = cluster(Array.from({ length: size }, () => 20));
      const { discRadius } = markerGeometry(town);
      for (const disc of clusterDiscs(town)) {
        expect(disc.r).toBeCloseTo(discRadius * radius, 10);
        expect(Math.hypot(disc.x - town.x, disc.y - town.y)).toBeCloseTo(
          discRadius * offset,
          10,
        );
      }
    }
  });

  // Within a coin the discs still have to order by count. The lopsided pairs
  // this used to be written against (Celje's 186 beside 11) leave by the
  // satellite path now, so the case is a town that genuinely shares.
  it("gives the busier shelter in a town the larger disc", () => {
    const [big, small] = clusterDiscs(cluster([60, 20], "Celje"));
    expect(big.r).toBeGreaterThan(small.r);
    // The pair keeps the ink the uniform layout spent, so the coin does not
    // change weight when its shelters are uneven.
    const uniform = markerGeometry(cluster([60, 20], "Celje")).clusterRadius;
    expect(big.r + small.r).toBeCloseTo(uniform * 2, 10);
  });

  // Counted discs only. A shelter with nothing listed keeps the uniform slot
  // and draws the hollow mark at EMPTY_MARKER_RADIUS_SCALE of it, which is
  // smaller than any counted disc the cap allows, so it never out-measures a
  // shelter that has animals.
  it("orders discs by count in every split, at both cluster sizes", () => {
    for (const counts of SPLITS) {
      const discs = clusterDiscs(cluster(counts));
      counts.forEach((count, index) => {
        counts.forEach((other, otherIndex) => {
          if (count <= other || other === 0) return;
          expect(discs[index].r).toBeGreaterThanOrEqual(
            discs[otherIndex].r - 1e-9,
          );
        });
      });
    }
  });

  // Four times the area, twice the radius, and four times the animals is
  // exactly where the town stops sharing a coin. The two limits are one line,
  // so inside a coin this can only ever be reached, never crossed.
  it("never lets one disc out-measure another by more than 2:1 in radius", () => {
    for (const counts of SPLITS) {
      const radii = clusterDiscs(cluster(counts)).map((disc) => disc.r);
      expect(Math.max(...radii) / Math.min(...radii)).toBeLessThanOrEqual(
        2 + 1e-9,
      );
    }
  });

  it("keeps every disc inside the coin, whatever the split", () => {
    for (const counts of SPLITS) {
      const town = cluster(counts);
      const { discRadius } = markerGeometry(town);
      for (const disc of clusterDiscs(town)) {
        expect(
          Math.hypot(disc.x - town.x, disc.y - town.y) + disc.r,
        ).toBeLessThanOrEqual(discRadius + 1e-9);
      }
    }
  });

  it("never packs two discs tighter than an evenly split town packs them", () => {
    for (const counts of SPLITS) {
      const allowed = uniformOverlap(counts);
      for (const overlap of overlaps(clusterDiscs(cluster(counts)))) {
        expect(overlap).toBeLessThanOrEqual(allowed + 1e-6);
      }
    }
  });

  it("keeps the real roster's shared towns inside the coin and apart", () => {
    for (const town of layoutTowns(REAL_PINS)) {
      const discs = clusterDiscs(town);
      if (discs.length === 0) continue;
      const { discRadius } = markerGeometry(town);
      const allowed = uniformOverlap(town.shelters.map((s) => s.count));
      for (const disc of discs) {
        expect(
          Math.hypot(disc.x - town.x, disc.y - town.y) + disc.r,
        ).toBeLessThanOrEqual(discRadius + 1e-9);
      }
      for (const overlap of overlaps(discs)) {
        expect(overlap).toBeLessThanOrEqual(allowed + 1e-6);
      }
    }
  });

  // The hollow "nothing listed" mark carries no count, so it takes no part in
  // the division: it holds a slot rather than a share. A zero beside one busy
  // shelter is a dominated town and leaves by the satellite path, so the case
  // that still divides a coin is a zero beside two shelters that share one.
  it("leaves a shelter with nothing listed a slot of its own, not a share", () => {
    const [, , empty] = clusterDiscs(cluster([40, 30, 0]));
    const [, , busier] = clusterDiscs(cluster([400, 300, 0]));
    // The slot is the space the mark is given, and the hollow circle drawn in
    // it is a fraction of that (EMPTY_MARKER_RADIUS_SCALE), which is why the
    // slot may measure more than a counted disc while the mark never does.
    expect(empty.r).toBeGreaterThan(0);
    // Ten times the animals in both counted shelters moves it not at all: it
    // carries no count, so it takes no part in the division.
    expect(empty.r).toBeCloseTo(busier.r, 10);
  });

  // A disc under the glyph floor drops its paw rather than drawing a smudge.
  // The wedge still names that shelter and the callout still counts it.
  it("lets the smaller disc of a lopsided small town fall under the glyph floor", () => {
    const town = cluster([16, 5]);
    const [big, small] = clusterDiscs(town);
    expect(town.r).toBe(markerRadius(21));
    expect(discFitsGlyph(big.r)).toBe(true);
    expect(discFitsGlyph(small.r)).toBe(false);
    expect(clusterHitWedges(town).map((wedge) => wedge.value)).toEqual([
      "s0",
      "s1",
    ]);
  });

  it("draws no discs at all in a town one shelter dominates", () => {
    for (const counts of DOMINATED) {
      expect(clusterDiscs(cluster(counts))).toEqual([]);
      expect(clusterHitWedges(cluster(counts))).toEqual([]);
    }
  });
});

describe("satelliteDiscs", () => {
  // The whole reason this layout exists. Mačja hiša holds 186 animals, more
  // than any other shelter in the country, and shared a coin with a shelter
  // that lists none: the biggest shelter in Slovenia drew a smaller mark than
  // Horjul's 72 two regions away. Now it draws the coin Horjul draws, because
  // it is sized by its own animals and nothing else.
  it("gives the dominant shelter the coin its own count earns, as if it stood alone", () => {
    const celje = cluster([186, 0], "Celje");
    const [horjul] = layoutTowns([pin("horjul", "Horjul", 72)]);
    expect(celje.r).toBe(markerRadius(186));
    expect(markerGeometry(celje).discRadius).toBe(
      markerGeometry(horjul).discRadius,
    );

    // And against the shelter it shares the town with, which is what the
    // country reads: one coin, one small companion.
    const [satellite] = satelliteDiscs(celje);
    expect(satellite.value).toBe("s1");
    expect(satellite.r).toBeLessThan(markerGeometry(celje).discRadius / 2);
  });

  it("still sizes an undominated town by everything it holds", () => {
    // Two shelters under the line share a coin sized by the pair, which is
    // larger than either of them alone would earn.
    const town = cluster([30, 10]);
    expect(town.r).toBe(markerRadius(40));
    expect(satelliteDiscs(town)).toEqual([]);
  });

  it("switches mode at exactly four times, and not a shelter earlier", () => {
    expect(dominantShelterIndex(cluster([80, 20]).shelters)).toBe(0);
    expect(satelliteDiscs(cluster([80, 20]))).toHaveLength(1);
    expect(dominantShelterIndex(cluster([79, 20]).shelters)).toBe(-1);
    expect(satelliteDiscs(cluster([79, 20]))).toEqual([]);
    // Three shelters: the dominant has to clear every one of them.
    expect(satelliteDiscs(cluster([180, 20, 6]))).toHaveLength(2);
    expect(satelliteDiscs(cluster([180, 50, 6]))).toEqual([]);
  });

  it("leaves a town nobody dominates alone", () => {
    // Equal counts are the plainest undominated town there is, and a town
    // with nothing listed anywhere has no shelter to promote.
    expect(satelliteDiscs(cluster([10, 10]))).toEqual([]);
    expect(satelliteDiscs(cluster([0, 0]))).toEqual([]);
    expect(satelliteDiscs(cluster([0, 0, 0]))).toEqual([]);
    // One shelter is already a whole coin; past three the marker counts
    // instead of drawing marks.
    expect(satelliteDiscs(cluster([50]))).toEqual([]);
    expect(satelliteDiscs(cluster([200, 10, 10, 10]))).toEqual([]);
  });

  it("keeps every satellite small, ordered by its own count", () => {
    for (const counts of DOMINATED) {
      const town = cluster(counts);
      const satellites = satelliteDiscs(town);
      expect(satellites.length).toBe(counts.length - 1);
      for (const satellite of satellites) {
        expect(satellite.r).toBeGreaterThanOrEqual(2.2);
        expect(satellite.r).toBeLessThanOrEqual(2.8);
        // Never a coin of its own: the smallest marker the map draws is 4.7.
        expect(satellite.r).toBeLessThan(markerRadius(0) * 0.7);
      }
      // The busier companion is the larger disc, same rule the coins keep.
      const others = counts
        .map((count, index) => ({ count, index }))
        .filter(({ index }) => index !== dominantShelterIndex(town.shelters))
        .map(({ count }, slot) => ({ count, r: satellites[slot].r }));
      for (const a of others) {
        for (const b of others) {
          if (a.count > b.count) expect(a.r).toBeGreaterThan(b.r - 1e-9);
        }
      }
    }
  });

  it("hangs every satellite on the rim, clear of the coin's glyph", () => {
    for (const counts of DOMINATED) {
      const town = cluster(counts);
      const { discRadius } = markerGeometry(town);
      for (const satellite of satelliteDiscs(town)) {
        const offset = Math.hypot(satellite.x - town.x, satellite.y - town.y);
        // Outside the coin's centre by more than the coin's own radius, so
        // the satellite is a companion and not a disc cut out of the coin.
        expect(offset).toBeGreaterThan(discRadius);
        // Attached, not adrift: it bites into the rim rather than floating
        // off it.
        expect(offset).toBeLessThan(discRadius + satellite.r);
        // The paw inside the coin is drawn at 1.15 times the coin's radius,
        // so its box reaches 0.575 of that from the centre. Nothing may sit
        // on it.
        expect(offset - satellite.r).toBeGreaterThan(discRadius * 0.575);
      }
    }
  });

  it("keeps two satellites off each other", () => {
    for (const counts of DOMINATED) {
      const satellites = satelliteDiscs(cluster(counts));
      everyPair(satellites, (a, b) => {
        expect(gap(a, b)).toBeGreaterThan(0);
      });
    }
  });

  it("counts the whole composite as the marker's reach", () => {
    for (const counts of DOMINATED) {
      const town = cluster(counts);
      expect(town.reach).toBeGreaterThan(town.r);
      for (const satellite of satelliteDiscs(town)) {
        const outer =
          Math.hypot(satellite.x - town.x, satellite.y - town.y) + satellite.r;
        expect(outer + MARKER_STROKE_WIDTH / 2).toBeLessThanOrEqual(
          town.reach + 1e-9,
        );
      }
    }
  });
});

describe("satelliteHitCircles", () => {
  it("gives every mark of a dominated town its own target, coin first", () => {
    const town = cluster([186, 0], "Celje");
    const hits = satelliteHitCircles(town);
    expect(hits.map((hit) => hit.value)).toEqual(["s0", "s1"]);
    // The coin takes the town's whole target: it holds most of the town, so
    // ground the satellites do not cover answers for it.
    expect(hits[0].r).toBe(town.hitR);
    expect(hits[0].x).toBe(town.x);
    // A satellite's target covers its own mark and no more.
    const [satellite] = satelliteDiscs(town);
    expect(hits[1].x).toBe(satellite.x);
    expect(hits[1].r).toBeCloseTo(satellite.r + MARKER_STROKE_WIDTH / 2, 10);
  });

  it("covers every satellite it draws, in every dominated split", () => {
    for (const counts of DOMINATED) {
      const town = cluster(counts);
      const hits = satelliteHitCircles(town);
      // One target per shelter, none of them left without an answer.
      expect([...hits.map((hit) => hit.value)].sort()).toEqual(
        town.shelters.map((shelter) => shelter.value).sort(),
      );
      // The coin is painted first and the satellites over it, so the mark
      // under the pointer is the one that answers.
      expect(hits[0].value).toBe(
        town.shelters[dominantShelterIndex(town.shelters)].value,
      );
    }
  });

  it("answers for nothing in a town that still shares its coin", () => {
    expect(satelliteHitCircles(cluster([10, 10]))).toEqual([]);
    expect(satelliteHitCircles(cluster([50]))).toEqual([]);
  });
});

// Pulls the numbers out of a wedge's "M cx cy L x y A r r 0 0 1 x y A r r 0 0
// 1 x y Z" path in the order the string emits them.
function parseWedge(d: string) {
  const n = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return {
    center: { x: n[0], y: n[1] },
    start: { x: n[2], y: n[3] },
    r: n[4],
    mid: { x: n[9], y: n[10] },
    end: { x: n[16], y: n[17] },
  };
}

// Degrees clockwise from east, same convention CLUSTER_ANGLES uses.
function angleOf(
  point: { x: number; y: number },
  center: { x: number; y: number },
) {
  const degrees =
    (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

// True if `angle` lies on the clockwise arc from `start` to `end`.
function angleInWedge(angle: number, start: number, end: number): boolean {
  const span = (end - start + 360) % 360;
  const offset = (angle - start + 360) % 360;
  return offset <= span + 1e-6;
}

describe("clusterHitWedges", () => {
  it("returns no wedges for a single shelter or one past the cluster cap", () => {
    const [solo] = layoutTowns([pin("a", "Ljubljana", 20)]);
    expect(clusterHitWedges(solo)).toEqual([]);
    const [crowded] = layoutTowns(
      Array.from({ length: 4 }, (_, index) =>
        pin(`s${index}`, "Ljubljana", 20),
      ),
    );
    expect(clusterHitWedges(crowded)).toEqual([]);
  });

  it("gives a 2-shelter town one wedge per shelter, each holding its own disc", () => {
    const [town] = layoutTowns([
      pin("a", "Ljubljana", 20),
      pin("b", "Ljubljana", 20),
    ]);
    const wedges = clusterHitWedges(town);
    expect(wedges.map((w) => w.value)).toEqual(["a", "b"]);

    const discs = clusterDiscs(town);
    wedges.forEach((wedge, index) => {
      const { center, start, mid, end, r } = parseWedge(wedge.d);
      expect(r).toBeCloseTo(town.hitR, 1);
      for (const point of [start, mid, end]) {
        expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(
          town.hitR,
          1,
        );
      }
      const startAngle = angleOf(start, center);
      const endAngle = angleOf(end, center);
      discs.forEach((disc, discIndex) => {
        const discAngle = angleOf(disc, center);
        expect(angleInWedge(discAngle, startAngle, endAngle)).toBe(
          discIndex === index,
        );
      });
    });
  });

  it("gives a 3-shelter town one wedge per shelter, each holding its own disc", () => {
    const [town] = layoutTowns([
      pin("a", "Ljubljana", 20),
      pin("b", "Ljubljana", 20),
      pin("c", "Ljubljana", 20),
    ]);
    const wedges = clusterHitWedges(town);
    expect(wedges.map((w) => w.value)).toEqual(["a", "b", "c"]);

    const discs = clusterDiscs(town);
    wedges.forEach((wedge, index) => {
      const { center, start, mid, end, r } = parseWedge(wedge.d);
      expect(r).toBeCloseTo(town.hitR, 1);
      for (const point of [start, mid, end]) {
        expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(
          town.hitR,
          1,
        );
      }
      const startAngle = angleOf(start, center);
      const endAngle = angleOf(end, center);
      discs.forEach((disc, discIndex) => {
        const discAngle = angleOf(disc, center);
        expect(angleInWedge(discAngle, startAngle, endAngle)).toBe(
          discIndex === index,
        );
      });
    });
  });
});

describe("mergeTownDots", () => {
  const dot = (key: string, x: number, y: number, selected = false) => ({
    key,
    x,
    y,
    selected,
  });

  it("leaves towns that already read as two alone", () => {
    const dots = [dot("a", 100, 100), dot("b", 120, 100)];

    expect(mergeTownDots(dots, 8.4)).toEqual(dots);
  });

  it("folds a pair the layout could not pull apart into one dot", () => {
    const merged = mergeTownDots([dot("a", 100, 100), dot("b", 104, 100)], 8.4);

    expect(merged).toHaveLength(1);
    expect(merged[0].x).toBe(102);
    expect(merged[0].y).toBe(100);
  });

  it("keeps the pick when only one of the merged towns holds it", () => {
    const merged = mergeTownDots(
      [dot("a", 100, 100), dot("b", 103, 101, true)],
      8.4,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].selected).toBe(true);
  });

  it("names a merged dot after every town in it, so the key stays stable", () => {
    const merged = mergeTownDots([dot("a", 100, 100), dot("b", 102, 100)], 8.4);

    expect(merged[0].key).toBe("a+b");
  });

  it("takes a third town into the same dot when it lands on the pair", () => {
    const merged = mergeTownDots(
      [dot("a", 100, 100), dot("b", 104, 100), dot("c", 102, 103)],
      8.4,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe("a+b+c");
  });

  it("separates a distant third town from a merged pair", () => {
    const merged = mergeTownDots(
      [dot("a", 100, 100), dot("b", 104, 100), dot("c", 200, 50, true)],
      8.4,
    );

    expect(merged.map((one) => one.key)).toEqual(["a+b", "c"]);
    expect(merged[1].selected).toBe(true);
  });

  it("merges nothing on the live roster, where collision layout has already separated the towns", () => {
    // The plate's dots are far smaller than the markers layoutTowns holds
    // apart, so the guard must never fire on a roster the layout handled. The
    // tightest pair in the country, Celje and Dramlje, lays out 14.5 units
    // apart against a threshold of 8.4.
    const towns = layoutTowns(REAL_PINS);
    const dots = towns.map((town) => ({
      key: town.key,
      x: town.x,
      y: town.y,
      selected: false,
    }));

    expect(mergeTownDots(dots, 8.4)).toHaveLength(towns.length);
  });

  it("has nothing to say about an empty roster", () => {
    expect(mergeTownDots([], 8.4)).toEqual([]);
  });
});

describe("densityScale", () => {
  it("spreads the ramp end to end however the totals bunch up", () => {
    // Two shelters hold most of the animals in the country. Fixed thresholds
    // dropped every other region into one bin; rank binning does not.
    const totals = [0, 3, 5, 8, 12, 15, 400, 900];
    const step = densityScale(totals);
    expect(totals.map((total) => step(total))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });

  it("gives equal totals equal steps", () => {
    const step = densityScale([4, 4, 90]);
    expect(step(90)).toBeGreaterThan(step(4));
    expect(step(4)).toBe(densityScale([4, 4, 90])(4));
  });

  it("puts a region with no animals on the lowest step", () => {
    expect(densityScale([0, 10, 20])(0)).toBe(0);
  });

  it("survives a single live region", () => {
    expect(densityScale([7])(7)).toBe(0);
  });

  it("keeps each step clear of the one before it", () => {
    for (let index = 1; index < DENSITY_STEPS.length; index += 1) {
      expect(DENSITY_STEPS[index] - DENSITY_STEPS[index - 1]).toBeGreaterThan(
        0.07,
      );
    }
  });
});
