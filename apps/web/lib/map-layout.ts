import { cityKey, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "./geo";
import { REGION_SHAPES, regionAt, type RegionShape } from "./map-regions";

export type ShelterPin = {
  value: string;
  label: string;
  city: string;
  at: LatLon;
  count: number;
  /** False for registry shelters with nothing on the site yet: drawn and
   *  named on hover, but never picked. Absent means selectable. */
  selectable?: boolean;
};

// Shelters in one town share a marker; distinct towns stay separate.
export type Town = {
  key: string;
  city: string;
  x: number;
  y: number;
  /** The coin's own radius: what the eye reads the town's size off. */
  r: number;
  /** Everything the marker draws, coin and satellites together, as one radius
   *  around the town's centre. Collision layout keeps two markers this far
   *  apart rather than r apart, because a dominated town hangs small discs
   *  outside its coin and those must not land on a neighbouring town. Equal to
   *  r for every marker that draws nothing outside its coin, which is all of
   *  them but the satellite ones. */
  reach: number;
  /** Clickable radius, which is larger than the house the eye sees. */
  hitR: number;
  shelters: ShelterPin[];
};

// A marker carries its town's animal count in its size, in three bins rather
// than on a curve. Three sizes are three sizes the eye can name; the square
// root ramp it replaces spent most of its range on the one town that holds a
// third of the country and left the rest within half a unit of each other.
//
// The steps were 5, 5.75, 6.5, and at the size the picker actually draws the
// map they did not read as three sizes at all. A 15% and a 13% step in radius
// is a 1.32x and a 1.28x step in area, and area is what the eye compares
// between two discs. Worse, the markers being compared are never adjacent:
// Koper and Maribor sit at opposite ends of the country, so the judgement is
// made from memory rather than side by side, which needs a wider gap again.
//
// These steps hold about 1.5x in area between neighbours, which is the point
// where a remembered disc reads as bigger rather than as maybe bigger:
// (5.8/4.7)^2 = 1.52 and (7.2/5.8)^2 = 1.54. In diameter that is 23% and 24%
// per step against the 15% and 13% before. The floor is 4.7 and not lower
// because an evenly split two-shelter town in the smallest bin draws discs of
// (4.7 - MARKER_STROKE_WIDTH / 2) * 0.53 = 2.25 units, which is exactly the
// radius discFitsGlyph needs to keep the paw in them; below it the small
// clusters silently lose their glyph. A lopsided town's smaller disc does fall
// under that line and drops its paw, which is the point of sizing discs by
// count, but the even split may not.
const MARKER_RADIUS_STEPS = [4.7, 5.8, 7.2] as const;
const MIN_MARKER_RADIUS = MARKER_RADIUS_STEPS[0];

// Where the bins cut. Town totals in the live roster run 13 15 18 19 23 23 38
// 46 50 72 186, so 20 and 50 split it four small, four medium, three large.
// Absolute and not a share of the busiest town, so a marker does not change
// size when a neighbour's shelter empties out.
const MARKER_COUNT_CUTOFFS = [20, 50] as const;

export const MARKER_STROKE_WIDTH = 0.9;

// Density steps for the region fills, as alpha on --map-density-fill. The
// legend swatches read the same array, so the two cannot drift apart, and the
// hue lives in the token rather than here, so a theme can move the colour
// without touching the ranking.
//
// Higher alphas than the grey ramp they replace, because the ink is now a
// muted green rather than near-black foreground: at the old 12-45% the whole
// country washed out. At 20-58% the light theme's steps clear 1.12 to 1.20
// against each other in luminance and gain chroma as they climb, which is the
// second axis the grey ramp did not have.
//
// The floor is 20% because an inert region fills at 4% neutral foreground over
// the same ground, and the boundary between "no shelters here" and "the
// quietest region in the country" has to be a step of the ramp. At 20% it
// clears 1.20:1, matching the ramp's own smallest step. The top is capped at
// 58%, which composites lighter than the grey ramp's darkest step by a wide
// margin: the region border and the white marker discs stay readable on the
// busiest region, and the top step stays quieter than the selected green.
export const DENSITY_STEPS = [0.2, 0.28, 0.37, 0.47, 0.58] as const;

// Rank binning, not fixed count thresholds. Two shelters hold most of the
// animals in the country, so cutoffs at 10/25/50/100 dropped every other region
// into the same bin. Regions with equal totals get equal steps, and a region
// with no animals but a selected shelter lands on the lowest step by having the
// lowest total.
export function densityScale(totals: number[]): (total: number) => number {
  const unique = [...new Set(totals)].sort((a, b) => a - b);
  const span = DENSITY_STEPS.length - 1;
  return (total) => {
    const rank = unique.indexOf(total);
    if (rank < 0 || unique.length < 2) return 0;
    return Math.round((rank * span) / (unique.length - 1));
  };
}

// What one region answers with: the shelters a click there would toggle, the
// animals it holds, whether it is worth a click at all, and where its
// selection stands. Shared by ShelterMap and MiniMap, so the trigger's tiny
// preview and the dialog's real map are never computed two different ways.
export type RegionStats = {
  values: string[];
  animals: number;
  live: boolean;
  state: boolean | "mixed";
  /** Index into DENSITY_STEPS, by rank among the live regions. */
  density: number;
};

export function getRegionStats(
  towns: Town[],
  selected: string[],
): Omit<RegionStats, "density"> {
  // Only what a click may toggle. Off-site shelters are on the map but not in
  // the region's values, so a region pick never selects a shelter with
  // nothing to show, and a region holding only those stays inert.
  const values = towns.flatMap(townSelectableValues);
  const animals = towns.reduce((sum, town) => sum + townCount(town), 0);
  return {
    values,
    animals,
    live:
      values.length > 0 &&
      (animals > 0 || values.some((value) => selected.includes(value))),
    state: selectionState(values, selected),
  };
}

/** Towns bucketed into the region each one really sits in, plus the reverse
 *  lookup. Real coordinates and not the laid-out marker position, because
 *  collision layout may nudge a marker across a region border. */
export function groupTownsByRegion(towns: Town[]): {
  byRegion: Map<number, Town[]>;
  regionIdByTownKey: Map<string, number>;
} {
  const byRegion = new Map<number, Town[]>();
  const regionIdByTownKey = new Map<string, number>();
  for (const town of towns) {
    const region = regionAt(project(town.shelters[0].at));
    if (!region) continue;
    byRegion.set(region.id, [...(byRegion.get(region.id) ?? []), town]);
    regionIdByTownKey.set(town.key, region.id);
  }
  return { byRegion, regionIdByTownKey };
}

// Every region's stats, densities ranked over the live ones. Takes the
// grouping rather than the town list, so a caller that already grouped its
// towns (ShelterMap keeps the grouping for its own hover lookups) does not
// pay for a second pass.
export function regionStatsByRegion(
  byRegion: Map<number, Town[]>,
  selected: string[],
): { region: RegionShape; stats: RegionStats }[] {
  const counted = REGION_SHAPES.map((region) => ({
    region,
    stats: getRegionStats(byRegion.get(region.id) ?? [], selected),
  }));
  const step = densityScale(
    counted.filter(({ stats }) => stats.live).map(({ stats }) => stats.animals),
  );
  return counted.map(({ region, stats }) => ({
    region,
    stats: { ...stats, density: step(stats.animals) },
  }));
}

// The whole pipeline from pins to ranked region stats, for a caller with no
// grouping of its own: MiniMap, and the two legend helpers below.
export function regionDensities(
  pins: ShelterPin[],
  selected: string[],
): { region: RegionShape; stats: RegionStats }[] {
  const { byRegion } = groupTownsByRegion(layoutTowns(pins));
  return regionStatsByRegion(byRegion, selected);
}

// Clear water between two markers, so touching circles still read as two.
const PIN_GAP = 1.5;
// Seven map units is roughly 5 km: enough to separate close towns without
// misplacing them.
const MAX_DRIFT = 7;
const EDGE_MARGIN = 2;
const RELAX_PASSES = 120;
const MAX_HIT_RADIUS = 10;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

type Placed = Town & { homeX: number; homeY: number };

// How far a marker may be nudged off its town. A larger marker gets the extra
// room its own footprint costs its neighbours, otherwise two towns on the same
// point can never be pushed far enough apart to read as two. Fed town.reach
// and not town.r, so a marker that hangs satellites off its coin pays for the
// whole composite rather than for the coin alone.
export function driftBudget(radius: number): number {
  return MAX_DRIFT + (radius - MIN_MARKER_RADIUS);
}

// Keep collision adjustment within the drift budget of the real town. Every
// bound here is the composite reach: the edge margin has to hold a satellite
// off the frame the same way it holds a coin off it.
function leash(town: Placed): void {
  const dx = town.x - town.homeX;
  const dy = town.y - town.homeY;
  const drift = Math.hypot(dx, dy);
  const budget = driftBudget(town.reach);
  if (drift > budget) {
    town.x = town.homeX + (dx / drift) * budget;
    town.y = town.homeY + (dy / drift) * budget;
  }
  town.x = clamp(
    town.x,
    EDGE_MARGIN + town.reach,
    MAP_WIDTH - EDGE_MARGIN - town.reach,
  );
  town.y = clamp(
    town.y,
    EDGE_MARGIN + town.reach,
    MAP_HEIGHT - EDGE_MARGIN - town.reach,
  );
}

function relax(towns: Placed[]): void {
  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let moved = false;
    for (let i = 0; i < towns.length; i += 1) {
      for (let j = i + 1; j < towns.length; j += 1) {
        const a = towns[i];
        const b = towns[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let gap = Math.hypot(dx, dy);
        const wanted = a.reach + b.reach + PIN_GAP;
        if (gap >= wanted) continue;
        // Two towns on the same pixel have no axis to separate along. Split
        // them horizontally by index so the layout stays deterministic.
        if (gap < 1e-6) {
          dx = 1;
          dy = 0;
          gap = 1e-6;
        }
        const push = (wanted - gap) / 2;
        a.x -= (dx / gap) * push;
        a.y -= (dy / gap) * push;
        b.x += (dx / gap) * push;
        b.y += (dy / gap) * push;
        moved = true;
      }
    }
    for (const town of towns) leash(town);
    if (!moved) break;
  }
}

// Grow hit areas only into space not occupied by another marker. Measured
// against the other marker's composite reach, so a target never reaches over a
// neighbour's satellite either.
//
// The cap lifts for a marker whose own composite is larger than it: a target
// smaller than the ink it stands for would leave the outer edge of a satellite
// answering for nothing.
function sizeTargets(towns: Placed[]): void {
  for (const town of towns) {
    const cap = Math.max(MAX_HIT_RADIUS, town.reach);
    let room = cap;
    for (const other of towns) {
      if (other === town) continue;
      const gap = Math.hypot(town.x - other.x, town.y - other.y) - other.reach;
      room = Math.min(room, gap);
    }
    town.hitR = clamp(room, town.reach, cap);
  }
}

// Sized before collision layout runs, so relax() protects the radius a town
// actually gets rather than a placeholder.
export function markerRadius(total: number): number {
  const bin = MARKER_COUNT_CUTOFFS.filter((cutoff) => total >= cutoff).length;
  return MARKER_RADIUS_STEPS[bin];
}

// The count the coin is sized by, which is the town's total everywhere except
// in a dominated town, where the coin belongs to the dominant shelter alone
// and is sized by that shelter's own animals. Its companions ride outside the
// coin as satellites and carry their own counts there, so adding them into the
// coin would size it for animals it does not draw.
function coinCount(shelters: ShelterPin[]): number {
  const dominant = dominantShelterIndex(shelters);
  if (dominant >= 0) return shelters[dominant].count;
  return shelters.reduce((sum, shelter) => sum + Math.max(shelter.count, 0), 0);
}

export function layoutTowns(pins: ShelterPin[]): Town[] {
  // Grouped by town name, not by coordinate. Two shelters in Ljubljana share a
  // marker; two different towns that round to the same point stay two markers
  // and get separated below, rather than silently merging under one name.
  const grouped = new Map<string, ShelterPin[]>();
  for (const pin of pins) {
    const key = cityKey(pin.city);
    grouped.set(key, [...(grouped.get(key) ?? []), pin]);
  }

  // Sorted by town and by shelter name, never by the order the rows arrived in.
  // The list above this reorders itself by distance once a location arrives,
  // and inheriting that order made the wedges of a shared town swap places
  // under the user's cursor.
  const towns: Placed[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, together]) => {
      const shelters = [...together].sort((a, b) =>
        a.label.localeCompare(b.label, "sl"),
      );
      const { x, y } = project(shelters[0].at);
      const r = markerRadius(coinCount(shelters));
      const town: Placed = {
        key,
        city: shelters[0].city,
        x,
        y,
        homeX: x,
        homeY: y,
        r,
        reach: r,
        hitR: r,
        shelters,
      };
      // Sized here and not after collision layout, because the reach is what
      // collision layout separates by. Never under the coin: a marker that
      // draws nothing outside its coin has to keep protecting exactly the
      // radius it always protected, so the whole country lays out unchanged
      // except where a satellite actually appears.
      town.reach = Math.max(r, markerVisualReach(town));
      return town;
    });

  relax(towns);
  sizeTargets(towns);

  return towns.map((town) => ({
    key: town.key,
    city: town.city,
    x: town.x,
    y: town.y,
    r: town.r,
    reach: town.reach,
    hitR: town.hitR,
    shelters: town.shelters,
  }));
}

