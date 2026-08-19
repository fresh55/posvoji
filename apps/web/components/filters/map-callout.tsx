"use client";

import { MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "@/lib/geo";
import { cn } from "@/lib/utils";

// One card for markers and regions alike. A native <title> waited half a second
// and came in the browser's own colours.
export function MapCallout({
  x,
  y,
  reach,
  title,
  metadata,
}: {
  x: number;
  y: number;
  reach: number;
  title: string;
  metadata: string;
}) {
  const width = 108;
  const height = 38;
  const onRight = x + reach + 4 + width <= MAP_WIDTH - 2;
  const left = onRight ? x + reach + 4 : x - reach - 4 - width;
  const cardX = Math.min(Math.max(left, 2), MAP_WIDTH - width - 2);
  const cardY = Math.min(
    Math.max(y - height / 2, 2),
    MAP_HEIGHT - height - 2,
  );

  return (
    <foreignObject
      x={cardX}
      y={cardY}
      width={width}
      height={height}
      aria-hidden
      className={cn(
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      <div className="flex h-full flex-col justify-center rounded-ui border border-border bg-popover px-[4px] py-[2px] text-popover-foreground shadow-sm">
        <span className="w-full break-words text-[5.5px] font-medium leading-[1.15]">
          {title}
        </span>
        <span className="mt-[1.5px] w-full break-words text-[4.75px] leading-[1.15] text-muted-foreground">
          {metadata}
        </span>
      </div>
    </foreignObject>
  );
}

// Dashed, so it reads as "you" rather than as one more shelter.
export function Origin({ at }: { at: LatLon }) {
  const { x, y } = project(at);
  return (
    <g aria-hidden className="pointer-events-none">
      <circle
        cx={x}
        cy={y}
        r={5}
        strokeWidth={1}
        strokeDasharray="2 2"
        className="fill-none stroke-foreground opacity-70"
      />
      <circle cx={x} cy={y} r={1.75} className="fill-foreground" />
    </g>
  );
}
