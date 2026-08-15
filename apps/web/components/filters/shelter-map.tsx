"use client";

import {
  MAP_HEIGHT,
  MAP_WIDTH,
  SLOVENIA_OUTLINE,
  onMap,
  project,
  type LatLon,
} from "@/lib/geo";
import { ANIMAL_FORMS, plural } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type ShelterPin = {
  value: string;
  label: string;
  city: string;
  at: LatLon;
  count: number;
};

const MIN_RADIUS = 4.5;
const MAX_RADIUS = 12;

// Area tracks the count, not radius, or Ljubljana swallows the country.
function radius(count: number, busiest: number): number {
  if (busiest <= 0) return MIN_RADIUS;
  const share = Math.sqrt(Math.min(count, busiest) / busiest);
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * share;
}

type Placed = ShelterPin & { x: number; y: number; r: number };

function place(pins: ShelterPin[]): Placed[] {
  const busiest = Math.max(0, ...pins.map((pin) => pin.count));
  const towns = new Map<string, ShelterPin[]>();
  for (const pin of pins) {
    const town = `${pin.at.lat},${pin.at.lon}`;
    towns.set(town, [...(towns.get(town) ?? []), pin]);
  }

  const placed: Placed[] = [];
  for (const together of towns.values()) {
    const centre = project(together[0].at);
    const radii = together.map((pin) => radius(pin.count, busiest));
    // Two shelters in one town would otherwise stack on the same pixel, and
    // the one underneath could never be clicked.
    const spread =
      together.length > 1 ? Math.max(...radii) * 0.85 + 1.5 : 0;
    together.forEach((pin, i) => {
      const angle = (i / together.length) * Math.PI * 2 - Math.PI / 2;
      placed.push({
        ...pin,
        r: radii[i],
        x: centre.x + Math.cos(angle) * spread,
        y: centre.y + Math.sin(angle) * spread,
      });
    });
  }

  // Largest first, so a small neighbour is painted on top and stays clickable.
  return placed.sort((a, b) => b.r - a.r);
}

export function ShelterMap({
  pins,
  selected,
  onToggle,
  origin,
}: {
  pins: ShelterPin[];
  selected: string[];
  onToggle: (value: string) => void;
  origin?: LatLon;
}) {
  const placed = place(pins);

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

      {placed.map((pin) => {
        const checked = selected.includes(pin.value);
        const dead = pin.count === 0 && !checked;
        const tally = plural(pin.count, ANIMAL_FORMS);
        return (
          <g
            key={pin.value}
            role="button"
            tabIndex={dead ? -1 : 0}
            aria-disabled={dead || undefined}
            aria-pressed={checked}
            aria-label={`${pin.label}, ${pin.city} — ${tally}`}
            onClick={() => !dead && onToggle(pin.value)}
            onKeyDown={(event) => {
              if (dead) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggle(pin.value);
              }
            }}
            className={cn(
              "group/pin outline-none",
              dead ? "pointer-events-none" : "cursor-pointer",
            )}
          >
            <title>{`${pin.label} · ${pin.city} · ${tally}`}</title>

            {/* A 5px dot is not a tap target; this one is, and it is invisible. */}
            <circle
              cx={pin.x}
              cy={pin.y}
              r={Math.max(pin.r + 4, 9)}
              className="fill-transparent"
            />
            <circle
              cx={pin.x}
              cy={pin.y}
              r={pin.r + 3.5}
              strokeWidth={1.25}
              className={cn(
                "fill-none stroke-foreground",
                checked ? "opacity-35" : "opacity-0",
                "group-focus-visible/pin:opacity-100",
              )}
            />
            <circle
              cx={pin.x}
              cy={pin.y}
              r={pin.r}
              strokeWidth={1.25}
              className={cn(
                // Opacity rides on the fill alone: the stroke is what keeps
                // two overlapping dots legible as two.
                "stroke-background transition-[fill]",
                checked
                  ? "fill-foreground"
                  : dead
                    ? "fill-foreground/15"
                    : "fill-foreground/35 group-hover/pin:fill-foreground/60",
              )}
            />
          </g>
        );
      })}
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
