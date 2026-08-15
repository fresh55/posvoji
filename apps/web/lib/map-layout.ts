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
// the truth and every shelter still has its own target.
export type Wedge = ShelterPin & { from: number; to: number };

export type Town = {
  key: string;
  city: string;
  x: number;
  y: number;
  r: number;
  hitR: number;
  shelters: Wedge[];
};

const MIN_RADIUS = 4.5;
const MAX_RADIUS = 12;
// A single dot can shrink to MIN_RADIUS, but wedges cut that area into slices,
// so a shared town needs a floor to stay divisible, and the floor has to rise
// with the number of ways it is divided. A marker holding three shelters is
// drawn larger than its count alone would earn, which is the honest signal
// anyway: there is more here than one shelter.
const MULTI_RADIUS_FLOOR = 8;
const MULTI_RADIUS_PER_EXTRA = 2.5;
const MULTI_RADIUS_CAP = 16;

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
const MAX_HIT_RADIUS = 18;

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

// The tap target is why markers were mis-clicked before: every marker carried a
// fixed 9 unit circle, so a small town's invisible target sat on top of a big
// neighbour's visible dot and took the click. A target may now grow until it
// reaches the edge of the nearest dot, and no further, which is the largest it
// can be while still leaving every dot clickable where it is drawn. Relaxation
// has already left a PIN_GAP between dots, so this is always at least the
// marker's own radius and the floor below never has to bind.
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

  // Largest first, so a small neighbour paints on top and stays clickable.
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

// Pie slice from the centre, used for both the visible wedge and its target.
// A town with one shelter draws a plain circle instead.
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
