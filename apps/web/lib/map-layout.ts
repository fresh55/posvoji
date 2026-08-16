import { cityKey, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "./geo";

export type ShelterPin = {
  value: string;
  label: string;
  city: string;
  at: LatLon;
  count: number;
};

// A town is the unit the map places, not a shelter. Ljubljana and Celje can
// hold several shelters, and giving each its own marker meant either stacking
// them on one pixel or pushing them off the town they name. One marker stays on
// the town and splits into a wedge per shelter, so the position keeps telling
// the truth and a shared town still shows how many it holds. The wedges are a
// picture only: what gets clicked is the town's region, in map-regions.
export type Wedge = ShelterPin & { from: number; to: number };

export type Town = {
  key: string;
  city: string;
  x: number;
  y: number;
  r: number;
  /** Clickable radius, which is larger than the dot the eye sees. */
  hitR: number;
  shelters: Wedge[];
};

const MIN_RADIUS = 3;
const MAX_RADIUS = 9;
// A single dot can shrink to MIN_RADIUS, but wedges cut that area into slices,
// so a shared town needs a floor to stay legible, and the floor has to rise
// with the number of ways it is divided. A marker holding three shelters is
// drawn larger than its count alone would earn, which is the honest signal
// anyway: there is more here than one shelter.
const MULTI_RADIUS_FLOOR = 6;
const MULTI_RADIUS_PER_EXTRA = 2;
const MULTI_RADIUS_CAP = 12;

function sharedFloor(shelters: number): number {
  return Math.min(
    MULTI_RADIUS_FLOOR + (shelters - 2) * MULTI_RADIUS_PER_EXTRA,
    MULTI_RADIUS_CAP,
  );
}

// Clear water between two markers, so touching circles still read as two.
const PIN_GAP = 1.5;
// How far a marker may be pushed off its real town. 7 units is about 5 km on
// the ground: enough to separate Dramlje from Celje, little enough that the
// marker still points at the right place.
const MAX_DRIFT = 7;
const EDGE_MARGIN = 2;
const RELAX_PASSES = 120;
// Markers are targets again. They stopped being targets when the map lived in a
// 209px column, where a dot could not be made big enough; the map only draws at
// dialog width now, where 10 units is about 42px across.
const MAX_HIT_RADIUS = 10;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

// Radius tracks area, not length, or the busiest town swallows the country.
// The denominator is the species tab's own total rather than whatever is
// biggest under the current filters: measured against a moving yardstick, a dot
// changed size when a filter elsewhere in the panel changed, and two dots could
// not be compared across two filter states.
function radius(count: number, busiest: number): number {
  if (busiest <= 0 || count <= 0) return MIN_RADIUS;
  const share = Math.sqrt(Math.min(count, busiest) / busiest);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * share;
}

function slice(shelters: ShelterPin[]): Wedge[] {
  const step = (Math.PI * 2) / shelters.length;
  // Start at twelve o'clock so a two-shelter town splits left and right, which
  // is the split the eye reads fastest.
  const start = -Math.PI / 2;
  return shelters.map((shelter, i) => ({
    ...shelter,
    from: start + i * step,
    to: start + (i + 1) * step,
  }));
}

type Placed = Town & { homeX: number; homeY: number };

// Markers only ever move to stop overlapping, and never further than MAX_DRIFT
// from the town they belong to. A pair too close to separate inside that budget
// keeps a smaller gap rather than lying about where it is.
function leash(town: Placed): void {
  const dx = town.x - town.homeX;
  const dy = town.y - town.homeY;
  const drift = Math.hypot(dx, dy);
  if (drift > MAX_DRIFT) {
    town.x = town.homeX + (dx / drift) * MAX_DRIFT;
    town.y = town.homeY + (dy / drift) * MAX_DRIFT;
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

// A marker's target grows into the empty space around it but never reaches
// inside a neighbour's dot, so every dot stays clickable where it is drawn and
// no marker takes a click meant for the one next to it.
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

// busiest is the largest per-town count the species tab can produce, which is
// fixed for as long as the tab is. Passing the filtered maximum instead is what
// made marker sizes drift between filter states.
export function layoutTowns(pins: ShelterPin[], busiest: number): Town[] {
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
      const count = shelters.reduce((sum, s) => sum + s.count, 0);
      const r =
        shelters.length > 1
          ? Math.max(radius(count, busiest), sharedFloor(shelters.length))
          : radius(count, busiest);
      const { x, y } = project(shelters[0].at);
      return {
        key,
        city: shelters[0].city,
        x,
        y,
        homeX: x,
        homeY: y,
        r,
        hitR: r,
        shelters: slice(shelters),
      };
    });

  relax(towns);
  sizeTargets(towns);

  // Largest first, so a small marker paints on top of a large one rather than
  // disappearing under it.
  return towns
    .sort((a, b) => b.r - a.r)
    .map((town) => ({
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

// Rough advance width per character, as a fraction of the font size. The font
// is not known here, so this runs generous on purpose: a label quietly skipped
// costs less than two labels drawn across each other.
const LABEL_CHAR = 0.52;
const LABEL_GAP = 2;

export type LabelCandidate = {
  key: string;
  text: string;
  size: number;
  x: number;
  /** Baselines to try, in order of preference. */
  ys: number[];
};

export type PlacedLabel = { key: string; x: number; y: number; text: string };

export type Box = { x0: number; y0: number; x1: number; y1: number };

// Markers are obstacles for the labels, not just for each other.
export function markerBoxes(towns: Town[]): Box[] {
  return towns.map((town) => ({
    x0: town.x - town.r,
    y0: town.y - town.r,
    x1: town.x + town.r,
    y1: town.y + town.r,
  }));
}

function overlaps(a: Box, b: Box): boolean {
  return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
}

// The map names the regions, because regions are what it picks. It named the
// towns too, which put seventeen pieces of text on one small country, four of
// them lying across a marker. Candidates are tried in the order given, each
// against the markers and against whatever is already placed, and a name with
// nowhere to go is left off rather than smeared over something.
export function placeLabels(
  candidates: LabelCandidate[],
  obstacles: Box[] = [],
): PlacedLabel[] {
  const taken: Box[] = [...obstacles];
  const placed: PlacedLabel[] = [];

  for (const candidate of candidates) {
    const half = (candidate.text.length * candidate.size * LABEL_CHAR) / 2;
    for (const y of candidate.ys) {
      const box: Box = {
        x0: candidate.x - half - LABEL_GAP,
        x1: candidate.x + half + LABEL_GAP,
        y0: y - candidate.size,
        y1: y + LABEL_GAP,
      };
      const offMap =
        box.x0 < 0 || box.x1 > MAP_WIDTH || box.y0 < 0 || box.y1 > MAP_HEIGHT;
      if (offMap || taken.some((other) => overlaps(box, other))) continue;
      taken.push(box);
      placed.push({ key: candidate.key, x: candidate.x, y, text: candidate.text });
      break;
    }
  }
  return placed;
}

export const REGION_LABEL_SIZE = 5.5;

// Pie slice from the centre, for drawing one shelter's share of a shared town's
// marker. A town with one shelter draws a plain circle instead.
export function wedgePath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
): string {
  const x0 = cx + Math.cos(from) * r;
  const y0 = cy + Math.sin(from) * r;
  const x1 = cx + Math.cos(to) * r;
  const y1 = cy + Math.sin(to) * r;
  const large = to - from > Math.PI ? 1 : 0;
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}