export function townCount(town: Town): number {
  return town.shelters.reduce((sum, shelter) => sum + shelter.count, 0);
}

// The values a click on this town may toggle. Off-site shelters share the
// marker but never the pick.
export function townSelectableValues(town: Town): string[] {
  return town.shelters
    .filter((shelter) => shelter.selectable !== false)
    .map((shelter) => shelter.value);
}

// Shared by the region and marker components, so a shelter reads the same
// selection state (all picked, some picked, none picked) wherever it appears.
export function selectionState(
  values: string[],
  selected: string[],
): boolean | "mixed" {
  const selectedCount = values.filter((value) =>
    selected.includes(value),
  ).length;
  if (selectedCount === 0) return false;
  return selectedCount === values.length ? true : "mixed";
}

// Whether a town's marker is a control or only a place: it needs something a
// click may toggle, and either an animal listed or a pick already made. Shared
// by the marker, which draws the hollow "nothing listed" disc off it, and by
// the legend helper, which decides from the same answer whether that shape is
// on the map at all.
export function townIsLive(town: Town, selected: string[]): boolean {
  const values = townSelectableValues(town);
  return (
    values.length > 0 &&
    (townCount(town) > 0 || selectionState(values, selected) !== false)
  );
}

// One source of truth for the visible and accessible town label. A cluster is
// named by its town; a single marker is named by its shelter.
export function townLabel(town: Town): string {
  return town.shelters.length > 1 ? town.city : town.shelters[0].label;
}

