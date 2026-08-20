"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { MAP_HEIGHT, MAP_WIDTH, project, type LatLon } from "@/lib/geo";
import { cn } from "@/lib/utils";

const WIDTH = 108;
// Fits one line of title plus one of metadata, same as the old fixed height.
// Used until the real content is measured, and as the floor after.
const MIN_HEIGHT = 38;
const CARET_SIZE = 3.5;

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
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  // The card's real height depends on how many lines the title and metadata
  // wrap to, which depends on their text, so it can only be known after a
  // layout pass. Start at MIN_HEIGHT and grow to fit once measured, rather
  // than estimating line counts from character widths (fragile with
  // break-words on proportional fonts).
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const needed = Math.max(node.scrollHeight, MIN_HEIGHT);
    if (needed !== height) setHeight(needed);
  }, [title, metadata, height]);

  const onRight = x + reach + 4 + WIDTH <= MAP_WIDTH - 2;
  const left = onRight ? x + reach + 4 : x - reach - 4 - WIDTH;
  const cardX = Math.min(Math.max(left, 2), MAP_WIDTH - WIDTH - 2);
  const cardY = Math.min(
    Math.max(y - height / 2, 2),
    MAP_HEIGHT - height - 2,
  );

  // Caret sits on the card's marker-facing edge, drawn outside the
  // foreignObject as a plain path so it never gets clipped by it.
  const caretY = Math.min(Math.max(y, cardY + CARET_SIZE), cardY + height - CARET_SIZE);
  const caretTipX = onRight ? cardX : cardX + WIDTH;
  const caretBaseX = onRight ? cardX + CARET_SIZE : cardX + WIDTH - CARET_SIZE;

  return (
    <g
      aria-hidden
      className={cn(
        "pointer-events-none animate-in fade-in duration-150 motion-reduce:animate-none",
        onRight ? "slide-in-from-left-0.5" : "slide-in-from-right-0.5",
      )}
    >
      <path
        d={`M ${caretTipX} ${caretY} L ${caretBaseX} ${caretY - CARET_SIZE} L ${caretBaseX} ${caretY + CARET_SIZE} Z`}
        className="fill-popover stroke-border"
        strokeWidth={0.5}
      />
      <foreignObject x={cardX} y={cardY} width={WIDTH} height={height}>
        <div
          ref={contentRef}
          className="flex h-full flex-col justify-center rounded-ui border border-border bg-popover px-[4px] py-[2px] text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.18)]"
        >
          <span className="w-full break-words text-[5.5px] font-medium leading-[1.15]">
            {title}
          </span>
          {metadata && (
            <span className="mt-[1.5px] w-full break-words text-[4.75px] leading-[1.15] text-muted-foreground">
              {metadata}
            </span>
          )}
        </div>
      </foreignObject>
    </g>
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
