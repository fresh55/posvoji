import { REGION_SHAPES } from "@/lib/map-regions";
import type { CalloutRect } from "./map-callout";

// Major regions orient the small country without labelling every narrow shape.
// The others are named on touch/focus by the map's full callout.
const ORIENTATION_REGIONS = new Set([1, 2, 4, 7, 8, 9, 11, 12]);

export function MapRegionNames({ scale, calloutRects }: {
  scale: number;
  calloutRects: CalloutRect[];
}) {
  const fontSize = 10.5 / scale;
  const placed: CalloutRect[] = [];
  const overlaps = (a: CalloutRect, b: CalloutRect) =>
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;

  return (
    <g aria-hidden className="pointer-events-none" data-map-region-names>
      {REGION_SHAPES.filter((region) => ORIENTATION_REGIONS.has(region.id)).map((region) => {
        const lines = region.name.split(/(?<=-)| /);
        const width = Math.max(...lines.map((line) => line.length)) * fontSize * 0.57;
        const box = { x: region.label[0] - width / 2, y: region.label[1] - fontSize,
          width, height: fontSize * lines.length * 1.2 };
        if ([...placed, ...calloutRects].some((other) => overlaps(box, other))) return null;
        placed.push(box);
        return <text key={region.id} data-map-region-label={region.name}
          x={region.label[0]} y={region.label[1]} textAnchor="middle"
          fontSize={fontSize} fontWeight={500} strokeWidth={2.5 / scale}
          paintOrder="stroke" strokeLinejoin="round"
          className="fill-foreground/80 stroke-background">
          {lines.map((line, index) => <tspan key={line} x={region.label[0]}
            dy={index === 0 ? 0 : fontSize * 1.2}>{line}</tspan>)}
        </text>;
      })}
    </g>
  );
}