// Above this a cluster stops drawing one disc per shelter and draws the number
// instead, because four overlapping coins is a smudge and a lie about which
// shelter is which.
export const MAX_CLUSTER_DISCS = 3;

// Every disc in a cluster is tangent from inside to this share of the marker,
// whatever its radius, so the outermost stroke stays inside the radius
// collision layout protects and the cluster's reach never depends on how the
// coin is divided.
const CLUSTER_RIM = 0.99;

// The radius a disc takes when every shelter in the town holds the same count,
// as a share of the marker. These two numbers, with the rim above, are exactly
// the offset and radius pairs the cluster drew before discs carried a count
// (0.46 + 0.53 and 0.52 + 0.47), so an equal-count cluster still draws what it
// always drew.
const CLUSTER_UNIFORM_RADIUS: Record<number, number> = {
  2: 0.53,
  3: 0.47,
};

// Degrees clockwise from east, in SVG coordinates where y grows downward.
const CLUSTER_ANGLES: Record<number, number[]> = {
  2: [-45, 135],
  3: [-90, 30, 150],
};

// The largest disc in a coin may be at most this many times the radius, so the
// square of it in area, of the smallest counted one.
//
// This and SATELLITE_DOMINANCE are one line seen twice. A coin is only split
// while no shelter holds four times another, and sqrt sizing turns four times
// the animals into exactly twice the radius, so inside a coin the cap can now
// only ever tie: it binds at the boundary and never past it, because past it
// the town is not a split coin at all. It stays because the two numbers have
// to move together. Raise the dominance line without raising this and the
// discs start lying again; the pair at 4 and 2 is what keeps the split honest
// over its whole range.
const MAX_DISC_RADIUS_RATIO = 2;

