import { cityKey, MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "./geo";

export type ShelterPin = {
  value: string;
  label: string;
  city: string;
  at: LatLon;
  count: number;
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

// Counts belong in the tooltip and list, not in marker size.
const MARKER_RADIUS = 5.75;
export const MARKER_STROKE_WIDTH = 0.9;

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

// Keep collision adjustment within MAX_DRIFT of the real town.
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
      return {
        key,
        city: shelters[0].city,
        x,
        y,
        homeX: x,
        homeY: y,
        r: MARKER_RADIUS,
        hitR: MARKER_RADIUS,
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

// One source of truth for the visible and accessible town label. A cluster is
// named by its town; a single marker is named by its shelter.
export function townLabel(town: Town): string {
  return town.shelters.length > 1 ? town.city : town.shelters[0].label;
}

// Collision layout protects town.r, so visible marker strokes must stay inside it.
export function markerGeometry(town: Town) {
  const discRadius = town.r - MARKER_STROKE_WIDTH / 2;
  return {
    discRadius,
    clusterOffset: discRadius * 0.33,
    clusterRadius: discRadius * 0.53,
  };
}

export function markerVisualReach(town: Town): number {
  const geometry = markerGeometry(town);
  if (town.shelters.length === 1) {
    return geometry.discRadius + MARKER_STROKE_WIDTH / 2;
  }
  return (
    Math.SQRT2 * geometry.clusterOffset +
    geometry.clusterRadius +
    MARKER_STROKE_WIDTH / 2
  );
}
