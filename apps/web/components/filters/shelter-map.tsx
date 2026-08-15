"use client";

import { useMemo } from "react";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  SLOVENIA_OUTLINE,
  onMap,
  project,
  type LatLon,
} from "@/lib/geo";
import {
  layoutTowns,
  wedgePath,
  type ShelterPin,
  type Town,
  type Wedge,
} from "@/lib/map-layout";
import { ANIMAL_FORMS, plural } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type { ShelterPin } from "@/lib/map-layout";

// Drawn outside the marker, for focus and for selection.
const RING_OFFSET = 3.5;

// A town holding one shelter is a plain dot; a town holding several is the same
// dot cut into a wedge each. Both are drawn by this, so the target, the ring
// and the body of a marker always agree on its shape.
function Mark({
  town,
  wedge,
  r,
  className,
}: {
  town: Town;
  wedge: Wedge;
  r: number;
  className: string;
}) {
  if (town.shelters.length === 1) {
    return <circle cx={town.x} cy={town.y} r={r} className={className} />;
  }
  return (
    <path
      d={wedgePath(town.x, town.y, r, wedge.from, wedge.to)}
      className={className}
    />
  );
}

export function ShelterMap({
  pins,
  busiest,
  selected,
  onPick,
  origin,
}: {
  pins: ShelterPin[];
  busiest: number;
  selected: string[];
  onPick: (value: string) => void;
  origin?: LatLon;
}) {
  const towns = useMemo(() => layoutTowns(pins, busiest), [pins, busiest]);

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label="Zemljevid zavetišč"
      className="h-auto w-full"
    >
      <path
        d={SLOVENIA_OUTLINE}
        className="fill-muted stroke-border"
        strokeWidth={1.5}
        strokeLinejoin="round"
        aria-hidden
      />

      {origin && onMap(origin) && <Origin at={origin} />}

      {towns.map((town) =>
        town.shelters.map((wedge) => {
          const checked = selected.includes(wedge.value);
          const dead = wedge.count === 0 && !checked;
          const tally = plural(wedge.count, ANIMAL_FORMS);
          const shared = town.shelters.length > 1;

          return (
            <g
              key={wedge.value}
              role="button"
              tabIndex={dead ? -1 : 0}
              aria-disabled={dead || undefined}
              aria-pressed={checked}
              aria-label={
                shared
                  ? `${wedge.label}, eno od ${town.shelters.length} zavetišč v kraju ${wedge.city} — ${tally}`
                  : `${wedge.label}, ${wedge.city} — ${tally}`
              }
              onClick={() => !dead && onPick(wedge.value)}
              onKeyDown={(event) => {
                if (dead) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPick(wedge.value);
                }
              }}
              className={cn(
                "group/pin outline-none",
                dead ? "pointer-events-none" : "cursor-pointer",
              )}
            >
              <title>{`${wedge.label} · ${wedge.city} · ${tally}`}</title>

              {/* Sized by the room the marker has to its nearest neighbour, so
                  it is as large as it can be without reaching into another
                  marker and taking a click meant for that one. */}
              <Mark
                town={town}
                wedge={wedge}
                r={town.hitR}
                className="fill-transparent"
              />

              <Mark
                town={town}
                wedge={wedge}
                r={town.r + RING_OFFSET}
                className={cn(
                  "fill-none stroke-foreground [stroke-width:1.25]",
                  checked ? "opacity-35" : "opacity-0",
                  "group-focus-visible/pin:opacity-100",
                )}
              />

              <Mark
                town={town}
                wedge={wedge}
                r={town.r}
                className={cn(
                  // Opacity rides on the fill alone: the stroke is what keeps
                  // two neighbouring markers legible as two, and what divides
                  // one town's wedges from each other.
                  "stroke-background transition-[fill] [stroke-linejoin:round] [stroke-width:1.25]",
                  checked
                    ? "fill-foreground"
                    : dead
                      ? "fill-foreground/15"
                      : "fill-foreground/35 group-hover/pin:fill-foreground/60",
                )}
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}

// Dashed, so it reads as "you" rather than as one more shelter.
function Origin({ at }: { at: LatLon }) {
  const { x, y } = project(at);
  return (
    <g aria-hidden>
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