// How deep two discs of one cluster may sit in each other, as a share of the
// marker. Nobody chose this number: it is measured off the equal-count layout,
// which has always overlapped a little, so unequal discs are allowed to look
// as tight as the uniform ones and no tighter. Two opposite discs at 0.53 with
// centres 0.92 apart share 0.14 of the marker; three at 0.47 share 0.04.
function uniformOverlap(discs: number): number {
  const radius = CLUSTER_UNIFORM_RADIUS[discs];
  const angles = CLUSTER_ANGLES[discs];
  const separation = ((angles[1] - angles[0]) * Math.PI) / 180;
  return 2 * radius - 2 * (CLUSTER_RIM - radius) * Math.sin(separation / 2);
}

// The coin, from the radius the town was sized at. Collision layout protects
// town.reach, which is this plus whatever a dominated town hangs outside it,
// so every stroke drawn from here stays inside the space the marker owns.
export function markerGeometry(town: Town) {
  const discRadius = town.r - MARKER_STROKE_WIDTH / 2;
  const discs = Math.min(town.shelters.length, MAX_CLUSTER_DISCS);
  const uniform = CLUSTER_UNIFORM_RADIUS[discs] ?? CLUSTER_UNIFORM_RADIUS[2];
  return {
    discRadius,
    discs,
    /** What each disc measures when the shelters hold equal counts. The radius
     *  a disc actually draws at comes from clusterDiscs. */
    clusterRadius: discRadius * uniform,
    /** The circle every cluster disc touches from inside. */
    clusterReach: discRadius * CLUSTER_RIM,
  };
}

