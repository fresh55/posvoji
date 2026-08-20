import { cityKey, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "./geo";

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
  r: number;
  /** Clickable radius, which is larger than the house the eye sees. */
  hitR: number;
  shelters: ShelterPin[];
};

// A marker carries its town's animal count in its area, so the radius follows
// the square root of the count. The range is deliberately tight: the biggest
// town holds an order of magnitude more animals than the smallest, and a radius
// range to match would bury half the country under one dot.
const MIN_MARKER_RADIUS = 5;
const MAX_MARKER_RADIUS = 8;
export const MARKER_STROKE_WIDTH = 0.9;

// Density steps for the region fills, as foreground alpha. Spaced so each step
// clears 1.25:1 against its neighbour; the old 14-30% ramp in 4% steps sat at
// 1.09:1, which is no step at all. The legend swatches read the same array, so
// the two cannot drift apart.
export const DENSITY_STEPS = [0.08, 0.18, 0.28, 0.36, 0.45] as const;

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
// room its own radius costs its neighbours, otherwise two towns on the same
// point can never be pushed far enough apart to read as two.
export function driftBudget(radius: number): number {
  return MAX_DRIFT + (radius - MIN_MARKER_RADIUS);
}

// Keep collision adjustment within the drift budget of the real town.
function leash(town: Placed): void {
  const dx = town.x - town.homeX;
  const dy = town.y - town.homeY;
  const drift = Math.hypot(dx, dy);
  const budget = driftBudget(town.r);
  if (drift > budget) {
    town.x = town.homeX + (dx / drift) * budget;
    town.y = town.homeY + (dy / drift) * budget;
  }
  town.x = clamp(town.x, EDGE_MARGIN + town.r, MAP_WIDTH - EDGE_MARGIN - town.r);
  town.y = clamp(
    town.y,
    EDGE_MARGIN + town.r,
    MAP_HEIGHT - EDGE_MARGIN - town.r,
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
        const wanted = a.r + b.r + PIN_GAP;
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

// Grow hit areas only into space not occupied by another marker.
function sizeTargets(towns: Placed[]): void {
  for (const town of towns) {
    let room = MAX_HIT_RADIUS;
    for (const other of towns) {
      if (other === town) continue;
      const reach = Math.hypot(town.x - other.x, town.y - other.y) - other.r;
      room = Math.min(room, reach);
    }
    town.hitR = clamp(room, town.r, MAX_HIT_RADIUS);
  }
}

// Sized before collision layout runs, so relax() protects the radius a town
// actually gets rather than a placeholder.
function markerRadius(total: number, busiest: number): number {
  if (total <= 0 || busiest <= 0) return MIN_MARKER_RADIUS;
  const share = Math.sqrt(total) / Math.sqrt(busiest);
  return MIN_MARKER_RADIUS + (MAX_MARKER_RADIUS - MIN_MARKER_RADIUS) * share;
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

  const totals = new Map(
    [...grouped.entries()].map(([key, together]) => [
      key,
      together.reduce((sum, pin) => sum + pin.count, 0),
    ]),
  );
  const busiest = Math.max(0, ...totals.values());

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
      const r = markerRadius(totals.get(key) ?? 0, busiest);
      return {
        key,
        city: shelters[0].city,
        x,
        y,
        homeX: x,
        homeY: y,
        r,
        hitR: r,
        shelters,
      };
    });

  relax(towns);
  sizeTargets(towns);

  return towns.map((town) => ({
    key: town.key,
    city: town.city,
    x: town.x,
    y: town.y,
    r: town.r,
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

// One source of truth for the visible and accessible town label. A cluster is
// named by its town; a single marker is named by its shelter.
export function townLabel(town: Town): string {
  return town.shelters.length > 1 ? town.city : town.shelters[0].label;
}

// Above this a cluster stops drawing one disc per shelter and draws the number
// instead, because four overlapping coins is a smudge and a lie about which
// shelter is which.
export const MAX_CLUSTER_DISCS = 3;

// Distance from the town centre to a disc centre, and the disc radius, both as
// a share of the whole marker. Each pair sums to just under 1 so the outermost
// stroke stays inside the radius collision layout protects.
const CLUSTER_LAYOUT: Record<number, { offset: number; radius: number }> = {
  2: { offset: 0.46, radius: 0.53 },
  3: { offset: 0.52, radius: 0.47 },
};

// Degrees clockwise from east, in SVG coordinates where y grows downward.
const CLUSTER_ANGLES: Record<number, number[]> = {
  2: [-45, 135],
  3: [-90, 30, 150],
};

// Collision layout protects town.r, so visible marker strokes must stay inside it.
export function markerGeometry(town: Town) {
  const discRadius = town.r - MARKER_STROKE_WIDTH / 2;
  const discs = Math.min(town.shelters.length, MAX_CLUSTER_DISCS);
  const layout = CLUSTER_LAYOUT[discs] ?? CLUSTER_LAYOUT[2];
  return {
    discRadius,
    discs,
    clusterOffset: discRadius * layout.offset,
    clusterRadius: discRadius * layout.radius,
  };
}

// One disc per shelter, in the town's own shelter order, so a disc always
// stands for the same shelter.
export function clusterDiscPositions(town: Town): { x: number; y: number }[] {
  const { discs, clusterOffset } = markerGeometry(town);
  const angles = CLUSTER_ANGLES[discs];
  if (!angles || town.shelters.length > MAX_CLUSTER_DISCS) return [];
  return angles.map((degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return {
      x: town.x + Math.cos(radians) * clusterOffset,
      y: town.y + Math.sin(radians) * clusterOffset,
    };
  });
}

// One click target per shelter, replacing the single hit circle a cluster
// otherwise shares. Wedge boundaries sit on the bisectors between neighbouring
// disc angles, so each wedge contains exactly its own disc's direction and the
// boundary between two shelters falls exactly between their coins.
export function clusterHitWedges(town: Town): { value: string; d: string }[] {
  const count = town.shelters.length;
  const angles = CLUSTER_ANGLES[count];
  if (!angles || count > MAX_CLUSTER_DISCS) return [];

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

// Pixels per map unit at the width the picker draws the map, near enough.
const RENDER_SCALE = 2;
// A lucide paw under nine pixels across is a smudge. A plain disc is better.
const MIN_GLYPH_DIAMETER = 9;

export function discFitsGlyph(radius: number): boolean {
  return radius * 2 * RENDER_SCALE >= MIN_GLYPH_DIAMETER;
}

export function markerVisualReach(town: Town): number {
  const geometry = markerGeometry(town);
  if (town.shelters.length === 1 || town.shelters.length > MAX_CLUSTER_DISCS) {
    return geometry.discRadius + MARKER_STROKE_WIDTH / 2;
  }
  return (
    geometry.clusterOffset + geometry.clusterRadius + MARKER_STROKE_WIDTH / 2
  );
}
