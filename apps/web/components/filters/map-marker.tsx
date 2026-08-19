"use client";

import { PawPrint } from "lucide-react";
import {
  clusterDiscPositions,
  discFitsGlyph,
  markerGeometry,
  MARKER_STROKE_WIDTH,
  MAX_CLUSTER_DISCS,
  selectionState,
  townCount,
  type Town,
} from "@/lib/map-layout";
import { cn } from "@/lib/utils";

// Exact keyboard selection stays in the list, so markers remain pointer-only.
export function Marker({
  town,
  selected,
  onPick,
  onPointerEnter,
  onPointerLeave,
  highlighted,
}: {
  town: Town;
  selected: string[];
  onPick: (values: string[]) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** The shelter is hovered in the list, so its marker reveals the hit halo
   *  and strengthens its stroke, same as pointer hover would. */
  highlighted: boolean;
}) {
  const shared = town.shelters.length > 1;
  const values = town.shelters.map((shelter) => shelter.value);
  const state = selectionState(values, selected);
  const live = townCount(town) > 0 || state !== false;
  const geometry = markerGeometry(town);

  return (
    <g
      aria-hidden
      data-marker-kind={shared ? "cluster" : "single"}
      data-marker-key={town.key}
      data-marker-live={live}
      data-marker-shelters={town.shelters.length}
      data-marker-state={
        state === true ? "selected" : state === "mixed" ? "mixed" : "idle"
      }
      data-marker-highlighted={highlighted || undefined}
      onClick={() => live && onPick(values)}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        "group/pin",
        live ? "cursor-pointer" : "pointer-events-none",
      )}
    >
      {/* The hit area grows into free space without covering another marker.
          It shows itself on hover, so the target you are aiming at is the
          target you can see. */}
      <circle
        cx={town.x}
        cy={town.y}
        r={town.hitR}
        className={cn(
          "fill-transparent transition-colors group-hover/pin:fill-foreground/8 motion-reduce:transition-none",
          highlighted && "fill-foreground/8",
        )}
      />

      {!shared ? (
        <MarkerDisc
          cx={town.x}
          cy={town.y}
          r={geometry.discRadius}
          glyphScale={1.15}
          selected={state === true}
          live={live}
          highlighted={highlighted}
        />
      ) : town.shelters.length > MAX_CLUSTER_DISCS ? (
        <CountDisc town={town} state={state} live={live} highlighted={highlighted} />
      ) : (
        <ClusterMarker
          town={town}
          selected={selected}
          live={live}
          highlighted={highlighted}
        />
      )}
    </g>
  );
}

function MarkerDisc({
  cx,
  cy,
  r,
  glyphScale,
  selected,
  live,
  discAttribute,
  shelterValue,
  highlighted,
}: {
  cx: number;
  cy: number;
  r: number;
  glyphScale: number;
  selected: boolean;
  live: boolean;
  discAttribute?: string;
  shelterValue?: string;
  highlighted?: boolean;
}) {
  const glyph = r * glyphScale;
  return (
    <g
      data-cluster-disc={discAttribute}
      data-cluster-shelter={shelterValue}
      className={cn(
        "transition-colors motion-reduce:transition-none",
        selected
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : live
            ? cn(
                "fill-background stroke-foreground/75 text-foreground/75 group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
                highlighted && "stroke-foreground text-foreground",
              )
            : "fill-background stroke-foreground/40 text-foreground/40",
      )}
    >
      <circle cx={cx} cy={cy} r={r} style={{ strokeWidth: MARKER_STROKE_WIDTH }} />
      {discFitsGlyph(r) && (
        <PawPrint
          x={cx - glyph / 2}
          y={cy - glyph / 2}
          width={glyph}
          height={glyph}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden
          className="stroke-current"
        />
      )}
    </g>
  );
}

// One disc per shelter, each carrying that shelter's own selection. The old
// cluster drew two discs whatever the town held, and lit the first of them on
// "mixed" regardless of which shelter was picked.
function ClusterMarker({
  town,
  selected,
  live,
  highlighted,
}: {
  town: Town;
  selected: string[];
  live: boolean;
  highlighted: boolean;
}) {
  const { clusterRadius } = markerGeometry(town);
  const positions = clusterDiscPositions(town);

  return town.shelters.map((shelter, index) => (
    <MarkerDisc
      key={shelter.value}
      cx={positions[index].x}
      cy={positions[index].y}
      r={clusterRadius}
      glyphScale={1.3}
      selected={selected.includes(shelter.value)}
      live={live}
      discAttribute={selected.includes(shelter.value) ? "selected" : "idle"}
      shelterValue={shelter.value}
      highlighted={highlighted}
    />
  ));
}

// Past three shelters the discs stop being readable and stop being honest, so
// the marker says the number instead.
function CountDisc({
  town,
  state,
  live,
  highlighted,
}: {
  town: Town;
  state: boolean | "mixed";
  live: boolean;
  highlighted: boolean;
}) {
  const { discRadius } = markerGeometry(town);
  return (
    <g
      data-cluster-overflow={town.shelters.length}
      className={cn(
        "transition-colors motion-reduce:transition-none",
        state === true
          ? "fill-[var(--filter-accent-strong)] stroke-[var(--filter-accent-strong)] text-background"
          : state === "mixed"
            ? "fill-[var(--filter-accent)] stroke-[var(--filter-accent-strong)] text-[var(--filter-accent-foreground)]"
            : live
              ? cn(
                  "fill-background stroke-foreground/75 text-foreground/75 group-hover/pin:stroke-foreground group-hover/pin:text-foreground",
                  highlighted && "stroke-foreground text-foreground",
                )
              : "fill-background stroke-foreground/40 text-foreground/40",
      )}
    >
      <circle
        cx={town.x}
        cy={town.y}
        r={discRadius}
        style={{ strokeWidth: MARKER_STROKE_WIDTH }}
      />
      <text
        x={town.x}
        y={town.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-current stroke-none"
        style={{ fontSize: discRadius * 1.1, fontWeight: 600 }}
      >
        {town.shelters.length}
      </text>
    </g>
  );
}