export type ClusterDisc = {
  value: string;
  x: number;
  y: number;
  r: number;
};

// Radii for one cluster, as shares of the marker's disc radius, in shelter
// order and before the packing scale below.
//
// A split coin is sized by its town's total, so within the coin the discs have
// to order by their own counts, or the map says a busy shelter is smaller than
// a quiet one two towns over. Area is what the eye reads a disc by, so a
// shelter's radius goes by the square root of its count.
//
// The split only ever runs on a town no shelter dominates. Once one holds four
// times another the coin stops being divided at all and the town lays out as a
// coin plus satellites, so the widest split reaching this function is 4:1 in
// count and 2:1 in radius. The lopsided cases that used to arrive here, Celje's
// 186 beside 11 among them, no longer do.
//
// A zero-count shelter draws the hollow "nothing listed" mark, which carries
// no count and so takes no part in the division: it keeps the uniform slot and
// the counted discs share what is left. A zero beside a single busy shelter is
// a dominated town and leaves by the satellite path; what still arrives here is
// a zero beside two shelters close enough to keep sharing a coin. The budget is
// the sum of the uniform radii either way, so a cluster keeps the ink and the
// span it had before; only the division changes.
function clusterRadiusShares(town: Town, discs: number): number[] {
  const uniform = CLUSTER_UNIFORM_RADIUS[discs];
  const counts = town.shelters.map((shelter) => Math.max(shelter.count, 0));
  const counted = counts.filter((count) => count > 0).length;
  if (counted === 0) return counts.map(() => uniform);

  const weights = counts.map((count) => (count > 0 ? Math.sqrt(count) : 0));
  const largest = Math.max(...weights);
  const capped = weights.map((weight) =>
    weight > 0 ? Math.max(weight, largest / MAX_DISC_RADIUS_RATIO) : 0,
  );
  const total = capped.reduce((sum, weight) => sum + weight, 0);
  const budget = counted * uniform;
  return capped.map((weight) =>
    weight > 0 ? (weight / total) * budget : uniform,
  );
}

