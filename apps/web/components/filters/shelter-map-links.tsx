import { project, type LatLon } from "@/lib/geo";
import type { Town } from "@/lib/map-layout";
import {
  calloutType,
  ORIGIN_DASH,
  ORIGIN_REACH,
} from "./map-callout";

// How far outside a marker the spotlight ring sits, in user units. Shared with
// the connector, which stops at the ring rather than crossing it.
export const SPOTLIGHT_RING = 3.5;

// Where the distance line stops short of the coin it measures to. The other
// end stops at ORIGIN_REACH, which is the ring's own outer edge: both marks
// give way to the line rather than being drawn through by it, the same deal
// the municipality connector keeps.
const DISTANCE_END_GAP = 1.2;
// Under this much line there is nowhere to set a label that does not touch the
// ring at one end or the coin at the other, so the line runs bare and the row
// in the list carries the number. In kilometres this is about nineteen, which
// is a distance nobody is surprised by.
const DISTANCE_LABEL_MIN = 24;
const DISTANCE_WIDTH = 0.5;

/** How far the visitor is from the town under the pointer, drawn from the
 *  origin mark's edge to the coin's in the dashes the origin ring wears. The
 *  two marks answer for the same person, so they speak the same line.
 *
 *  Half the connector's width and a step quieter than it: the municipality
 *  line answers a question that was asked out loud, and this one only fills in
 *  a hover. */
export function OriginDistance({
  origin,
  town,
  label,
  scale,
}: {
  origin: LatLon;
  town: Town;
  label: string;
  scale: number;
}) {
  const at = project(origin);
  const dx = town.x - at.x;
  const dy = town.y - at.y;
  const length = Math.hypot(dx, dy);
  const end = town.r + DISTANCE_END_GAP;
  // A shelter in the visitor's own town leaves nothing between the ring and
  // the coin, and a stub drawn through both would say less than nothing.
  if (length <= ORIGIN_REACH + end) return null;
  const x1 = at.x + (dx / length) * ORIGIN_REACH;
  const y1 = at.y + (dy / length) * ORIGIN_REACH;
  const x2 = town.x - (dx / length) * end;
  const y2 = town.y - (dy / length) * end;
  const type = calloutType(scale);
  return (
    <g aria-hidden className="pointer-events-none">
      <line
        data-map-distance
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        strokeWidth={DISTANCE_WIDTH}
        strokeDasharray={ORIGIN_DASH}
        strokeLinecap="round"
        className="stroke-foreground opacity-55"
      />
      {length - ORIGIN_REACH - end >= DISTANCE_LABEL_MIN && (
        <text
          data-map-distance-label
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={type.metadata}
          // A stroke under the fill, not the blurred halo the annotation
          // carries. The line runs straight through this label, and a stroke
          // knocks the dashes out from behind the letterforms where a shadow
          // would only veil them. text-shadow is the tool for HTML in a
          // foreignObject; paint-order is the tool for SVG text.
          stroke="var(--background)"
          strokeWidth={type.halo * 2}
          strokeLinejoin="round"
          className="fill-foreground/70 [paint-order:stroke]"
        >
          {label}
        </text>
      )}
    </g>
  );
}
// Both ends of the connector give way to what they join: it leaves its own dot
// and stops at the ring, so neither mark is drawn through.
const CONNECTOR_START_GAP = 2.4;
const CONNECTOR_END_GAP = 1.5;

// The same dashes the origin ring wears, at the same width, one step quieter.
// A municipality and its shelter are two places the visitor did not pick off
// the map, and the dashed language is what says so.
export function Connector({ from, town }: { from: LatLon; town: Town }) {
  const at = project(from);
  const dx = town.x - at.x;
  const dy = town.y - at.y;
  const length = Math.hypot(dx, dy);
  const end = town.r + SPOTLIGHT_RING + CONNECTOR_END_GAP;
  // A shelter inside its own municipality leaves nothing to draw between the
  // dot and the ring, and a stub through both would say less than nothing.
  if (length <= CONNECTOR_START_GAP + end) return null;
  return (
    <line
      data-map-connector
      x1={at.x + (dx / length) * CONNECTOR_START_GAP}
      y1={at.y + (dy / length) * CONNECTOR_START_GAP}
      x2={town.x - (dx / length) * end}
      y2={town.y - (dy / length) * end}
      strokeWidth={0.9}
      strokeDasharray="2 2"
      strokeLinecap="round"
      className="stroke-foreground opacity-60"
    />
  );
}