// Unequal discs pack differently. Each disc stays tangent to the rim, so a
// larger one sits nearer the town centre, which walks it into its neighbours.
// Two opposite discs are safe at any split: their centres separate by exactly
// what their radii gain. Three at 120 degrees are not, so the whole allocation
// shrinks until no pair sits deeper in another than the uniform layout does.
// Equal counts pass at 1 and draw exactly what they drew before; the worst
// split the cap allows costs a three-disc cluster about a tenth of its radius.
function clusterFitScale(
  shares: number[],
  angles: number[],
  overlap: number,
): number {
  const fits = (scale: number): boolean => {
    for (let i = 0; i < shares.length; i += 1) {
      for (let j = i + 1; j < shares.length; j += 1) {
        const ri = shares[i] * scale;
        const rj = shares[j] * scale;
        const oi = CLUSTER_RIM - ri;
        const oj = CLUSTER_RIM - rj;
        const between = ((angles[i] - angles[j]) * Math.PI) / 180;
        const centres = Math.sqrt(
          Math.max(oi * oi + oj * oj - 2 * oi * oj * Math.cos(between), 0),
        );
        if (centres + overlap < ri + rj - 1e-9) return false;
      }
    }
    return true;
  };

  if (fits(1)) return 1;
  // Slack falls as the scale grows, so bisection lands on the largest scale
  // that still fits.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

// One disc per shelter, in the town's own shelter order, so a disc always
// stands for the same shelter, sized by that shelter's own count.
export function clusterDiscs(town: Town): ClusterDisc[] {
  const { discs, discRadius } = markerGeometry(town);
  const angles = CLUSTER_ANGLES[discs];
  if (
    !angles ||
    town.shelters.length < 2 ||
    town.shelters.length > MAX_CLUSTER_DISCS ||
    // A dominated town does not divide its coin. See satelliteDiscs.
    dominantShelterIndex(town.shelters) >= 0
  ) {
    return [];
  }

  const shares = clusterRadiusShares(town, discs);
  const scale = clusterFitScale(shares, angles, uniformOverlap(discs));

  return town.shelters.map((shelter, index) => {
    const share = shares[index] * scale;
    const offset = (CLUSTER_RIM - share) * discRadius;
    const radians = (angles[index] * Math.PI) / 180;
    return {
      value: shelter.value,
      x: town.x + Math.cos(radians) * offset,
      y: town.y + Math.sin(radians) * offset,
      r: share * discRadius,
    };
  });
}

// One click target per shelter, replacing the single hit circle a cluster
// otherwise shares. Wedge boundaries sit on the bisectors between neighbouring
// disc angles, so each wedge contains exactly its own disc's direction and the
// boundary between two shelters falls exactly between their coins.
//
// A wedge answers for direction, not for the disc body: a large disc reaches
// past the town centre into its neighbour's wedge. The marker paints a hit
// circle per disc on top of these, in the order the discs are drawn, so the
// disc under the pointer is the one that answers.
export function clusterHitWedges(town: Town): { value: string; d: string }[] {
  const count = town.shelters.length;
  const angles = CLUSTER_ANGLES[count];
  // A dominated town has no wedges to cut: its marks sit at known places
  // rather than in known directions, so satelliteHitCircles answers instead.
  if (!angles || count > MAX_CLUSTER_DISCS) return [];
  if (dominantShelterIndex(town.shelters) >= 0) return [];

  // bisectors[k] is the boundary between disc k and disc k+1 (wrapping).
  const bisectors = angles.map((angle, index) => {
    const next = angles[(index + 1) % angles.length];
    const nextUnwrapped = next <= angle ? next + 360 : next;
    return (angle + nextUnwrapped) / 2;
  });

  const round = (value: number) => Math.round(value * 100) / 100;
  const pointAt = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: town.x + Math.cos(radians) * town.hitR,
      y: town.y + Math.sin(radians) * town.hitR,
    };
  };

  return town.shelters.map((shelter, index) => {
    const start = bisectors[(index - 1 + bisectors.length) % bisectors.length];
    const endRaw = bisectors[index];
    const end = endRaw <= start ? endRaw + 360 : endRaw;
    const mid = (start + end) / 2;
    const startPoint = pointAt(start);
    const midPoint = pointAt(mid);
    const endPoint = pointAt(end);
    const r = round(town.hitR);
    // Every wedge here spans 180 or 120 degrees, never more, so splitting it
    // into two halves at the midpoint keeps large-arc-flag 0 in one code path
    // instead of branching between the 180-degree case and the rest.
    const d = [
      `M ${round(town.x)} ${round(town.y)}`,
      `L ${round(startPoint.x)} ${round(startPoint.y)}`,
      `A ${r} ${r} 0 0 1 ${round(midPoint.x)} ${round(midPoint.y)}`,
      `A ${r} ${r} 0 0 1 ${round(endPoint.x)} ${round(endPoint.y)}`,
      "Z",
    ].join(" ");
    return { value: shelter.value, d };
  });
}

// Pixels per map unit the picker dialog draws at, measured 2026-08: 2.7 at a
// 1440x900 viewport, 3.1 at 1920x1080, about 2.3 at 1280x800, all limited by
// the dialog's md:h-[min(88dvh,56rem)]. 2 is a deliberate floor under that
// band, so a disc that passes here is a little larger on screen than the
// check demands.
//
// Below roughly 1100px of viewport the map is width-limited and the scale
// falls, reaching 1.04 at the 768px md floor where markers first appear. No
// per-disc threshold helps there: at 1.04 even the largest single marker's
// paw renders under 9px, so the whole map is small together rather than some
// discs being wrong. Phones never draw markers at all. The /dev/map gallery
// renders around 1.25 and understates every marker; do not measure there.
const RENDER_SCALE = 2;
// A lucide paw under nine pixels across is a smudge. A plain disc is better.
// Compared against the disc diameter; the paw inside is drawn at 1.15x the
// disc radius on singles and 1.3x on cluster discs.
const MIN_GLYPH_DIAMETER = 9;

export function discFitsGlyph(radius: number): boolean {
  return radius * 2 * RENDER_SCALE >= MIN_GLYPH_DIAMETER;
}

export function markerVisualReach(town: Town): number {
  const geometry = markerGeometry(town);
  const coin = geometry.discRadius + MARKER_STROKE_WIDTH / 2;
  const satellites = satelliteDiscs(town);
  if (satellites.length > 0) {
    return Math.max(
      coin,
      ...satellites.map(
        (disc) =>
          Math.hypot(disc.x - town.x, disc.y - town.y) +
          disc.r +
          MARKER_STROKE_WIDTH / 2,
      ),
    );
  }
  if (town.shelters.length === 1 || town.shelters.length > MAX_CLUSTER_DISCS) {
    return coin;
  }
  return geometry.clusterReach + MARKER_STROKE_WIDTH / 2;
}

// --- Satellites: the layout a town gets when one shelter dominates it ---
//
// Splitting a coin between shelters is honest inside the coin and dishonest
// across the country. Mačja hiša in Celje holds 186 animals, more than any
// other shelter in Slovenia, and drew a 4.8-unit disc inside a shared coin
// while Horjul, with 72 and nobody to share with, drew a full 7.2. The map's
// one rule, bigger circle means more animals, broke on the biggest shelter it
// has, because the shelter's size budget was trapped inside a coin sized for
// the town.
//
// So a dominated town stops sharing. The dominant shelter takes the whole coin
// at its own count's bin, exactly as if it stood alone in its town, and the
// others hang off the rim as satellites carrying their own counts. Nothing
// about the coin then depends on who else is in town.
//
// The threshold: the dominant shelter holds at least four times every other
// shelter's animals. Four because that is where the split saturates anyway
// (see MAX_DISC_RADIUS_RATIO), so no town changes layout at a point where the
// old one was still saying something. A town under the line keeps the split
// coin, unchanged.

// See above. Ties fail it: two shelters holding the same is the plainest case
// of a town nobody dominates.
const SATELLITE_DOMINANCE = 4;

// A satellite is a companion, not a second town. The band runs from 2.2, which
// is where the hollow "nothing listed" mark draws on a lone marker, to 2.8,
// which is well under two thirds of the smallest coin the map ever draws
// (4.7): no satellite can be misread as a town of its own, and the largest is
// only 1.6 times the area of the smallest, so the band whispers the count
// rather than announcing it. The callout is where a satellite's number is
// actually said.
const SATELLITE_RADIUS_MIN = 2.2;
const SATELLITE_RADIUS_MAX = 2.8;

// How far a satellite sits inside the coin's rim, as a share of its own
// radius. Not tangent: two circles that merely touch read as two marks that
// happen to meet, and a third of the way in reads as one attached to the
// other. Small enough that the satellite keeps its own outline all the way
// round, which is what still lets it carry a fill of its own.
const SATELLITE_BITE = 0.35;

// Degrees clockwise from east in SVG coordinates, where y grows downward, so
// 45 is southeast. Southeast because the plate's own type crowds the other
// quadrants: the city anchors run east at marker height and the neighbour
// names sit along the top and the left, and a mark below the coin reads as
// hanging off it rather than as the next town along.
//
// Fixed bearings rather than bearings solved against the neighbours. Collision
// layout already keeps two markers apart by their whole composite reach, so a
// satellite cannot land on another town whatever direction it takes; solving
// per town would buy nothing and would move a marker whenever a shelter two
// towns away emptied out. Two satellites sit 65 degrees apart, which clears
// their radii at every coin size the map draws.
const SATELLITE_ANGLES: Record<number, number[]> = {
  1: [45],
  2: [15, 80],
};

/** Which shelter dominates this town, or -1 when none does and the coin is
 *  split between them as before. A town outside the drawn cluster sizes (one
 *  shelter, or more than MAX_CLUSTER_DISCS) never dominates: one shelter is
 *  already a whole coin, and past three the marker says the number instead. */
export function dominantShelterIndex(shelters: ShelterPin[]): number {
  if (shelters.length < 2 || shelters.length > MAX_CLUSTER_DISCS) return -1;
  const counts = shelters.map((shelter) => Math.max(shelter.count, 0));
  let top = 0;
  for (let index = 1; index < counts.length; index += 1) {
    if (counts[index] > counts[top]) top = index;
  }
  // A town where nothing is listed anywhere has no dominant shelter to promote
  // and keeps the even split, which is the layout that says "two shelters, no
  // animals" rather than "one shelter and a tag-along".
  if (counts[top] <= 0) return -1;
  for (let index = 0; index < counts.length; index += 1) {
    if (index === top) continue;
    if (counts[top] < counts[index] * SATELLITE_DOMINANCE) return -1;
  }
  return top;
}

// A satellite's own count against the shelter it orbits. The ratio can never
// exceed 1 / SATELLITE_DOMINANCE, or the town would not be dominated, so the
// share is normalised against that: a satellite sitting exactly on the
// threshold draws the top of the band and one with nothing listed draws the
// floor. Square root for the same reason the discs use it, area being what the
// eye compares, though over a band this narrow it is a formality.
function satelliteRadius(count: number, dominant: number): number {
  const share =
    dominant > 0
      ? clamp(Math.sqrt((Math.max(count, 0) * SATELLITE_DOMINANCE) / dominant), 0, 1)
      : 0;
  return (
    SATELLITE_RADIUS_MIN + (SATELLITE_RADIUS_MAX - SATELLITE_RADIUS_MIN) * share
  );
}

/** The satellites a dominated town hangs off its coin, in the town's own
 *  shelter order with the dominant shelter left out. Empty for every other
 *  town, which is what tells the marker and the collision layout apart from
 *  each other: satellites here means clusterDiscs is empty and the reverse.
 *
 *  Crossing the threshold is a change of layout mode, not of size, so a town
 *  that crosses it when the species tabs change the counts re-arranges at
 *  once rather than morphing. The mode is discrete and there is no halfway
 *  picture between a shared coin and a coin with a companion. Radii and
 *  positions inside one mode do ride MAP_MORPH like everything else. */
export function satelliteDiscs(town: Town): ClusterDisc[] {
  const dominant = dominantShelterIndex(town.shelters);
  if (dominant < 0) return [];
  const others = town.shelters.filter((_, index) => index !== dominant);
  const angles = SATELLITE_ANGLES[others.length];
  if (!angles) return [];

  const { discRadius } = markerGeometry(town);
  const top = town.shelters[dominant].count;
  return others.map((shelter, slot) => {
    const r = satelliteRadius(shelter.count, top);
    const offset = discRadius + r * (1 - SATELLITE_BITE);
    const radians = (angles[slot] * Math.PI) / 180;
    return {
      value: shelter.value,
      x: town.x + Math.cos(radians) * offset,
      y: town.y + Math.sin(radians) * offset,
      r,
    };
  });
}

/** One transparent hit circle per mark in a dominated town, in painting order:
 *  the dominant shelter takes the town's whole target, and each satellite
 *  covers itself on top of it.
 *
 *  A cluster divides its target into wedges because its discs differ only in
 *  direction from the centre. Here they differ in place: the coin is the town's
 *  mark and the satellites are small things stuck to its edge, so giving a
 *  satellite a whole wedge would hand it a sector of empty country it does not
 *  stand on. The dominant shelter holds at least two thirds of the town, so
 *  everything the satellites do not cover answering for it is the honest
 *  reading of a pointer near this marker. */
export function satelliteHitCircles(town: Town): ClusterDisc[] {
  const satellites = satelliteDiscs(town);
  if (satellites.length === 0) return [];
  const dominant = town.shelters[dominantShelterIndex(town.shelters)];
  return [
    { value: dominant.value, x: town.x, y: town.y, r: town.hitR },
    ...satellites.map((disc) => ({
      ...disc,
      r: disc.r + MARKER_STROKE_WIDTH / 2,
    })),
  ];
}
